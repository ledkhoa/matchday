import { z } from 'zod';

export const ApiSportsStatusSchema = z.object({
  long: z.string().optional(),
  short: z.string().nullable().optional(),
  elapsed: z.number().nullable().optional(),
});

export const ApiSportsFixtureDetailsSchema = z.object({
  id: z.number().int().positive(),
  referee: z.string().nullable().optional(),
  timezone: z.string().optional(),
  date: z.string(), // ISO 8601 string
  timestamp: z.number(), // Epoch seconds
  status: ApiSportsStatusSchema,
});

export const ApiSportsLeagueDetailsSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  country: z.string().optional(),
  logo: z.url().or(z.string()).nullable().optional(),
  season: z.number().optional(),
  round: z.string().optional(),
});

export const ApiSportsTeamDetailsSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  logo: z.url().or(z.string()).nullable().optional(),
  winner: z.boolean().nullable().optional(),
});

export const ApiSportsGoalsDetailsSchema = z.object({
  home: z.number().nullable().optional(),
  away: z.number().nullable().optional(),
});

export const ApiSportsFixtureItemSchema = z.object({
  fixture: ApiSportsFixtureDetailsSchema,
  league: ApiSportsLeagueDetailsSchema,
  teams: z.object({
    home: ApiSportsTeamDetailsSchema,
    away: ApiSportsTeamDetailsSchema,
  }),
  goals: ApiSportsGoalsDetailsSchema.optional(),
});

export const ApiSportsResponseSchema = z.object({
  get: z.string().optional(),
  parameters: z
    .union([z.record(z.string(), z.string()), z.array(z.unknown())])
    .optional(),
  errors: z
    .union([z.array(z.string()), z.record(z.string(), z.string())])
    .optional(),
  results: z.number().optional().default(0),
  response: z.array(ApiSportsFixtureItemSchema).optional().default([]),
});

export type ApiSportsFixtureItem = z.infer<typeof ApiSportsFixtureItemSchema>;
export type ApiSportsResponse = z.infer<typeof ApiSportsResponseSchema>;

export const SUPPORTED_LEAGUES: ReadonlyMap<number, string> = new Map([
  [39, 'Premier League'],
  [40, 'Championship'],
  [45, 'FA Cup'],
  [48, 'League Cup'],
  [2, 'UEFA Champions League'],
  [3, 'UEFA Europa League'],
  [848, 'UEFA Conference League'],
  [140, 'La Liga'],
  [143, 'Copa del Rey'],
  [78, 'Bundesliga'],
  [81, 'DFB-Pokal'],
  [135, 'Serie A'],
  [137, 'Coppa Italia'],
  [61, 'Ligue 1'],
  [253, 'Major League Soccer'],
]);

export const SUPPORTED_LEAGUE_IDS = new Set<number>(SUPPORTED_LEAGUES.keys());

export interface FetchFixturesResult {
  allFixtures: ApiSportsFixtureItem[];
  supportedFixtures: ApiSportsFixtureItem[];
  totalReceived: number;
  supportedFound: number;
  errors: string[];
}

export const API_SPORTS_BASE_URL = 'https://v3.football.api-sports.io';

/**
 * Fetches official daily fixtures from API-Sports v3 for a given UTC calendar date.
 * Validates the response via Zod v4 and filters for the supported competitions.
 */
export async function fetchDailyFixtures(
  apiKey: string,
  targetDate: string,
  baseUrl = API_SPORTS_BASE_URL,
): Promise<FetchFixturesResult> {
  const result: FetchFixturesResult = {
    allFixtures: [],
    supportedFixtures: [],
    totalReceived: 0,
    supportedFound: 0,
    errors: [],
  };

  const url = `${baseUrl}/fixtures?date=${targetDate}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-apisports-key': apiKey,
        Accept: 'application/json',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(
      `Network error fetching API-Football fixtures: ${message}`,
    );
    return result;
  }

  if (!response.ok) {
    result.errors.push(
      `API-Football HTTP error: ${response.status} ${response.statusText}`,
    );
    return result;
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(
      `Failed to parse API-Football JSON response: ${message}`,
    );
    return result;
  }

  const parseResult = ApiSportsResponseSchema.safeParse(json);
  if (!parseResult.success) {
    result.errors.push(
      `API-Football schema validation error: ${parseResult.error.message}`,
    );
    return result;
  }

  const data = parseResult.data;

  // Extract API-Sports structured errors if present
  if (data.errors) {
    if (Array.isArray(data.errors)) {
      if (data.errors.length > 0) {
        result.errors.push(...data.errors);
      }
    } else {
      const entries = Object.entries(data.errors);
      if (entries.length > 0) {
        for (const [key, msg] of entries) {
          result.errors.push(`API-Football error [${key}]: ${msg}`);
        }
      }
    }
  }

  result.allFixtures = data.response;
  result.totalReceived = data.response.length;

  result.supportedFixtures = data.response.filter((item) =>
    SUPPORTED_LEAGUE_IDS.has(item.league.id),
  );
  result.supportedFound = result.supportedFixtures.length;

  return result;
}

// Re-export syncDailyFixtures and types for callers importing from api-football
export { syncDailyFixtures, type FixtureSyncResult } from './fixtures-sync';
