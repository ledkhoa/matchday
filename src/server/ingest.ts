import type { D1Database } from '@cloudflare/workers-types';
import { and, gte, lte, eq, sql, inArray } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { createDb } from '../db';
import * as schema from '../db/schema';
import { parseRedditTitle, generateGoalFingerprint } from '../lib/parser';
import { matchPostToFixture } from '../lib/matcher';
import { resolveVideoEmbed } from '../lib/video';
import { fetchRedditPosts, type RedditClientConfig } from './reddit';

export interface IngestResult {
  totalFetched: number;
  parsedCount: number;
  persistedCount: number;
  skippedCount: number;
  errors: string[];
}

type SQLiteBatchItem = BatchItem<'sqlite'>;

export async function ingestRedditHighlights(
  d1: D1Database,
  config?: RedditClientConfig,
): Promise<IngestResult> {
  const db = createDb(d1);
  const result: IngestResult = {
    totalFetched: 0,
    parsedCount: 0,
    persistedCount: 0,
    skippedCount: 0,
    errors: [],
  };

  let posts;
  try {
    posts = await fetchRedditPosts(config);
    result.totalFetched = posts.length;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Failed to fetch Reddit posts: ${errorMsg}`);
    return result;
  }

  if (posts.length === 0) {
    return result;
  }

  // 1. Calculate temporal query window: [minDate - 1 day, maxDate + 1 day]
  let minUtc = Infinity;
  let maxUtc = -Infinity;
  for (const post of posts) {
    if (post.createdUtc < minUtc) minUtc = post.createdUtc;
    if (post.createdUtc > maxUtc) maxUtc = post.createdUtc;
  }

  const minDateStr = new Date((minUtc - 86400) * 1000)
    .toISOString()
    .slice(0, 10);
  const maxDateStr = new Date((maxUtc + 86400) * 1000)
    .toISOString()
    .slice(0, 10);

  // 2. Query candidate fixtures from D1 within the temporal window
  let candidates: Array<{
    id: string;
    matchDate: string;
    teamHome: string;
    teamAway: string;
    externalId: number | null;
    competition: string | null;
  }> = [];

  try {
    candidates = await db
      .select({
        id: schema.matches.id,
        matchDate: schema.matches.matchDate,
        teamHome: schema.matches.teamHome,
        teamAway: schema.matches.teamAway,
        externalId: schema.matches.externalId,
        competition: schema.matches.competition,
      })
      .from(schema.matches)
      .where(
        and(
          gte(schema.matches.matchDate, minDateStr),
          lte(schema.matches.matchDate, maxDateStr),
        ),
      );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Failed to query candidate fixtures: ${errorMsg}`);
    return result;
  }

  // Fetch existing goal fingerprints for candidate fixtures to prevent duplicates across runs
  const existingFingerprints = new Set<string>();
  if (candidates.length > 0) {
    try {
      const candidateIds = candidates.map((c) => c.id);
      const existingRows = await db
        .select({ fingerprint: schema.highlights.goalFingerprint })
        .from(schema.highlights)
        .where(inArray(schema.highlights.matchId, candidateIds));

      for (const row of existingRows) {
        if (row.fingerprint) {
          existingFingerprints.add(row.fingerprint);
        }
      }
    } catch {
      // Non-fatal if highlights table is empty
    }
  }

  const now = Date.now();
  const highlightInsertMap = new Map<string, schema.NewHighlight>();
  const touchedMatchIds = new Set<string>();
  const inBatchFingerprints = new Set<string>();

  // 3. Process each Reddit post
  for (const post of posts) {
    const parsed = parseRedditTitle(post.title);
    if (!parsed) {
      result.skippedCount++;
      continue;
    }

    result.parsedCount++;

    const postDateStr = new Date(post.createdUtc * 1000)
      .toISOString()
      .slice(0, 10);

    // Match parsed team names against candidate official fixtures
    const matchResult = matchPostToFixture(
      parsed.teamHome,
      parsed.teamAway,
      candidates,
      postDateStr,
    );

    // If post cannot be matched to an official tracked fixture, discard it
    if (!matchResult) {
      result.skippedCount++;
      continue;
    }

    const canonicalMatchId = matchResult.fixture.id;

    // Invert scores if matcher detected inverted orientation (e.g. "Away [1] - 0 Home")
    const scoreHome = matchResult.inverted
      ? parsed.scoreAway
      : parsed.scoreHome;
    const scoreAway = matchResult.inverted
      ? parsed.scoreHome
      : parsed.scoreAway;

    // Generate goal fingerprint using canonical match ID
    const fingerprint = generateGoalFingerprint(
      canonicalMatchId,
      parsed.minute,
      scoreHome,
      scoreAway,
    );

    // Skip if another post for the exact same goal was already ingested or exists in D1
    if (fingerprint) {
      if (
        inBatchFingerprints.has(fingerprint) ||
        existingFingerprints.has(fingerprint)
      ) {
        result.skippedCount++;
        continue;
      }
      inBatchFingerprints.add(fingerprint);
    }

    const media = resolveVideoEmbed(post.url);
    touchedMatchIds.add(canonicalMatchId);

    const highlightRecord: schema.NewHighlight = {
      id: post.name,
      matchId: canonicalMatchId,
      title: post.title,
      scoreHome,
      scoreAway,
      scorer: parsed.scorer,
      minute: parsed.minute,
      tag: parsed.tag,
      embedUrl: media.embedUrl,
      sourceUrl: post.url,
      redditUrl: post.permalink,
      goalFingerprint: fingerprint,
      postedAt: Math.floor(post.createdUtc * 1000),
    };

    highlightInsertMap.set(post.name, highlightRecord);
  }

  if (highlightInsertMap.size === 0 && touchedMatchIds.size === 0) {
    return result;
  }

  // 4. Build batch statements: Highlights insert/update & Matches touched updatedAt
  const statements: SQLiteBatchItem[] = [];

  for (const highlight of highlightInsertMap.values()) {
    statements.push(
      db
        .insert(schema.highlights)
        .values(highlight)
        .onConflictDoUpdate({
          target: schema.highlights.id,
          set: {
            embedUrl: sql`coalesce(${highlight.embedUrl}, ${schema.highlights.embedUrl})`,
          },
        }),
    );
  }

  for (const matchId of touchedMatchIds) {
    statements.push(
      db
        .update(schema.matches)
        .set({ updatedAt: now })
        .where(eq(schema.matches.id, matchId)),
    );
  }

  // Execute in chunks to respect Cloudflare D1 batch limits
  const CHUNK_SIZE = 30;
  for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
    const chunk = statements.slice(i, i + CHUNK_SIZE);
    if (chunk.length === 0) continue;

    try {
      // SAFETY: chunk length is verified > 0 so non-empty tuple assertion satisfies D1 batch contract
      await db.batch(chunk as [SQLiteBatchItem, ...SQLiteBatchItem[]]);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors.push(`D1 batch execution failed: ${errorMsg}`);
    }
  }

  result.persistedCount = highlightInsertMap.size;
  return result;
}
