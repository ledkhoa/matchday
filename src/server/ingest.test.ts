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

interface MockMatchRow {
  id: string;
  match_date: string;
  team_home: string;
  team_away: string;
  external_id: number;
  competition: string;
}

class TestPreparedStatement implements D1PreparedStatement {
  constructor(
    public readonly query: string,
    public readonly values: unknown[] = [],
    private readonly mockMatches: MockMatchRow[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new TestPreparedStatement(this.query, values, this.mockMatches);
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
    if (this.query.includes('from "matches"') && this.mockMatches.length > 0) {
      const rows = this.mockMatches.map((m) => [
        m.id,
        m.match_date,
        m.team_home,
        m.team_away,
        m.external_id,
        m.competition,
      ]);
      if (options?.columnNames) {
        const columns = [
          'id',
          'match_date',
          'team_home',
          'team_away',
          'external_id',
          'competition',
        ];
        // SAFETY: D1 raw return contract specifies tuple with column names as first element
        return [columns, ...rows] as [string[], ...T[]];
      }
      // SAFETY: D1 raw return contract specifies array of row arrays
      return rows as T[];
    }
    if (options?.columnNames) {
      return [[]];
    }
    return [];
  }
}

class TestD1Database implements D1Database {
  public executedQueries: string[] = [];
  public preparedStatements: TestPreparedStatement[] = [];
  public batchCalls: D1PreparedStatement[][] = [];
  public shouldFailBatch = false;
  public mockMatches: MockMatchRow[] = [];

