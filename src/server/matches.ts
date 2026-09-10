import { createServerFn } from '@tanstack/react-start';
import { getCookie } from '@tanstack/react-start/server';
import { z } from 'zod';
import {
  eq,
  desc,
  asc,
  gte,
  lte,
  and,
  or,
  isNull,
  isNotNull,
} from 'drizzle-orm';
import { createDb } from '../db';
import { matches as matchesTable } from '../db/schema';
import type { MatchWithHighlights } from '../db/schema';
import { sortHighlightsChronologically } from './parser-helpers';
import { getZonedDayRange } from '../lib/date-utils';
import type { CloudflareEnv } from '../types/env';

export interface DayMatchesResult {
  date: string;
  matches: MatchWithHighlights[];
}

export interface FetchMatchesInput {
  date: string;
  tz?: string;
}

/**
 * Queries Cloudflare D1 via Drizzle for matches on a given calendar date in a given timezone.
 * Uses exact UTC millisecond bounds [startMs, endMs] to ensure matches are grouped
 * by the viewer's local calendar day.
 */
export async function getMatchesForDate(
  db: ReturnType<typeof createDb>,
  date: string,
  timeZone?: string,
): Promise<MatchWithHighlights[]> {
  const tz = timeZone || 'UTC';
  const { startMs, endMs } = getZonedDayRange(date, tz);

  const rows = await db.query.matches.findMany({
    where: or(
      and(
        isNotNull(matchesTable.kickoffTime),
        gte(matchesTable.kickoffTime, startMs),
        lte(matchesTable.kickoffTime, endMs),
      ),
      and(isNull(matchesTable.kickoffTime), eq(matchesTable.matchDate, date)),
    ),
    with: {
      highlights: true,
    },
    orderBy: [asc(matchesTable.kickoffTime), desc(matchesTable.updatedAt)],
  });

  return rows.map((match) => ({
    ...match,
    highlights: sortHighlightsChronologically(match.highlights),
  }));
}

interface ServerFnHandlerContext {
  data: FetchMatchesInput;
  context?: {
    env?: CloudflareEnv;
  };
}

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const MatchDateStringSchema = z
  .string()
  .regex(ISO_DATE_REGEX, 'Invalid date parameter. Expected format: YYYY-MM-DD.')
  .transform((date) => ({ date }));

const MatchQueryObjectSchema = z.object({
  date: z
    .string()
    .regex(
      ISO_DATE_REGEX,
      'Invalid date parameter. Expected format: YYYY-MM-DD.',
    ),
  tz: z.string().trim().min(1).optional(),
});

export type RawMatchQuery =
  string | { date?: string; tz?: string } | null | undefined;

export function validateFetchMatchesInput(
  query: RawMatchQuery,
): FetchMatchesInput {
  if (query === null || query === undefined) {
    throw new Error('Invalid query parameters for match fetch');
  }

  const stringCheck = z.string().safeParse(query);
  if (stringCheck.success) {
    const parsed = MatchDateStringSchema.safeParse(query);
    if (!parsed.success) {
      throw new Error(
        parsed.error.issues[0]?.message ?? 'Invalid date parameter',
      );
    }
    return parsed.data;
  }

  const objectParsed = MatchQueryObjectSchema.safeParse(query);
  if (objectParsed.success) {
    return objectParsed.data;
  }

  const dateIssue = objectParsed.error.issues.find((issue) =>
    issue.path.includes('date'),
  );
  if (dateIssue) {
    throw new Error(dateIssue.message);
  }

  throw new Error('Invalid query parameters for match fetch');
}

export function validateMatchDateParam(dateParam: RawMatchQuery): string {
  return validateFetchMatchesInput(dateParam).date;
}

export async function handleFetchMatches(
  input: RawMatchQuery,
  env?: CloudflareEnv,
): Promise<DayMatchesResult> {
  const { date, tz: paramTz } = validateFetchMatchesInput(input);

  let cookieTz: string | undefined;
  try {
    cookieTz = getCookie('tz');
  } catch {
    cookieTz = undefined;
  }

  const effectiveTz = paramTz || cookieTz || 'UTC';
  console.log(
    `[QUERY:MATCHES] Fetching matches for ${date} in timezone ${effectiveTz}`,
  );

  if (!env?.DB) {
    throw new Error('Cloudflare D1 database binding is unavailable');
  }

  const db = createDb(env.DB);
  const matches = await getMatchesForDate(db, date, effectiveTz);

  return {
    date,
    matches,
  };
}

/**
 * Server Function: Fetches all soccer matches and chronologically ordered highlights
 * for a specific date from Cloudflare D1, respecting the viewer's local timezone.
 */
export const fetchMatchesForDate = createServerFn({ method: 'GET' })
  .validator((query: RawMatchQuery) => validateFetchMatchesInput(query))
  .handler(
    async ({
      data,
      context,
    }: ServerFnHandlerContext): Promise<DayMatchesResult> => {
      return handleFetchMatches(data, context?.env);
    },
  );
