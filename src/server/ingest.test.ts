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

  it('orchestrates ingestion, parsing, batching, and persistence from RSS', async () => {
    const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <id>t3_p1</id>
        <title>Arsenal [1] - 0 Chelsea - Bukayo Saka 45'</title>
        <published>2026-09-09T20:00:00+00:00</published>
        <link href="https://reddit.com/r/soccer/comments/p1/arsenal/" />
        <content type="html">&lt;span&gt;&lt;a href=&quot;https://dubz.co/c/p1&quot;&gt;[link]&lt;/a&gt;&lt;/span&gt;</content>
      </entry>
      <entry>
        <id>t3_p2</id>
        <title>Arsenal [2] - 0 Chelsea - Martinelli 60'</title>
        <published>2026-09-09T20:15:00+00:00</published>
        <link href="https://reddit.com/r/soccer/comments/p2/arsenal/" />
        <content type="html">&lt;span&gt;&lt;a href=&quot;https://dubz.co/c/p2&quot;&gt;[link]&lt;/a&gt;&lt;/span&gt;</content>
      </entry>
      <entry>
        <id>t3_meta</id>
        <title>Post Match Thread: Arsenal 2-0 Chelsea</title>
        <published>2026-09-09T21:00:00+00:00</published>
        <link href="https://reddit.com/r/soccer/comments/meta/post/" />
        <content type="html">&lt;span&gt;&lt;a href=&quot;https://reddit.com/r/soccer/comments/meta/post/&quot;&gt;[link]&lt;/a&gt;&lt;/span&gt;</content>
      </entry>
    </feed>`;

    globalThis.fetch = createMockFetch(
      async () =>
        new Response(mockXml, {
          status: 200,
          headers: { 'Content-Type': 'application/atom+xml' },
        }),
    );

    const testDb = new TestD1Database();
    const result = await ingestRedditHighlights(testDb);

    expect(result.totalFetched).toBe(2);
    expect(result.parsedCount).toBe(2);
    expect(result.skippedCount).toBe(0);
    expect(result.persistedCount).toBe(2);
    expect(result.errors).toEqual([]);

    // Two highlights share the same match (Arsenal vs Chelsea on 2026-09-09)
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
  });

  it('deduplicates multiple submissions of the same goal via goalFingerprint', async () => {
    // Two different users submit the same goal (DC United [2] - 0 Columbus Crew 37')
    const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <id>t3_first_submit</id>
        <title>DC United [2] - 0 Columbus Crew - Tai Baribo 37'</title>
        <published>2026-09-10T03:21:46+00:00</published>
        <link href="https://reddit.com/r/soccer/comments/first/goal/" />
        <content type="html">&lt;span&gt;&lt;a href=&quot;https://v.redd.it/clip1&quot;&gt;[link]&lt;/a&gt;&lt;/span&gt;</content>
      </entry>
      <entry>
        <id>t3_second_submit</id>
        <title>DC United 2 - 0 Columbus Crew - Baribo 37'</title>
        <published>2026-09-10T03:22:00+00:00</published>
        <link href="https://reddit.com/r/soccer/comments/second/goal/" />
        <content type="html">&lt;span&gt;&lt;a href=&quot;https://v.redd.it/clip2&quot;&gt;[link]&lt;/a&gt;&lt;/span&gt;</content>
      </entry>
    </feed>`;

    globalThis.fetch = createMockFetch(
      async () =>
        new Response(mockXml, {
          status: 200,
          headers: { 'Content-Type': 'application/atom+xml' },
        }),
    );

    const testDb = new TestD1Database();
    const result = await ingestRedditHighlights(testDb);

    expect(result.totalFetched).toBe(2);
    expect(result.parsedCount).toBe(2);
    expect(result.skippedCount).toBe(1); // Second submission skipped!
    expect(result.persistedCount).toBe(1);
  });

  it('handles D1 batch errors gracefully without throwing', async () => {
    const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <id>t3_err_post</id>
        <title>Arsenal [1] - 0 Chelsea - Saka 10'</title>
        <published>2026-09-09T20:00:00+00:00</published>
        <link href="https://reddit.com/r/soccer/comments/err_post/" />
        <content type="html">&lt;span&gt;&lt;a href=&quot;https://dubz.co/c/err_clip&quot;&gt;[link]&lt;/a&gt;&lt;/span&gt;</content>
      </entry>
    </feed>`;

    globalThis.fetch = createMockFetch(
      async () =>
        new Response(mockXml, {
          status: 200,
          headers: { 'Content-Type': 'application/atom+xml' },
        }),
    );

    const testDb = new TestD1Database();
    testDb.shouldFailBatch = true;

    const result = await ingestRedditHighlights(testDb);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('D1 batch execution failed:');
    expect(result.errors[0]).toContain('transaction aborted');
  });

  it('returns early when no highlights are fetched', async () => {
    globalThis.fetch = createMockFetch(
      async () =>
        new Response('<feed></feed>', {
          status: 200,
          headers: { 'Content-Type': 'application/atom+xml' },
        }),
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