  prepare(query: string): D1PreparedStatement {
    const stmt = new TestPreparedStatement(query, [], this.mockMatches);
    this.preparedStatements.push(stmt);
    return stmt;
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

  it('matches Reddit posts to canonical fixtures and persists highlights without inserting new matches', async () => {
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
    </feed>`;

    globalThis.fetch = createMockFetch(
      async () =>
        new Response(mockXml, {
          status: 200,
          headers: { 'Content-Type': 'application/atom+xml' },
        }),
    );

    const testDb = new TestD1Database();
    // Provide canonical match candidate
    testDb.mockMatches = [
      {
        id: '1035048',
        match_date: '2026-09-09',
        team_home: 'Arsenal',
        team_away: 'Chelsea',
        external_id: 1035048,
        competition: 'Premier League',
      },
    ];

    const result = await ingestRedditHighlights(testDb);

    expect(result.totalFetched).toBe(2);
    expect(result.parsedCount).toBe(2);
    expect(result.skippedCount).toBe(0);
    expect(result.persistedCount).toBe(2);
    expect(result.errors).toEqual([]);

    // Highlights should be inserted, match should be touched (updatedAt), but NEVER inserted
    expect(
      testDb.executedQueries.some((q) => q.includes('insert into "matches"')),
    ).toBe(false);
    expect(
      testDb.executedQueries.some((q) =>
        q.includes('insert into "highlights"'),
      ),
    ).toBe(true);
    expect(
      testDb.executedQueries.some((q) =>
        q.includes('update "matches" set "updated_at"'),
      ),
    ).toBe(true);
  });

  it('correctly inverts scoreline and fingerprint when Reddit post has inverted orientation', async () => {
    const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <id>t3_inv1</id>
        <title>Chelsea 0 - [1] Arsenal - Bukayo Saka 45'</title>
        <published>2026-09-09T20:00:00+00:00</published>
        <link href="https://reddit.com/r/soccer/comments/inv1/chelsea_arsenal/" />
        <content type="html">&lt;span&gt;&lt;a href=&quot;https://dubz.co/c/inv1&quot;&gt;[link]&lt;/a&gt;&lt;/span&gt;</content>
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
    testDb.mockMatches = [
      {
        id: '1035048',
        match_date: '2026-09-09',
        team_home: 'Arsenal',
        team_away: 'Chelsea',
        external_id: 1035048,
        competition: 'Premier League',
      },
    ];

    const result = await ingestRedditHighlights(testDb);

    expect(result.totalFetched).toBe(1);
    expect(result.parsedCount).toBe(1);
    expect(result.persistedCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(result.errors).toEqual([]);

    const highlightStmt = testDb.batchCalls
      .flat()
      .filter(
        (stmt): stmt is TestPreparedStatement =>
          stmt instanceof TestPreparedStatement,
      )
      .find((stmt) => stmt.query.includes('insert into "highlights"'));

    expect(highlightStmt).toBeDefined();

    // Verify canonical fixture attachment
    expect(highlightStmt?.values[1]).toBe('1035048');
    // Verify scoreHome: 1 and scoreAway: 0 (inverted from post title "Chelsea 0 - [1] Arsenal")
    expect(highlightStmt?.values[3]).toBe(1);
    expect(highlightStmt?.values[4]).toBe(0);
    // Verify goalFingerprint ends with _h1_a0
    // SAFETY: Highlight column index 11 corresponds to goal_fingerprint parameter
    const fingerprint = highlightStmt?.values[11] as string;
    expect(fingerprint).toBeDefined();
    expect(fingerprint.endsWith('_h1_a0')).toBe(true);
    expect(fingerprint).toBe('1035048_m45_h1_a0');
  });

  it('safely skips posts that do not match any candidate official fixture', async () => {
    const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <id>t3_untracked</id>
        <title>Yokohama F. Marinos [1] - 0 Kawasaki Frontale - Anderson Lopes 12'</title>
        <published>2026-09-09T10:00:00+00:00</published>
        <link href="https://reddit.com/r/soccer/comments/untracked/goal/" />
        <content type="html">&lt;span&gt;&lt;a href=&quot;https://dubz.co/c/untracked&quot;&gt;[link]&lt;/a&gt;&lt;/span&gt;</content>
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
    // Candidate fixtures only include Premier League
    testDb.mockMatches = [
      {
        id: '1035048',
        match_date: '2026-09-09',
        team_home: 'Arsenal',
        team_away: 'Chelsea',
        external_id: 1035048,
        competition: 'Premier League',
      },
    ];

    const result = await ingestRedditHighlights(testDb);

    expect(result.totalFetched).toBe(1);
    expect(result.parsedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(result.persistedCount).toBe(0);
    expect(testDb.executedQueries.length).toBe(0);
  });

  it('queries candidate fixtures within 3-day window [minDate - 1, maxDate + 1]', async () => {
    const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <id>t3_post1</id>
        <title>Arsenal [1] - 0 Chelsea 45'</title>
        <published>2026-09-10T15:00:00+00:00</published>
        <link href="https://reddit.com/r/soccer/comments/post1/" />
        <content type="html">&lt;span&gt;&lt;a href=&quot;https://dubz.co/c/post1&quot;&gt;[link]&lt;/a&gt;&lt;/span&gt;</content>
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
    await ingestRedditHighlights(testDb);

    // Verify prepare was called with date range query
    const matchQuery = testDb.preparedStatements.find((stmt) =>
      stmt.query.includes('from "matches"'),
    );
    expect(matchQuery).toBeDefined();
    expect(matchQuery?.query).toContain('"matches"."match_date" >= ?');
    expect(matchQuery?.query).toContain('"matches"."match_date" <= ?');
  });

  it('deduplicates multiple submissions of the same goal via goalFingerprint', async () => {
    const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <id>t3_first</id>
        <title>Spurs [1] - 0 Wolves - Son 22'</title>
        <published>2026-09-10T14:22:00+00:00</published>
        <link href="https://reddit.com/r/soccer/comments/first/" />
        <content type="html">&lt;span&gt;&lt;a href=&quot;https://v.redd.it/clip1&quot;&gt;[link]&lt;/a&gt;&lt;/span&gt;</content>
      </entry>
      <entry>
        <id>t3_second</id>
        <title>Tottenham 1 - 0 Wolverhampton - Son 22'</title>
        <published>2026-09-10T14:22:30+00:00</published>
        <link href="https://reddit.com/r/soccer/comments/second/" />
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
    testDb.mockMatches = [
      {
        id: '2001',
        match_date: '2026-09-10',
        team_home: 'Tottenham Hotspur',
        team_away: 'Wolverhampton Wanderers',
        external_id: 2001,
        competition: 'Premier League',
      },
    ];

    const result = await ingestRedditHighlights(testDb);

    expect(result.totalFetched).toBe(2);
    expect(result.parsedCount).toBe(2);
    expect(result.skippedCount).toBe(1); // Duplicate goal skipped!
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
    testDb.mockMatches = [
      {
        id: '1035048',
        match_date: '2026-09-09',
        team_home: 'Arsenal',
        team_away: 'Chelsea',
        external_id: 1035048,
        competition: 'Premier League',
      },
    ];
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
