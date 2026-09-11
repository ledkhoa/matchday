import { describe, it, expect, afterEach, spyOn } from 'bun:test';
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  D1ExecResult,
  D1DatabaseSession,
  D1Meta,
} from '@cloudflare/workers-types';
import {
  handleScheduled,
  type ScheduledEventPayload,
  type ScheduledExecutionContext,
} from './cron';
import type { CloudflareEnv } from '../types/env';

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
  public shouldFailPrepare = false;

  prepare(query: string): D1PreparedStatement {
    if (this.shouldFailPrepare) {
      throw new Error('D1 connection broken');
    }
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

class TestScheduledEvent implements ScheduledEventPayload {
  constructor(
    public readonly cron: string = '*/5 * * * *',
    public readonly scheduledTime: number = Date.now(),
  ) {}

  noRetry(): void {}
}

class TestExecutionContext implements ScheduledExecutionContext {
  public readonly promises: Promise<unknown>[] = [];

  waitUntil(promise: Promise<unknown>): void {
    this.promises.push(promise);
  }

  passThroughOnException(): void {}
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

describe('handleScheduled', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('dispatches fixture synchronization when cron is "0 0 * * *"', async () => {
    const mockDb = new TestD1Database();
    const env: CloudflareEnv = {
      DB: mockDb,
      API_FOOTBALL_KEY: 'test-api-key',
    };

    const requestedUrls: string[] = [];
    globalThis.fetch = createMockFetch(async (input) => {
      requestedUrls.push(String(input));
      return new Response(
        JSON.stringify({
          get: 'fixtures',
          results: 1,
          response: [
            {
              fixture: {
                id: 99,
                date: '2026-09-10T15:00:00Z',
                timestamp: 1789052400,
                status: { short: 'NS' },
              },
              league: { id: 39, name: 'Premier League' },
              teams: {
                home: { id: 1, name: 'Arsenal' },
                away: { id: 2, name: 'Chelsea' },
              },
              goals: { home: 0, away: 0 },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const event = new TestScheduledEvent('0 0 * * *');
    const ctx = new TestExecutionContext();

    const consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});

    await handleScheduled(event, env, ctx);
    expect(ctx.promises.length).toBe(1);
    await Promise.all(ctx.promises);

    expect(requestedUrls.length).toBe(2);
    expect(
      requestedUrls.every((url) =>
        url.includes('v3.football.api-sports.io/fixtures'),
      ),
    ).toBe(true);
    expect(consoleLogSpy).toHaveBeenCalled();
    consoleLogSpy.mockRestore();
  });

  it('logs an error if API_FOOTBALL_KEY is missing on midnight cron', async () => {
    const mockDb = new TestD1Database();
    const env: CloudflareEnv = {
      DB: mockDb,
      // API_FOOTBALL_KEY omitted
    };

    const event = new TestScheduledEvent('0 0 * * *');
    const ctx = new TestExecutionContext();

    const consoleErrorSpy = spyOn(console, 'error').mockImplementation(
      () => {},
    );

    await handleScheduled(event, env, ctx);
    await Promise.all(ctx.promises);

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('invokes Reddit highlight ingestion when cron is "*/5 * * * *"', async () => {
    const mockDb = new TestD1Database();
    const env: CloudflareEnv = {
      DB: mockDb,
      REDDIT_USER_AGENT: 'test-agent',
    };

    let requestedUrl = '';
    globalThis.fetch = createMockFetch(async (input) => {
      requestedUrl = String(input);
      return new Response('<feed></feed>', {
        status: 200,
        headers: { 'Content-Type': 'application/atom+xml' },
      });
    });

    const event = new TestScheduledEvent('*/5 * * * *');
    const ctx = new TestExecutionContext();

    const consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});

    await handleScheduled(event, env, ctx);

    expect(ctx.promises.length).toBe(1);
    await Promise.all(ctx.promises);

    expect(requestedUrl).toContain('reddit.com/r/soccer');
    expect(consoleLogSpy).toHaveBeenCalled();
    consoleLogSpy.mockRestore();
  });

  it('gracefully captures and logs ingestion errors without throwing unhandled rejection', async () => {
    const brokenDb = new TestD1Database();
    brokenDb.shouldFailPrepare = true;

    const env: CloudflareEnv = {
      DB: brokenDb,
      REDDIT_USER_AGENT: 'test-agent',
    };

    globalThis.fetch = createMockFetch(async () => {
      throw new Error('Network failure');
    });

    const event = new TestScheduledEvent();
    const ctx = new TestExecutionContext();

    const consoleErrorSpy = spyOn(console, 'error').mockImplementation(
      () => {},
    );

    await handleScheduled(event, env, ctx);
    expect(ctx.promises.length).toBe(1);

    await expect(Promise.all(ctx.promises)).resolves.toBeDefined();

    consoleErrorSpy.mockRestore();
  });

  it('handles non-Error exceptions gracefully in catch block', async () => {
    const env: CloudflareEnv = {
      get DB(): D1Database {
        throw 'Fatal non-Error exception string';
      },
    };

    const event = new TestScheduledEvent();
    const ctx = new TestExecutionContext();

    const consoleErrorSpy = spyOn(console, 'error').mockImplementation(
      () => {},
    );

    await handleScheduled(event, env, ctx);
    expect(ctx.promises.length).toBe(1);

    await expect(Promise.all(ctx.promises)).resolves.toBeDefined();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('uses custom user agent when configured in env', async () => {
    const mockDb = new TestD1Database();
    const env: CloudflareEnv = {
      DB: mockDb,
      REDDIT_USER_AGENT: 'CustomCronAgent/1.0',
    };

    let capturedUserAgent = '';
    globalThis.fetch = createMockFetch(
      async (_input: string | URL | Request, init?: RequestInit) => {
        capturedUserAgent = new Headers(init?.headers).get('User-Agent') ?? '';
        return new Response('<feed></feed>', {
          status: 200,
          headers: { 'Content-Type': 'application/atom+xml' },
        });
      },
    );

    const event = new TestScheduledEvent();
    const ctx = new TestExecutionContext();

    await handleScheduled(event, env, ctx);
    await Promise.all(ctx.promises);

    expect(capturedUserAgent).toBe('CustomCronAgent/1.0');
  });
});
