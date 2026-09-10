import { describe, it, expect, afterEach } from 'bun:test';
import {
  fetchDailyFixtures,
  SUPPORTED_LEAGUES,
  SUPPORTED_LEAGUE_IDS,
} from './api-football';

function createMockFetch(
  handler: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>,
): typeof fetch {
  return Object.assign(
    (input: string | URL | Request, init?: RequestInit) => handler(input, init),
    { preconnect: () => {} },
  );
}

describe('fetchDailyFixtures', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('correctly tracks exactly 14 supported leagues', () => {
    expect(SUPPORTED_LEAGUES.size).toBe(14);
    expect(SUPPORTED_LEAGUE_IDS.size).toBe(14);

    // Verify key leagues are tracked
    expect(SUPPORTED_LEAGUES.get(39)).toBe('Premier League');
    expect(SUPPORTED_LEAGUES.get(2)).toBe('UEFA Champions League');
    expect(SUPPORTED_LEAGUES.get(140)).toBe('La Liga');
    expect(SUPPORTED_LEAGUES.get(78)).toBe('Bundesliga');
    expect(SUPPORTED_LEAGUES.get(135)).toBe('Serie A');
    expect(SUPPORTED_LEAGUES.get(61)).toBe('Ligue 1');
    expect(SUPPORTED_LEAGUES.get(253)).toBe('Major League Soccer');
  });

  it('successfully fetches and filters fixtures for supported leagues', async () => {
    let capturedHeaders: Headers | undefined;
    let capturedUrl = '';

    globalThis.fetch = createMockFetch(async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);

      return new Response(
        JSON.stringify({
          get: 'fixtures',
          parameters: { date: '2026-09-10' },
          errors: [],
          results: 3,
          response: [
            {
              fixture: {
                id: 1001,
                date: '2026-09-10T19:00:00+00:00',
                timestamp: 1789066800,
                status: { short: 'NS', long: 'Not Started' },
              },
              league: {
                id: 39,
                name: 'Premier League',
                logo: 'https://media.api-sports.io/football/leagues/39.png',
              },
              teams: {
                home: {
                  id: 33,
                  name: 'Manchester United',
                  logo: 'https://media.api-sports.io/football/teams/33.png',
                },
                away: {
                  id: 40,
                  name: 'Liverpool',
                  logo: 'https://media.api-sports.io/football/teams/40.png',
                },
              },
            },
            {
              fixture: {
                id: 1002,
                date: '2026-09-10T20:00:00+00:00',
                timestamp: 1789070400,
                status: { short: 'FT', long: 'Match Finished' },
              },
              league: {
                id: 999, // Unsupported league
                name: 'Unknown Regional Cup',
                logo: null,
              },
              teams: {
                home: { id: 80, name: 'Team A', logo: null },
                away: { id: 81, name: 'Team B', logo: null },
              },
            },
            {
              fixture: {
                id: 1003,
                date: '2026-09-10T21:00:00+00:00',
                timestamp: 1789074000,
                status: { short: '1H', long: 'First Half' },
              },
              league: {
                id: 140,
                name: 'La Liga',
                logo: 'https://media.api-sports.io/football/leagues/140.png',
              },
              teams: {
                home: {
                  id: 541,
                  name: 'Real Madrid',
                  logo: 'https://media.api-sports.io/football/teams/541.png',
                },
                away: {
                  id: 529,
                  name: 'Barcelona',
                  logo: 'https://media.api-sports.io/football/teams/529.png',
                },
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const res = await fetchDailyFixtures('test-key', '2026-09-10');

    expect(capturedUrl).toContain('/fixtures?date=2026-09-10');
    expect(capturedHeaders?.get('x-apisports-key')).toBe('test-key');
    expect(res.totalReceived).toBe(3);
    expect(res.supportedFound).toBe(2);
    expect(res.supportedFixtures.map((f) => f.fixture.id)).toEqual([
      1001, 1003,
    ]);
    expect(res.errors).toEqual([]);
  });

  it('handles API error object cleanly without crashing', async () => {
    globalThis.fetch = createMockFetch(async () => {
      return new Response(
        JSON.stringify({
          get: 'fixtures',
          parameters: { date: '2026-09-10' },
          errors: {
            token: 'Error/Unauthorized: Invalid API key',
            requests: 'Too many requests for your current plan',
          },
          results: 0,
          response: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const res = await fetchDailyFixtures('bad-key', '2026-09-10');

    expect(res.totalReceived).toBe(0);
    expect(res.supportedFound).toBe(0);
    expect(res.errors.length).toBe(2);
    expect(res.errors[0]).toContain('API-Football error [token]');
    expect(res.errors[1]).toContain('API-Football error [requests]');
  });

  it('handles API error array cleanly', async () => {
    globalThis.fetch = createMockFetch(async () => {
      return new Response(
        JSON.stringify({
          get: 'fixtures',
          errors: ['Rate limit exceeded. Please retry later.'],
          results: 0,
          response: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const res = await fetchDailyFixtures('key', '2026-09-10');
    expect(res.errors).toEqual(['Rate limit exceeded. Please retry later.']);
    expect(res.totalReceived).toBe(0);
  });

  it('handles empty response gracefully', async () => {
    globalThis.fetch = createMockFetch(async () => {
      return new Response(
        JSON.stringify({
          get: 'fixtures',
          parameters: { date: '2026-09-10' },
          errors: [],
          results: 0,
          response: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const res = await fetchDailyFixtures('key', '2026-09-10');
    expect(res.totalReceived).toBe(0);
    expect(res.supportedFound).toBe(0);
    expect(res.supportedFixtures).toEqual([]);
    expect(res.errors).toEqual([]);
  });

  it('handles null logos and missing optional fields gracefully', async () => {
    globalThis.fetch = createMockFetch(async () => {
      return new Response(
        JSON.stringify({
          results: 1,
          response: [
            {
              fixture: {
                id: 5050,
                date: '2026-09-10T15:00:00Z',
                timestamp: 1789052400,
                status: {},
              },
              league: {
                id: 45, // FA Cup
                name: 'FA Cup',
              },
              teams: {
                home: { id: 1, name: 'Home FC' },
                away: { id: 2, name: 'Away FC' },
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const res = await fetchDailyFixtures('key', '2026-09-10');
    expect(res.supportedFound).toBe(1);
    expect(res.supportedFixtures[0].fixture.status.short).toBeUndefined();
    expect(res.supportedFixtures[0].league.logo).toBeUndefined();
  });

  it('handles network failure gracefully', async () => {
    globalThis.fetch = createMockFetch(async () => {
      throw new Error('Connection refused');
    });

    const res = await fetchDailyFixtures('key', '2026-09-10');
    expect(res.errors.length).toBe(1);
    expect(res.errors[0]).toContain('Connection refused');
    expect(res.totalReceived).toBe(0);
  });

  it('handles non-200 HTTP status gracefully', async () => {
    globalThis.fetch = createMockFetch(async () => {
      return new Response('Internal Server Error', {
        status: 500,
        statusText: 'Internal Server Error',
      });
    });

    const res = await fetchDailyFixtures('key', '2026-09-10');
    expect(res.errors.length).toBe(1);
    expect(res.errors[0]).toContain('HTTP error: 500');
  });
});
