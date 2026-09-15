import type { D1Database } from '@cloudflare/workers-types';
import type { BatchItem } from 'drizzle-orm/batch';
import { createDb } from '../db';
import * as schema from '../db/schema';
import { fetchDailyFixtures, type ApiSportsFixtureItem } from './api-football';

export interface FixtureSyncResult {
  date: string;
  totalReceived: number;
  supportedFound: number;
  persistedCount: number;
  errors: string[];
}

type SQLiteBatchItem = BatchItem<'sqlite'>;

/**
 * Persists an array of API-Sports fixtures into Cloudflare D1 using chunked batch upserts.
 * Fully idempotent on conflict of external_id.
 */
export async function persistFixtures(
  d1: D1Database,
  fixtures: ApiSportsFixtureItem[],
): Promise<{ persistedCount: number; errors: string[] }> {
  if (fixtures.length === 0) {
    return { persistedCount: 0, errors: [] };
  }

  const db = createDb(d1);
  const now = Date.now();
  const statements: SQLiteBatchItem[] = [];

  for (const item of fixtures) {
    const matchDate = new Date(item.fixture.date).toISOString().slice(0, 10);
    const scoreHome = item.goals?.home ?? null;
    const scoreAway = item.goals?.away ?? null;

    const matchRecord: schema.NewMatch = {
      id: String(item.fixture.id),
      externalId: item.fixture.id,
      matchDate,
      teamHome: item.teams.home.name.trim(),
      teamAway: item.teams.away.name.trim(),
      competition: item.league.name.trim(),
      leagueLogo: item.league.logo ?? null,
      teamHomeLogo: item.teams.home.logo ?? null,
      teamAwayLogo: item.teams.away.logo ?? null,
      kickoffTime: item.fixture.timestamp * 1000,
      status: item.fixture.status.short ?? 'NS',
      scoreHome,
      scoreAway,
      createdAt: now,
      updatedAt: now,
    };

    statements.push(
      db
        .insert(schema.matches)
        .values(matchRecord)
        .onConflictDoUpdate({
          target: schema.matches.externalId,
          set: {
            matchDate: matchRecord.matchDate,
            teamHome: matchRecord.teamHome,
            teamAway: matchRecord.teamAway,
            competition: matchRecord.competition,
            leagueLogo: matchRecord.leagueLogo,
            teamHomeLogo: matchRecord.teamHomeLogo,
            teamAwayLogo: matchRecord.teamAwayLogo,
            kickoffTime: matchRecord.kickoffTime,
            status: matchRecord.status,
            scoreHome: matchRecord.scoreHome,
            scoreAway: matchRecord.scoreAway,
            updatedAt: now,
          },
        }),
    );
  }

  const errors: string[] = [];
  let persistedCount = 0;
  const CHUNK_SIZE = 30;

  for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
    const chunk = statements.slice(i, i + CHUNK_SIZE);
    if (chunk.length === 0) continue;

    try {
      // SAFETY: chunk length is verified > 0 so non-empty tuple assertion satisfies D1 batch contract
      await db.batch(chunk as [SQLiteBatchItem, ...SQLiteBatchItem[]]);
      persistedCount += chunk.length;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`D1 fixture batch upsert failed: ${message}`);
    }
  }

  return { persistedCount, errors };
}

/**
 * Fetches official fixtures for a given date from API-Sports,
 * filters for the 14 supported leagues, and upserts rows in Cloudflare D1.
 * Monolithic sync for backward compatibility (used by CLI and direct callers).
 */
export async function syncDailyFixtures(
  d1: D1Database,
  apiKey: string,
  targetDate?: string,
): Promise<FixtureSyncResult> {
  const date = targetDate || new Date().toISOString().slice(0, 10);
  const fetchResult = await fetchDailyFixtures(apiKey, date);
  const persistResult = await persistFixtures(
    d1,
    fetchResult.supportedFixtures,
  );

  return {
    date,
    totalReceived: fetchResult.totalReceived,
    supportedFound: fetchResult.supportedFound,
    persistedCount: persistResult.persistedCount,
    errors: [...fetchResult.errors, ...persistResult.errors],
  };
}
