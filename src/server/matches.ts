import { createServerFn } from '@tanstack/react-start';
import { eq, desc } from 'drizzle-orm';
import { createDb } from '../db';
import { matches as matchesTable } from '../db/schema';
import type { MatchWithHighlights } from '../db/schema';
import { sortHighlightsChronologically } from './parser-helpers';
import type { CloudflareEnv } from '../types/env';

export interface DayMatchesResult {
  date: string;
  matches: MatchWithHighlights[];
}

/**
 * Queries Cloudflare D1 via Drizzle for matches on a given date,
 * sorting highlights chronologically by match minute.
 */
export async function getMatchesForDate(
  db: ReturnType<typeof createDb>,
  date: string,
): Promise<MatchWithHighlights[]> {
  const rows = await db.query.matches.findMany({
    where: eq(matchesTable.matchDate, date),
    with: {
      highlights: true,
    },
    orderBy: [desc(matchesTable.updatedAt)],
  });

  return rows.map((match) => ({
    ...match,
    highlights: sortHighlightsChronologically(match.highlights),
  }));
}

interface ServerFnHandlerContext {
  data: string;
  context?: {
    env?: CloudflareEnv;
  };
}

export function validateMatchDateParam(date: string): string {
  const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
  if (!ISO_DATE_REGEX.test(date)) {
    throw new Error(
      `Invalid date parameter: "${date}". Expected format: YYYY-MM-DD.`,
    );
  }
  return date;
}

export async function handleFetchMatches(
  date: string,
  env?: CloudflareEnv,
): Promise<DayMatchesResult> {
  console.log(`[QUERY:MATCHES] Fetching matches for ${date}`);

  if (!env?.DB) {
    throw new Error('Cloudflare D1 database binding is unavailable');
  }

  const db = createDb(env.DB);
  const matches = await getMatchesForDate(db, date);

  return {
    date,
    matches,
  };
}

/**
 * Server Function: Fetches all soccer matches and chronologically ordered highlights
 * for a specific UTC date from Cloudflare D1.
 */
export const fetchMatchesForDate = createServerFn({ method: 'GET' })
  .validator(validateMatchDateParam)
  .handler(
    async ({
      data: date,
      context,
    }: ServerFnHandlerContext): Promise<DayMatchesResult> => {
      return handleFetchMatches(date, context?.env);
    },
  );
