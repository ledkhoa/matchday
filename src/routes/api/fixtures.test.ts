import { describe, it, expect, afterEach, spyOn } from 'bun:test';
import { z } from 'zod';
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  D1ExecResult,
  D1DatabaseSession,
  D1Meta,
} from '@cloudflare/workers-types';
import { handleFixturesPost, postServerHandler, Route } from './fixtures';
import type { CloudflareEnv } from '../../types/env';

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

  prepare(query: string): D1PreparedStatement {
    this.executedQueries.push(query);
    return new TestPreparedStatement(query);
  }

  async batch<T = unknown>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]> {
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

const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  details: z.string().optional(),
});

const SuccessResponseSchema = z.object({
  success: z.literal(true),
  date: z.string(),
  summary: z.object({
    totalReceived: z.number(),
    supportedFound: z.number(),
    persistedCount: z.number(),
  }),
  durationMs: z.number(),
});

describe('/api/fixtures handler', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects request without Authorization header (401)', async () => {
    const env: CloudflareEnv = {
      DB: new TestD1Database(),
      CRON_SECRET: 'super-secret',
      API_FOOTBALL_KEY: 'test-api-key',
    };

    const request = new Request('http://localhost/api/fixtures', {
      method: 'POST',
    });

    const response = await handleFixturesPost(request, { env });
    expect(response.status).toBe(401);

    const body = ErrorResponseSchema.parse(await response.json());
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('rejects request with invalid Bearer token (401)', async () => {
    const env: CloudflareEnv = {
      DB: new TestD1Database(),
      CRON_SECRET: 'super-secret',
      API_FOOTBALL_KEY: 'test-api-key',
    };

    const request = new Request('http://localhost/api/fixtures', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer wrong-secret',
      },
    });

    const response = await handleFixturesPost(request, { env });
    expect(response.status).toBe(401);

    const body = ErrorResponseSchema.parse(await response.json());
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('rejects request with non-Bearer Authorization header (401)', async () => {
    const env: CloudflareEnv = {
      DB: new TestD1Database(),
      CRON_SECRET: 'super-secret',
      API_FOOTBALL_KEY: 'test-api-key',
    };

    const request = new Request('http://localhost/api/fixtures', {
      method: 'POST',
      headers: {
        Authorization: 'Basic c3VwZXItc2VjcmV0',
      },
    });

    const response = await handleFixturesPost(request, { env });
    expect(response.status).toBe(401);

    const body = ErrorResponseSchema.parse(await response.json());
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('rejects invalid date format in request body (400)', async () => {
    const env: CloudflareEnv = {
      DB: new TestD1Database(),
      CRON_SECRET: 'super-secret',
      API_FOOTBALL_KEY: 'test-api-key',
    };

    const request = new Request('http://localhost/api/fixtures', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer super-secret',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ date: 'not-a-date' }),
    });

    const response = await handleFixturesPost(request, { env });
    expect(response.status).toBe(400);

    const body = ErrorResponseSchema.parse(await response.json());
    expect(body.success).toBe(false);
    expect(body.error).toContain('Invalid date format');
  });

  it('returns 500 when database binding (DB) is unavailable', async () => {
    // SAFETY: testing intentional runtime omission of DB binding
    const partialEnv = {
      CRON_SECRET: 'super-secret',
      API_FOOTBALL_KEY: 'test-api-key',
    } as CloudflareEnv;

    const request = new Request('http://localhost/api/fixtures', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer super-secret',
      },
    });

    const response = await handleFixturesPost(request, { env: partialEnv });
    expect(response.status).toBe(500);

    const body = ErrorResponseSchema.parse(await response.json());
    expect(body.success).toBe(false);
    expect(body.error).toBe('Server configuration error');
  });

  it('returns 500 when API_FOOTBALL_KEY is not configured', async () => {
    const envWithoutKey: CloudflareEnv = {
      DB: new TestD1Database(),
      CRON_SECRET: 'super-secret',
    };

    const request = new Request('http://localhost/api/fixtures', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer super-secret',
      },
    });

    const response = await handleFixturesPost(request, { env: envWithoutKey });
    expect(response.status).toBe(500);

    const body = ErrorResponseSchema.parse(await response.json());
    expect(body.success).toBe(false);
    expect(body.error).toBe('Server configuration error');
    expect(body.details).toContain('API_FOOTBALL_KEY');
  });

  it('executes sync and returns 200 with summary for valid token and valid date', async () => {
    const env: CloudflareEnv = {
      DB: new TestD1Database(),
      CRON_SECRET: 'super-secret',
      API_FOOTBALL_KEY: 'test-api-key',
    };

    let requestedUrl = '';
    globalThis.fetch = createMockFetch(async (input) => {
      requestedUrl = String(input);
      return new Response(
        JSON.stringify({
          get: 'fixtures',
          results: 1,
          response: [
            {
              fixture: {
                id: 100,
                date: '2026-09-10T20:00:00Z',
                timestamp: 1789070400,
                status: { short: 'NS' },
              },
              league: { id: 39, name: 'Premier League' },
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

    const request = new Request('http://localhost/api/fixtures', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer super-secret',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ date: '2026-09-10' }),
    });

    const consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});

    const response = await handleFixturesPost(request, { env });
    expect(response.status).toBe(200);

    const body = SuccessResponseSchema.parse(await response.json());
    expect(body.success).toBe(true);
    expect(body.date).toBe('2026-09-10');
    expect(body.summary.supportedFound).toBe(1);
    expect(body.summary.persistedCount).toBe(1);
    expect(requestedUrl).toContain('date=2026-09-10');

    consoleLogSpy.mockRestore();
  });

  it('returns 500 if sync throws an exception', async () => {
    const envWithCrashingDb: CloudflareEnv = {
      CRON_SECRET: 'super-secret',
      API_FOOTBALL_KEY: 'test-api-key',
      get DB(): D1Database {
        throw new Error('D1 connection failure');
      },
    };

    globalThis.fetch = createMockFetch(async () => {
      return new Response(
        JSON.stringify({
          get: 'fixtures',
          results: 1,
          response: [
            {
              fixture: {
                id: 100,
                date: '2026-09-10T20:00:00Z',
                timestamp: 1789070400,
                status: { short: 'NS' },
              },
              league: { id: 39, name: 'Premier League' },
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

    const request = new Request('http://localhost/api/fixtures', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer super-secret',
      },
    });

    const consoleErrorSpy = spyOn(console, 'error').mockImplementation(
      () => {},
    );

    const response = await handleFixturesPost(request, {
      env: envWithCrashingDb,
    });
    expect(response.status).toBe(500);

    const body = ErrorResponseSchema.parse(await response.json());
    expect(body.success).toBe(false);
    expect(body.error).toBe('Sync failed');
    expect(body.details).toContain('D1 connection failure');

    consoleErrorSpy.mockRestore();
  });

  it('delegates POST handler defined on Route server options', async () => {
    expect(Route.options.server).toBeDefined();

    const env: CloudflareEnv = {
      DB: new TestD1Database(),
      CRON_SECRET: 'super-secret',
      API_FOOTBALL_KEY: 'test-api-key',
    };

    const request = new Request('http://localhost/api/fixtures', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer wrong-secret',
      },
    });

    const response = await postServerHandler({
      request,
      context: { env },
    });
    expect(response.status).toBe(401);
  });
});
