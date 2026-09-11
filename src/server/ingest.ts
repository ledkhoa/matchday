import type { D1Database } from '@cloudflare/workers-types';
import { and, gte, lte, eq, sql, inArray } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { createDb } from '../db';
import * as schema from '../db/schema';
import {
  parseRedditTitle,
  generateGoalFingerprint,
  isNonSeniorSquad,
} from '../lib/parser';
import { matchPostToFixture } from '../lib/matcher';
import { resolveVideoEmbed } from '../lib/video';
import { fetchRedditPosts, type RedditClientConfig } from './reddit';

export const KICKOFF_WINDOW_BEFORE_MS = 15 * 60 * 1000; // 15 minutes before kickoff
export const KICKOFF_WINDOW_AFTER_MS = 4 * 60 * 60 * 1000; // 4 hours after kickoff

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
    kickoffTime: number | null;
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
        kickoffTime: schema.matches.kickoffTime,
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

    // Reject non-senior (youth, reserve, women) match posts
    if (
      isNonSeniorSquad(parsed.teamHome) ||
      isNonSeniorSquad(parsed.teamAway) ||
      isNonSeniorSquad(post.title)
    ) {
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

    // Validate kickoff time window (15 mins before kickoff to 4 hours after)
    const postTimeMs = post.createdUtc * 1000;
    if (
      matchResult.fixture.kickoffTime != null &&
      (postTimeMs <
        matchResult.fixture.kickoffTime - KICKOFF_WINDOW_BEFORE_MS ||
        postTimeMs > matchResult.fixture.kickoffTime + KICKOFF_WINDOW_AFTER_MS)
    ) {
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

export interface ActiveMatchInfo {
  id: string;
  matchDate: string;
  teamHome: string;
  teamAway: string;
  kickoffTime: number | null;
  status: string | null;
}

export interface ActiveMatchWindowResult {
  hasActiveMatches: boolean;
  activeMatchCount: number;
  activeMatches: ActiveMatchInfo[];
  nextMatch: ActiveMatchInfo | null;
}

const INACTIVE_STATUSES = new Set(['PST', 'CANC', 'ABD', 'AWD', 'WO']);

/**
 * Checks Cloudflare D1 for any matches whose kickoff window is currently active.
 * A match is active if the reference time falls between 15 minutes before kickoff
 * and 4 hours after kickoff, excluding postponed or cancelled fixtures.
 */
export async function hasActiveMatchWindow(
  d1: D1Database,
  referenceTimeMs?: number,
): Promise<ActiveMatchWindowResult> {
  const db = createDb(d1);
  const nowMs = referenceTimeMs ?? Date.now();

  // Range covers yesterday through tomorrow in UTC to account for match windows crossing midnight
  const minDateStr = new Date(nowMs - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const maxDateStr = new Date(nowMs + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const todayStr = new Date(nowMs).toISOString().slice(0, 10);

  let candidateMatches: ActiveMatchInfo[] = [];
  try {
    candidateMatches = await db
      .select({
        id: schema.matches.id,
        matchDate: schema.matches.matchDate,
        kickoffTime: schema.matches.kickoffTime,
        status: schema.matches.status,
        teamHome: schema.matches.teamHome,
        teamAway: schema.matches.teamAway,
      })
      .from(schema.matches)
      .where(
        and(
          gte(schema.matches.matchDate, minDateStr),
          lte(schema.matches.matchDate, maxDateStr),
        ),
      );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[GAME_HOURS] Failed to query candidate matches: ${message}`);
    return {
      hasActiveMatches: false,
      activeMatchCount: 0,
      activeMatches: [],
      nextMatch: null,
    };
  }

  const activeMatches: ActiveMatchInfo[] = [];
  let nextMatch: ActiveMatchInfo | null = null;
  let minFutureKickoff = Infinity;

  for (const match of candidateMatches) {
    if (match.status && INACTIVE_STATUSES.has(match.status.toUpperCase())) {
      continue;
    }

    if (match.kickoffTime != null) {
      const windowStart = match.kickoffTime - KICKOFF_WINDOW_BEFORE_MS;
      const windowEnd = match.kickoffTime + KICKOFF_WINDOW_AFTER_MS;

      if (nowMs >= windowStart && nowMs <= windowEnd) {
        activeMatches.push(match);
      } else if (
        match.kickoffTime > nowMs &&
        match.kickoffTime < minFutureKickoff
      ) {
        minFutureKickoff = match.kickoffTime;
        nextMatch = match;
      }
    } else if (match.matchDate === todayStr) {
      // Defensive fallback if kickoffTime is null for a match scheduled today:
      // consider active during global soccer match hours (08:00 - 23:00 UTC)
      const currentUtcHour = new Date(nowMs).getUTCHours();
      if (currentUtcHour >= 8 && currentUtcHour <= 23) {
        activeMatches.push(match);
      }
    }
  }

  return {
    hasActiveMatches: activeMatches.length > 0,
    activeMatchCount: activeMatches.length,
    activeMatches,
    nextMatch,
  };
}
