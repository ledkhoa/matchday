import { describe, it, expect, afterEach } from 'bun:test';
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  D1ExecResult,
  D1DatabaseSession,
  D1Meta,
} from '@cloudflare/workers-types';
import { ingestRedditHighlights } from './ingest';

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
      throw new Error('D1 RPC internal error: transaction aborted');
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

describe('ingestRedditHighlights', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('orchestrates ingestion, parsing, batching, and persistence', async () => {
    const mockListing = {
      kind: 'Listing',
      data: {
        children: [
          {
            kind: 't3',
            data: {
              id: 'p1',
              name: 't3_p1',
              title: "Arsenal [1] - 0 Chelsea - Bukayo Saka 45'",
              url: 'https://dubz.co/c/p1',
              permalink: '/r/soccer/comments/p1/arsenal/',
              domain: 'dubz.co',
              score: 800,
              created_utc: 1757424000,
              link_flair_text: 'Media',
              is_self: false,
              stickied: false,
            },
          },
          {
            kind: 't3',
            data: {
              id: 'p2',
              name: 't3_p2',
              title: "Arsenal [2] - 0 Chelsea - Martinelli 60'",
              url: 'https://dubz.co/c/p2',
              permalink: '/r/soccer/comments/p2/arsenal/',
              domain: 'dubz.co',
              score: 1200,
              created_utc: 1757424000,
              link_flair_text: 'Media',
              is_self: false,
              stickied: false,
            },
          },
          {
            kind: 't3',
            data: {
              id: 'p3_meta',
              name: 't3_p3_meta',
              title: 'Post Match Thread: Arsenal 2-0 Chelsea',
              url: 'https://reddit.com/r/soccer/comments/p3_meta/',
              permalink: '/r/soccer/comments/p3_meta/',
              domain: 'reddit.com',
              score: 2500,
              created_utc: 1757424000,
              link_flair_text: 'Media',
              is_self: false,
              stickied: false,
            },
          },
        ],
      },
    };

    globalThis.fetch = createMockFetch(
      async () =>
        new Response(JSON.stringify(mockListing), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

    const testDb = new TestD1Database();
    const result = await ingestRedditHighlights(testDb);

    expect(result.totalFetched).toBe(3);
    expect(result.parsedCount).toBe(2);
    expect(result.skippedCount).toBe(1);
    expect(result.persistedCount).toBe(2);
    expect(result.errors).toEqual([]);

    // Two highlights share the same match (Arsenal vs Chelsea on 2025-09-09)
    // Batch statements: 1 match insert + 2 highlight inserts + 1 match update = 4 statements
    expect(testDb.executedQueries.length).toBe(4);
    expect(
      testDb.executedQueries.some((q) => q.includes('insert into "matches"')),
    ).toBe(true);
    expect(
      testDb.executedQueries.some((q) =>
        q.includes('insert into "highlights"'),
      ),
    ).toBe(true);
    expect(
      testDb.executedQueries.some((q) => q.includes('update "matches" set')),
    ).toBe(true);
  });

  it('splits statements into chunks of 30 for D1 batch execution', async () => {
    // Generate 12 distinct matches, each with 1 highlight
    // Statements: 12 matches + 12 highlights + 12 match updates = 36 statements
    // With CHUNK_SIZE = 30, should result in 2 batch calls: 30 statements + 6 statements
    const children = Array.from({ length: 12 }, (_, i) => ({
      kind: 't3' as const,
      data: {
        id: `post_${i}`,
        name: `t3_post_${i}`,
        title: `TeamA${i} [1] - 0 TeamB${i} - Player${i} 10'`,
        url: `https://dubz.co/c/clip_${i}`,
        permalink: `/r/soccer/comments/post_${i}/`,
        domain: 'dubz.co',
        score: 100 * (i + 1),
        created_utc: 1757424000,
        link_flair_text: 'Media',
        is_self: false,
        stickied: false,
      },
    }));

    globalThis.fetch = createMockFetch(
      async () =>
        new Response(JSON.stringify({ kind: 'Listing', data: { children } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

    const testDb = new TestD1Database();
    const result = await ingestRedditHighlights(testDb);

    expect(result.persistedCount).toBe(12);
    expect(result.errors).toEqual([]);
    expect(testDb.executedQueries.length).toBe(36);
    expect(testDb.batchCalls.length).toBe(2);
    expect(testDb.batchCalls[0].length).toBe(30);
    expect(testDb.batchCalls[1].length).toBe(6);
  });

  it('handles D1 batch errors gracefully without throwing', async () => {
    const mockListing = {
      kind: 'Listing',
      data: {
        children: [
          {
            kind: 't3',
            data: {
              id: 'err_post',
              name: 't3_err_post',
              title: "Arsenal [1] - 0 Chelsea - Saka 10'",
              url: 'https://dubz.co/c/err_clip',
              permalink: '/r/soccer/comments/err_post/',
              domain: 'dubz.co',
              score: 500,
              created_utc: 1757424000,
              link_flair_text: 'Media',
              is_self: false,
              stickied: false,
            },
          },
        ],
      },
    };

    globalThis.fetch = createMockFetch(
      async () =>
        new Response(JSON.stringify(mockListing), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

    const testDb = new TestD1Database();
    testDb.shouldFailBatch = true;

    const result = await ingestRedditHighlights(testDb);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('D1 batch execution failed:');
    expect(result.errors[0]).toContain('transaction aborted');
  });

  it('returns early when all posts fail regex parsing', async () => {
    const mockListing = {
      kind: 'Listing',
      data: {
        children: [
          {
            kind: 't3',
            data: {
              id: 'meta1',
              name: 't3_meta1',
              title: 'Daily Discussion Thread',
              url: 'https://reddit.com/r/soccer/comments/meta1/',
              permalink: '/r/soccer/comments/meta1/',
              domain: 'reddit.com',
              score: 100,
              created_utc: 1757424000,
              link_flair_text: 'Media',
              is_self: false,
              stickied: false,
            },
          },
        ],
      },
    };

    globalThis.fetch = createMockFetch(
      async () =>
        new Response(JSON.stringify(mockListing), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

    const testDb = new TestD1Database();
    const result = await ingestRedditHighlights(testDb);

    expect(result.totalFetched).toBe(1);
    expect(result.parsedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(result.persistedCount).toBe(0);
    expect(testDb.executedQueries.length).toBe(0);
  });

  it('returns early when no highlights are fetched', async () => {
    globalThis.fetch = createMockFetch(
      async () =>
        new Response(
          JSON.stringify({ kind: 'Listing', data: { children: [] } }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    );

    const testDb = new TestD1Database();
    const result = await ingestRedditHighlights(testDb);

    expect(result.totalFetched).toBe(0);
    expect(result.persistedCount).toBe(0);
    expect(testDb.executedQueries.length).toBe(0);
  });

  it('captures fetch errors gracefully', async () => {
    globalThis.fetch = createMockFetch(async () => {
      throw new Error('Network timeout');
    });

    const testDb = new TestD1Database();
    const result = await ingestRedditHighlights(testDb);

    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('Network timeout');
  });
});
