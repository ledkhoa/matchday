import type { D1Database } from '@cloudflare/workers-types';
import { sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { createDb } from '../db';
import * as schema from '../db/schema';
import { parseRedditTitle, generateMatchId } from '../lib/parser';
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

  const now = Date.now();
  const matchInsertMap = new Map<string, schema.NewMatch>();
  const highlightInsertMap = new Map<string, schema.NewHighlight>();
  const touchedMatchIds = new Set<string>();

  for (const post of posts) {
    const parsed = parseRedditTitle(post.title);
    if (!parsed) {
      result.skippedCount++;
      continue;
    }

    result.parsedCount++;

    const media = resolveVideoEmbed(post.url);
    const postDate = new Date(post.createdUtc * 1000);
    const matchDate = postDate.toISOString().slice(0, 10);
    const matchId = generateMatchId(
      matchDate,
      parsed.teamHome,
      parsed.teamAway,
    );

    if (!matchInsertMap.has(matchId)) {
      matchInsertMap.set(matchId, {
        id: matchId,
        matchDate,
        teamHome: parsed.teamHome,
        teamAway: parsed.teamAway,
        createdAt: now,
        updatedAt: now,
      });
    }

    touchedMatchIds.add(matchId);

    const highlightRecord: schema.NewHighlight = {
      id: post.name, // e.g. "t3_xxxxxx"
      matchId,
      title: post.title,
      scoreHome: parsed.scoreHome,
      scoreAway: parsed.scoreAway,
      scorer: parsed.scorer,
      minute: parsed.minute,
      tag: parsed.tag,
      embedUrl: media.embedUrl,
      sourceUrl: post.url,
      redditUrl: post.permalink,
      redditScore: post.score,
      postedAt: Math.floor(post.createdUtc * 1000),
    };

    highlightInsertMap.set(post.name, highlightRecord);
  }

  if (matchInsertMap.size === 0 && highlightInsertMap.size === 0) {
    return result;
  }

  // Build batch statements
  const statements: SQLiteBatchItem[] = [];

  // 1. Matches: INSERT OR IGNORE
  for (const match of matchInsertMap.values()) {
    statements.push(
      db.insert(schema.matches).values(match).onConflictDoNothing(),
    );
  }

  // 2. Highlights: INSERT OR ON CONFLICT UPDATE reddit_score & embed_url
  for (const highlight of highlightInsertMap.values()) {
    statements.push(
      db
        .insert(schema.highlights)
        .values(highlight)
        .onConflictDoUpdate({
          target: schema.highlights.id,
          set: {
            redditScore: highlight.redditScore,
            embedUrl: sql`coalesce(${highlight.embedUrl}, ${schema.highlights.embedUrl})`,
          },
        }),
    );
  }

  // 3. Touch updatedAt for matches containing new/updated highlights
  for (const matchId of touchedMatchIds) {
    statements.push(
      db
        .update(schema.matches)
        .set({ updatedAt: now })
        .where(sql`${schema.matches.id} = ${matchId}`),
    );
  }

  // Execute in manageable chunks to respect Cloudflare D1 batch thresholds
  const CHUNK_SIZE = 30;
  for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
    const chunk = statements.slice(i, i + CHUNK_SIZE);
    if (chunk.length === 0) {
      continue;
    }
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
