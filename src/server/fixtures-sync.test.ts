import { describe, it, expect, afterEach } from 'bun:test';
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  D1ExecResult,
  D1DatabaseSession,
  D1Meta,
} from '@cloudflare/workers-types';
import { syncDailyFixtures } from './fixtures-sync';

type MetaValue =
  string | number | boolean | undefined | { sql_duration_ms: number };

interface TestMeta extends D1Meta {
  [key: string]: MetaValue;
}

const mockMeta: TestMeta = {
  duration: 0,
  size_after: 0,
  rows_read: 0,
  rows_written: 0,
  last_row_id: 1,
  changed_db: false,
  changes: 1,
};

class TestPreparedStatement implements D1PreparedStatement {
  constructor(
    public readonly query: string,
    public readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new TestPreparedStatement(this.query, values);
  }

  async first<T>(_colName?: string): Promise<T | null> {
    return null;
  }

  async run<T>(): Promise<D1Result<T>> {
    return {
      success: true,
      meta: mockMeta,
      results: [],
    };
  }

  async all<T>(): Promise<D1Result<T>> {
    return {
      success: true,
      meta: mockMeta,
      results: [],
    };
  }

  raw<T = unknown[]>(options: {
    columnNames: true;
  }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  async raw<T = unknown[]>(options?: {
    columnNames?: boolean;
  }): Promise<[string[], ...T[]] | T[]> {
    if (options?.columnNames) {
      return [[]];
    }
    return [];
  }
}

class TestD1Database implements D1Database {
  public executedQueries: string[] = [];
  public batchCalls: D1PreparedStatement[][] = [];
  public shouldFailBatch = false;

  prepare(query: string): D1PreparedStatement {
    return new TestPreparedStatement(query);
  }

  async batch<T = unknown>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]> {
    if (this.shouldFailBatch) {
      throw new Error('D1 batch error: constraint failed');
    }
    this.batchCalls.push(statements);
    for (const stmt of statements) {
      if (stmt instanceof TestPreparedStatement) {
        this.executedQueries.push(stmt.query);
      }
    }
    return statements.map(() => ({
      success: true,
      meta: mockMeta,
      results: [],
    }));
  }

  async exec(query: string): Promise<D1ExecResult> {
    this.executedQueries.push(query);
    return { count: 1, duration: 0 };
  }

  withSession(): D1DatabaseSession {
    throw new Error('Not implemented for test');
  }

  async dump(): Promise<ArrayBuffer> {
    return new ArrayBuffer(0);
  }
}

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

describe('syncDailyFixtures', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('persists supported fixtures to D1 database using batch upsert', async () => {
    const mockDb = new TestD1Database();

    globalThis.fetch = createMockFetch(async () => {
      return new Response(
        JSON.stringify({
          get: 'fixtures',
          results: 2,
          response: [
            {
              fixture: {
                id: 12345,
                date: '2026-09-10T19:00:00+00:00',
                timestamp: 1789066800,
                status: { short: 'NS' },
              },
              league: {
                id: 39,
                name: 'Premier League',
                logo: 'https://media.api-sports.io/leagues/39.png',
              },
              teams: {
                home: {
                  id: 1,
                  name: 'Arsenal',
                  logo: 'https://media.api-sports.io/teams/1.png',
                },
                away: {
                  id: 2,
                  name: 'Chelsea',
                  logo: 'https://media.api-sports.io/teams/2.png',
                },
              },
            },
            {
              fixture: {
                id: 67890,
                date: '2026-09-10T21:00:00+00:00',
                timestamp: 1789074000,
                status: { short: 'FT' },
              },
              league: {
                id: 140,
                name: 'La Liga',
                logo: 'https://media.api-sports.io/leagues/140.png',
              },
              teams: {
                home: {
                  id: 3,
                  name: 'Real Madrid',
                  logo: 'https://media.api-sports.io/teams/3.png',
                },
                away: {
                  id: 4,
                  name: 'Barcelona',
                  logo: 'https://media.api-sports.io/teams/4.png',
                },
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const res = await syncDailyFixtures(mockDb, 'api-key', '2026-09-10');

    expect(res.date).toBe('2026-09-10');
    expect(res.totalReceived).toBe(2);
    expect(res.supportedFound).toBe(2);
    expect(res.persistedCount).toBe(2);
    expect(res.errors).toEqual([]);
    expect(mockDb.executedQueries.length).toBe(2);
    expect(mockDb.executedQueries[0]).toContain('insert into "matches"');
    expect(mockDb.executedQueries[0]).toContain(
      'on conflict ("matches"."external_id") do update',
    );
  });

  it('skips D1 batch when no supported fixtures are found', async () => {
    const mockDb = new TestD1Database();

    globalThis.fetch = createMockFetch(async () => {
      return new Response(
        JSON.stringify({
          get: 'fixtures',
          results: 1,
          response: [
            {
              fixture: {
                id: 99999,
                date: '2026-09-10T19:00:00+00:00',
                timestamp: 1789066800,
                status: { short: 'NS' },
              },
              league: {
                id: 999, // Unsupported
                name: 'Austrian Cup',
              },
              teams: {
                home: { id: 10, name: 'Sturm Graz' },
                away: { id: 11, name: 'Rapid Wien' },
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const res = await syncDailyFixtures(mockDb, 'api-key', '2026-09-10');

    expect(res.totalReceived).toBe(1);
    expect(res.supportedFound).toBe(0);
    expect(res.persistedCount).toBe(0);
    expect(mockDb.executedQueries.length).toBe(0);
  });

  it('handles D1 batch errors cleanly', async () => {
    const mockDb = new TestD1Database();
    mockDb.shouldFailBatch = true;

    globalThis.fetch = createMockFetch(async () => {
      return new Response(
        JSON.stringify({
          get: 'fixtures',
          results: 1,
          response: [
            {
              fixture: {
                id: 1111,
                date: '2026-09-10T19:00:00+00:00',
                timestamp: 1789066800,
                status: { short: 'NS' },
              },
              league: {
                id: 39,
                name: 'Premier League',
              },
              teams: {
                home: { id: 1, name: 'Arsenal' },
                away: { id: 2, name: 'Chelsea' },
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const res = await syncDailyFixtures(mockDb, 'api-key', '2026-09-10');

    expect(res.supportedFound).toBe(1);
    expect(res.persistedCount).toBe(0);
    expect(res.errors.length).toBe(1);
    expect(res.errors[0]).toContain('D1 fixture batch upsert failed:');
  });
});
