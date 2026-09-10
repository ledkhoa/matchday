import type { D1Database } from '@cloudflare/workers-types';
import type { BatchItem } from 'drizzle-orm/batch';
import { createDb } from '../db';
import * as schema from '../db/schema';
import { fetchDailyFixtures } from './api-football';

export interface FixtureSyncResult {
  date: string;
  totalReceived: number;
  supportedFound: number;
  persistedCount: number;
  errors: string[];
}

type SQLiteBatchItem = BatchItem<'sqlite'>;

/**
 * Fetches official fixtures for a given date from API-Sports,
 * filters for the 14 supported leagues, and upserts rows in Cloudflare D1.
 */
export async function syncDailyFixtures(
  d1: D1Database,
  apiKey: string,
  targetDate?: string,
): Promise<FixtureSyncResult> {
  const date = targetDate || new Date().toISOString().slice(0, 10);
  const result: FixtureSyncResult = {
    date,
    totalReceived: 0,
    supportedFound: 0,
    persistedCount: 0,
    errors: [],
  };

  const fetchResult = await fetchDailyFixtures(apiKey, date);
  result.totalReceived = fetchResult.totalReceived;
  result.supportedFound = fetchResult.supportedFound;
  result.errors.push(...fetchResult.errors);

  if (fetchResult.supportedFixtures.length === 0) {
    return result;
  }

  const db = createDb(d1);
  const now = Date.now();

  const statements: SQLiteBatchItem[] = [];

  for (const item of fetchResult.supportedFixtures) {
    const matchDate = new Date(item.fixture.date).toISOString().slice(0, 10);
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
            updatedAt: now,
          },
        }),
    );
  }

  const CHUNK_SIZE = 30;
  for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
    const chunk = statements.slice(i, i + CHUNK_SIZE);
    if (chunk.length === 0) continue;

    try {
      // SAFETY: chunk length is verified > 0 so non-empty tuple assertion satisfies D1 batch contract
      await db.batch(chunk as [SQLiteBatchItem, ...SQLiteBatchItem[]]);
      result.persistedCount += chunk.length;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`D1 fixture batch upsert failed: ${message}`);
    }
  }

  return result;
}
