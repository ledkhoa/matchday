import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mock } from 'bun:test';
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  D1ExecResult,
  D1DatabaseSession,
  D1Meta,
  ExecutionContext,
  Tracing,
} from '@cloudflare/workers-types';
import type {
  WorkflowEvent,
  WorkflowStep,
  WorkflowStepContext,
  WorkflowSleepDuration,
  WorkflowStepEvent,
} from 'cloudflare:workers';

class MockWorkflowEntrypoint<Env = unknown, _Params = unknown> {
  constructor(
    protected ctx: ExecutionContext,
    protected env: Env,
  ) {}
}

class MockNonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

mock.module('cloudflare:workers', () => ({
  WorkflowEntrypoint: MockWorkflowEntrypoint,
  NonRetryableError: MockNonRetryableError,
}));

mock.module('cloudflare:workflows', () => ({
  NonRetryableError: MockNonRetryableError,
}));

// Dynamically import workflow AFTER module mock is registered so ESM loader resolves the mock
const { HighlightIngestWorkflow } = await import('./highlight-ingest');
type HighlightIngestWorkflowParams =
  import('./highlight-ingest').HighlightIngestWorkflowParams;

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

interface MockMatchDbRow {
  id: string;
  match_date: string;
  team_home: string;
  team_away: string;
  kickoff_time?: number | null;
  status?: string | null;
  score_home?: number | null;
  score_away?: number | null;
  external_id?: number | null;
  competition?: string | null;
}

interface MockHighlightDbRow {
  id: string;
  match_id: string;
  score_home?: number | null;
  score_away?: number | null;
  goal_fingerprint?: string | null;
}

class TestPreparedStatement implements D1PreparedStatement {
  constructor(
    public readonly query: string,
    public readonly values: unknown[] = [],
    private readonly mockMatches: MockMatchDbRow[] = [],
    private readonly mockHighlights: MockHighlightDbRow[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new TestPreparedStatement(
      this.query,
      values,
      this.mockMatches,
      this.mockHighlights,
    );
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
    const q = this.query.toLowerCase();
    if (q.includes('from "matches"') || q.includes('from `matches`')) {
      if (q.includes('"status"')) {
        // Query from hasActiveMatchWindow: id, match_date, kickoff_time, status, team_home, team_away
        const columns = [
          'id',
          'match_date',
          'kickoff_time',
          'status',
          'team_home',
          'team_away',
        ];
        const rows: (string | number | null)[][] = this.mockMatches.map((m) => [
          m.id,
          m.match_date,
          m.kickoff_time ?? null,
          m.status ?? null,
          m.team_home,
          m.team_away,
        ]);
        if (options?.columnNames) {
          // SAFETY: D1 raw contract specifies tuple with column names as first element
          return [columns, ...rows] as [string[], ...T[]];
        }
        // SAFETY: D1 raw contract specifies array of row arrays
        return rows as T[];
      }

      // Query from matchAndPrepareHighlights: id, match_date, team_home, team_away, external_id, competition, kickoff_time
      const columns = [
        'id',
        'match_date',
        'team_home',
        'team_away',
        'external_id',
        'competition',
        'kickoff_time',
      ];
      const rows: (string | number | null)[][] = this.mockMatches.map((m) => [
        m.id,
        m.match_date,
        m.team_home,
        m.team_away,
        m.external_id ?? null,
        m.competition ?? null,
        m.kickoff_time ?? null,
      ]);
      if (options?.columnNames) {
        // SAFETY: D1 raw contract specifies tuple with column names as first element
        return [columns, ...rows] as [string[], ...T[]];
      }
      // SAFETY: D1 raw contract specifies array of row arrays
      return rows as T[];
    }
    if (q.includes('from "highlights"') || q.includes('from `highlights`')) {
      const columns = ['goal_fingerprint'];
      const rows: (string | number | null)[][] = this.mockHighlights.map(
        (h) => [h.goal_fingerprint ?? null],
      );
      if (options?.columnNames) {
        // SAFETY: D1 raw contract specifies tuple with column names as first element
        return [columns, ...rows] as [string[], ...T[]];
      }
      // SAFETY: D1 raw contract specifies array of row arrays
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
  public batchCalls: D1PreparedStatement[][] = [];
  public mockMatches: MockMatchDbRow[] = [];
  public mockHighlights: MockHighlightDbRow[] = [];
  public shouldFailBatch = false;
  public shouldFailPrepare = false;

  prepare(query: string): D1PreparedStatement {
    if (this.shouldFailPrepare) {
      throw new Error('D1 connection broken');
    }
    this.executedQueries.push(query);
    return new TestPreparedStatement(
      query,
      [],
      this.mockMatches,
      this.mockHighlights,
    );
  }

  async batch<T = unknown>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]> {
    if (this.shouldFailBatch) {
      throw new Error('D1 batch failed: database locked');
    }
    this.batchCalls.push(statements);
    for (const s of statements) {
      if (s instanceof TestPreparedStatement) {
        this.executedQueries.push(s.query);
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

class MockExecutionContext implements ExecutionContext {
  public props: Record<string, string> = {};
  // SAFETY: Tracing stub satisfies ExecutionContext interface for unit tests
  public tracing: Tracing = {} as Tracing;
  // SAFETY: Stub exports object satisfies ExecutionContext interface for unit tests
  public exports: Cloudflare.Exports = {} as Cloudflare.Exports;

  waitUntil(): void {}
  passThroughOnException(): void {}
  abort(): void {}
}

type MockStepFunction<T> = (
  ctx: WorkflowStepContext<WorkflowSleepDuration>,
) => Promise<T>;

interface MockStepConfig {
  retries?: {
    limit?: number;
    delay?: WorkflowSleepDuration | number;
    backoff?: string;
  };
  timeout?: WorkflowSleepDuration | number;
}

export class MockWorkflowStep implements WorkflowStep {
  public executedSteps: string[] = [];
  public stepOutputs = new Map<string, unknown>();

  // SAFETY: Typed as WorkflowStep['do'] to match internal Cloudflare overload discriminators
  public do: WorkflowStep['do'] = (async <T>(
    name: string,
    configOrCallback: MockStepConfig | MockStepFunction<T>,
    callback?: MockStepFunction<T>,
  ): Promise<T> => {
    this.executedSteps.push(name);
    // SAFETY: If callback is passed, configOrCallback is configuration; otherwise it is the callback function
    const stepFn = callback ?? (configOrCallback as MockStepFunction<T>);
    // SAFETY: Stub step context satisfies unit test harness
    const ctx = {} as WorkflowStepContext<WorkflowSleepDuration>;
    const output = await stepFn(ctx);
    this.stepOutputs.set(name, output);
    return output;
  }) as WorkflowStep['do'];

  async sleep(): Promise<void> {}
  async sleepUntil(): Promise<void> {}

  async waitForEvent<T extends Rpc.Serializable<T>>(): Promise<
    WorkflowStepEvent<T>
  > {
    throw new Error('Not implemented for test');
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

function createAtomFeed(
  entries: Array<{
    id: string;
    title: string;
    url: string;
    permalink: string;
    updated: string;
  }>,
): string {
  const xmlEntries = entries
    .map(
      (e) => `
    <entry>
      <id>${e.id}</id>
      <title>${e.title}</title>
      <link href="https://www.reddit.com${e.permalink}" />
      <content type="html">&lt;span&gt;&lt;a href="${e.url}"&gt;[link]&lt;/a&gt;&lt;/span&gt;</content>
      <updated>${e.updated}</updated>
      <category term="Goal Clip" label="Goal Clip" />
    </entry>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>r/soccer goals</title>
  ${xmlEntries}
</feed>`;
}

describe('HighlightIngestWorkflow', () => {
  const originalFetch = globalThis.fetch;
  let mockDb: TestD1Database;
  let mockStep: MockWorkflowStep;
  let mockCtx: MockExecutionContext;

  beforeEach(() => {
    mockDb = new TestD1Database();
    mockStep = new MockWorkflowStep();
    mockCtx = new MockExecutionContext();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('executes all 3 steps successfully on happy path with active matches', async () => {
    const kickoffMs = Date.UTC(2026, 8, 15, 15, 0, 0); // 15:00 UTC
    const postDateIso = '2026-09-15T15:20:00Z'; // 20 mins into game

    mockDb.mockMatches = [
      {
        id: 'match-101',
        match_date: '2026-09-15',
        team_home: 'Arsenal',
        team_away: 'Chelsea',
        kickoff_time: kickoffMs,
        status: '1H',
      },
    ];

    const feedXml = createAtomFeed([
      {
        id: 't3_goal1',
        title: 'Arsenal [1] - 0 Chelsea - Bukayo Saka 20',
        url: 'https://dubz.co/v/12345',
        permalink: '/r/soccer/comments/goal1/arsenal_1_0_chelsea/',
        updated: postDateIso,
      },
    ]);

    globalThis.fetch = createMockFetch(async () => {
      return new Response(feedXml, {
        status: 200,
        headers: { 'Content-Type': 'application/atom+xml' },
      });
    });

    const env: CloudflareEnv = {
      DB: mockDb,
      REDDIT_USER_AGENT: 'test-agent/1.0',
    };

    const workflow = new HighlightIngestWorkflow(mockCtx, env);
    const event: WorkflowEvent<HighlightIngestWorkflowParams> = {
      instanceId: 'highlight-ingest-test-1',
      workflowName: 'highlight-ingest-workflow',
      timestamp: new Date(kickoffMs + 30 * 60 * 1000), // 15:30 UTC
      payload: {
        referenceTimeMs: kickoffMs + 30 * 60 * 1000,
      },
    };

    const result = await workflow.run(event, mockStep);

    expect(mockStep.executedSteps).toEqual([
      'fetch-reddit-highlights',
      'match-and-prepare-highlights',
      'persist-highlights-batch',
    ]);

    expect(result.instanceId).toBe('highlight-ingest-test-1');
    expect(result.totalFetched).toBe(1);
    expect(result.parsedCount).toBe(1);
    expect(result.matchedCount).toBe(1);
    expect(result.persistedCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(result.errors.length).toBe(0);
    expect(mockDb.batchCalls.length).toBe(1);
  });

  it('throws NonRetryableError immediately when DB binding is missing', async () => {
    // SAFETY: Intentional omission of DB binding to verify NonRetryableError throw
    const partialEnv = {} as CloudflareEnv;
    const workflow = new HighlightIngestWorkflow(mockCtx, partialEnv);
    const event: WorkflowEvent<HighlightIngestWorkflowParams> = {
      instanceId: 'test-inst',
      workflowName: 'highlight-ingest-workflow',
      timestamp: new Date(),
      payload: {},
    };

    await expect(workflow.run(event, mockStep)).rejects.toThrow(
      'D1 Database binding (DB) is unavailable',
    );
    expect(mockStep.executedSteps.length).toBe(0);
  });

  it('skips execution early when outside active match window without force flag', async () => {
    mockDb.mockMatches = []; // No active matches

    const env: CloudflareEnv = {
      DB: mockDb,
      REDDIT_USER_AGENT: 'test-agent',
    };

    const workflow = new HighlightIngestWorkflow(mockCtx, env);
    const event: WorkflowEvent<HighlightIngestWorkflowParams> = {
      instanceId: 'test-outside-window',
      workflowName: 'highlight-ingest-workflow',
      timestamp: new Date('2026-09-15T03:00:00Z'),
      payload: {
        referenceTimeMs: Date.UTC(2026, 8, 15, 3, 0, 0),
        force: false,
      },
    };

    const result = await workflow.run(event, mockStep);

    expect(mockStep.executedSteps.length).toBe(0);
    expect(result.totalFetched).toBe(0);
    expect(result.errors).toEqual(['Skipped: outside active match window']);
  });

  it('bypasses active match window check when force is true', async () => {
    mockDb.mockMatches = []; // No active matches

    globalThis.fetch = createMockFetch(async () => {
      return new Response(createAtomFeed([]), {
        status: 200,
        headers: { 'Content-Type': 'application/atom+xml' },
      });
    });

    const env: CloudflareEnv = {
      DB: mockDb,
      REDDIT_USER_AGENT: 'test-agent',
    };

    const workflow = new HighlightIngestWorkflow(mockCtx, env);
    const event: WorkflowEvent<HighlightIngestWorkflowParams> = {
      instanceId: 'test-forced-run',
      workflowName: 'highlight-ingest-workflow',
      timestamp: new Date('2026-09-15T03:00:00Z'),
      payload: {
        force: true,
      },
    };

    const result = await workflow.run(event, mockStep);

    expect(mockStep.executedSteps).toContain('fetch-reddit-highlights');
    expect(result.totalFetched).toBe(0);
  });

  it('handles empty feed response by completing early after Step 1', async () => {
    const kickoffMs = Date.UTC(2026, 8, 15, 15, 0, 0);
    mockDb.mockMatches = [
      {
        id: 'match-101',
        match_date: '2026-09-15',
        team_home: 'Arsenal',
        team_away: 'Chelsea',
        kickoff_time: kickoffMs,
        status: '1H',
      },
    ];

    globalThis.fetch = createMockFetch(async () => {
      return new Response(createAtomFeed([]), {
        status: 200,
        headers: { 'Content-Type': 'application/atom+xml' },
      });
    });

    const env: CloudflareEnv = {
      DB: mockDb,
      REDDIT_USER_AGENT: 'test-agent',
    };

    const workflow = new HighlightIngestWorkflow(mockCtx, env);
    const event: WorkflowEvent<HighlightIngestWorkflowParams> = {
      instanceId: 'test-empty-feed',
      workflowName: 'highlight-ingest-workflow',
      timestamp: new Date(kickoffMs),
      payload: { referenceTimeMs: kickoffMs },
    };

    const result = await workflow.run(event, mockStep);

    expect(mockStep.executedSteps).toEqual(['fetch-reddit-highlights']);
    expect(result.totalFetched).toBe(0);
    expect(result.persistedCount).toBe(0);
  });

  it('completes early after Step 2 if no posts matched candidate fixtures', async () => {
    const kickoffMs = Date.UTC(2026, 8, 15, 15, 0, 0);
    mockDb.mockMatches = [
      {
        id: 'match-101',
        match_date: '2026-09-15',
        team_home: 'Arsenal',
        team_away: 'Chelsea',
        kickoff_time: kickoffMs,
        status: '1H',
      },
    ];

    // Post for untracked teams
    const feedXml = createAtomFeed([
      {
        id: 't3_untracked',
        title: 'SomeUntrackedTeam 1 - [2] OtherUntrackedTeam 45',
        url: 'https://dubz.co/v/abc',
        permalink: '/r/soccer/comments/untracked/',
        updated: new Date(kickoffMs).toISOString(),
      },
    ]);

    globalThis.fetch = createMockFetch(async () => {
      return new Response(feedXml, {
        status: 200,
        headers: { 'Content-Type': 'application/atom+xml' },
      });
    });

    const env: CloudflareEnv = {
      DB: mockDb,
      REDDIT_USER_AGENT: 'test-agent',
    };

    const workflow = new HighlightIngestWorkflow(mockCtx, env);
    const event: WorkflowEvent<HighlightIngestWorkflowParams> = {
      instanceId: 'test-unmatched-posts',
      workflowName: 'highlight-ingest-workflow',
      timestamp: new Date(kickoffMs),
      payload: { referenceTimeMs: kickoffMs },
    };

    const result = await workflow.run(event, mockStep);

    expect(mockStep.executedSteps).toEqual([
      'fetch-reddit-highlights',
      'match-and-prepare-highlights',
    ]);
    expect(result.totalFetched).toBe(1);
    expect(result.matchedCount).toBe(0);
    expect(result.persistedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
  });

  it('correctly filters non-senior squads and inverted scorelines in Step 2', async () => {
    const kickoffMs = Date.UTC(2026, 8, 15, 15, 0, 0);
    mockDb.mockMatches = [
      {
        id: 'match-101',
        match_date: '2026-09-15',
        team_home: 'Arsenal',
        team_away: 'Chelsea',
        kickoff_time: kickoffMs,
        status: '1H',
      },
    ];

    const feedXml = createAtomFeed([
      {
        id: 't3_u21',
        title: 'Arsenal U21 [1] - 0 Chelsea U21',
        url: 'https://dubz.co/v/u21',
        permalink: '/r/soccer/comments/u21/',
        updated: new Date(kickoffMs).toISOString(),
      },
      {
        id: 't3_inverted',
        title: 'Chelsea 0 - [1] Arsenal - Saka 30',
        url: 'https://dubz.co/v/inverted',
        permalink: '/r/soccer/comments/inverted/',
        updated: new Date(kickoffMs).toISOString(),
      },
    ]);

    globalThis.fetch = createMockFetch(async () => {
      return new Response(feedXml, {
        status: 200,
        headers: { 'Content-Type': 'application/atom+xml' },
      });
    });

    const env: CloudflareEnv = {
      DB: mockDb,
      REDDIT_USER_AGENT: 'test-agent',
    };

    const workflow = new HighlightIngestWorkflow(mockCtx, env);
    const event: WorkflowEvent<HighlightIngestWorkflowParams> = {
      instanceId: 'test-filter-inverted',
      workflowName: 'highlight-ingest-workflow',
      timestamp: new Date(kickoffMs),
      payload: { referenceTimeMs: kickoffMs },
    };

    const result = await workflow.run(event, mockStep);

    // One non-senior skipped, one inverted matched
    expect(result.totalFetched).toBe(2);
    expect(result.parsedCount).toBe(1);
    expect(result.matchedCount).toBe(1);
    expect(result.persistedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
  });

  it('deduplicates identical goals via goalFingerprint in Step 2', async () => {
    const kickoffMs = Date.UTC(2026, 8, 15, 15, 0, 0);
    mockDb.mockMatches = [
      {
        id: 'match-101',
        match_date: '2026-09-15',
        team_home: 'Arsenal',
        team_away: 'Chelsea',
        kickoff_time: kickoffMs,
        status: '1H',
      },
    ];

    // Two posts for the exact same goal
    const feedXml = createAtomFeed([
      {
        id: 't3_post1',
        title: 'Arsenal [1] - 0 Chelsea - Bukayo Saka 20',
        url: 'https://dubz.co/v/1',
        permalink: '/r/soccer/comments/post1/',
        updated: new Date(kickoffMs).toISOString(),
      },
      {
        id: 't3_post2',
        title: 'Arsenal [1] - 0 Chelsea - Bukayo Saka 20 (Great Goal)',
        url: 'https://streamff.com/v/2',
        permalink: '/r/soccer/comments/post2/',
        updated: new Date(kickoffMs).toISOString(),
      },
    ]);

    globalThis.fetch = createMockFetch(async () => {
      return new Response(feedXml, {
        status: 200,
        headers: { 'Content-Type': 'application/atom+xml' },
      });
    });

    const env: CloudflareEnv = {
      DB: mockDb,
      REDDIT_USER_AGENT: 'test-agent',
    };

    const workflow = new HighlightIngestWorkflow(mockCtx, env);
    const event: WorkflowEvent<HighlightIngestWorkflowParams> = {
      instanceId: 'test-dedup',
      workflowName: 'highlight-ingest-workflow',
      timestamp: new Date(kickoffMs),
      payload: { referenceTimeMs: kickoffMs },
    };

    const result = await workflow.run(event, mockStep);

    expect(result.totalFetched).toBe(2);
    expect(result.matchedCount).toBe(1);
    expect(result.persistedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
  });

  it('throws retryable error when D1 batch persistence fails in Step 3', async () => {
    const kickoffMs = Date.UTC(2026, 8, 15, 15, 0, 0);
    mockDb.mockMatches = [
      {
        id: 'match-101',
        match_date: '2026-09-15',
        team_home: 'Arsenal',
        team_away: 'Chelsea',
        kickoff_time: kickoffMs,
        status: '1H',
      },
    ];
    mockDb.shouldFailBatch = true; // Simulate database locked

    const feedXml = createAtomFeed([
      {
        id: 't3_goal1',
        title: 'Arsenal [1] - 0 Chelsea - Bukayo Saka 20',
        url: 'https://dubz.co/v/1',
        permalink: '/r/soccer/comments/goal1/',
        updated: new Date(kickoffMs).toISOString(),
      },
    ]);

    globalThis.fetch = createMockFetch(async () => {
      return new Response(feedXml, {
        status: 200,
        headers: { 'Content-Type': 'application/atom+xml' },
      });
    });

    const env: CloudflareEnv = {
      DB: mockDb,
      REDDIT_USER_AGENT: 'test-agent',
    };

    const workflow = new HighlightIngestWorkflow(mockCtx, env);
    const event: WorkflowEvent<HighlightIngestWorkflowParams> = {
      instanceId: 'test-batch-fail',
      workflowName: 'highlight-ingest-workflow',
      timestamp: new Date(kickoffMs),
      payload: { referenceTimeMs: kickoffMs },
    };

    await expect(workflow.run(event, mockStep)).rejects.toThrow(
      'D1 persistence failed',
    );
    expect(mockStep.executedSteps).toContain('persist-highlights-batch');
  });

  it('isolates step failures and retries without re-executing completed checkpointed steps', async () => {
    const kickoffMs = Date.UTC(2026, 8, 15, 15, 0, 0);
    mockDb.mockMatches = [
      {
        id: 'match-101',
        match_date: '2026-09-15',
        team_home: 'Arsenal',
        team_away: 'Chelsea',
        kickoff_time: kickoffMs,
        status: '1H',
      },
    ];

    const feedXml = createAtomFeed([
      {
        id: 't3_goal1',
        title: 'Arsenal [1] - 0 Chelsea - Bukayo Saka 20',
        url: 'https://dubz.co/v/1',
        permalink: '/r/soccer/comments/goal1/',
        updated: new Date(kickoffMs).toISOString(),
      },
    ]);

    globalThis.fetch = createMockFetch(async () => {
      return new Response(feedXml, {
        status: 200,
        headers: { 'Content-Type': 'application/atom+xml' },
      });
    });

    // Custom retry harness that fails Step 3 once, then succeeds
    class RetryableWorkflowStep extends MockWorkflowStep {
      private step3Attempt = 0;

      // SAFETY: Typed as WorkflowStep['do'] to match internal Cloudflare overload discriminators
      override do: WorkflowStep['do'] = (async <T>(
        name: string,
        configOrCallback: MockStepConfig | MockStepFunction<T>,
        callback?: MockStepFunction<T>,
      ): Promise<T> => {
        this.executedSteps.push(name);
        // SAFETY: If callback is passed, configOrCallback is configuration; otherwise it is the callback function
        const stepFn = callback ?? (configOrCallback as MockStepFunction<T>);
        // SAFETY: Minimal step context satisfies retry harness
        const ctx = {} as WorkflowStepContext<WorkflowSleepDuration>;

        if (name === 'persist-highlights-batch') {
          this.step3Attempt++;
          if (this.step3Attempt === 1) {
            mockDb.shouldFailBatch = true;
          } else {
            mockDb.shouldFailBatch = false;
          }
        }

        try {
          const output = await stepFn(ctx);
          this.stepOutputs.set(name, output);
          return output;
        } catch {
          this.executedSteps.push(`${name}-retry`);
          mockDb.shouldFailBatch = false;
          const output = await stepFn(ctx);
          this.stepOutputs.set(name, output);
          return output;
        }
      }) as WorkflowStep['do'];
    }

    const retryableStep = new RetryableWorkflowStep();
    const env: CloudflareEnv = {
      DB: mockDb,
      REDDIT_USER_AGENT: 'test-agent',
    };

    const workflow = new HighlightIngestWorkflow(mockCtx, env);
    const event: WorkflowEvent<HighlightIngestWorkflowParams> = {
      instanceId: 'test-step-retry',
      workflowName: 'highlight-ingest-workflow',
      timestamp: new Date(kickoffMs),
      payload: { referenceTimeMs: kickoffMs },
    };

    const result = await workflow.run(event, retryableStep);

    // Step 1 and 2 only executed once
    expect(
      retryableStep.executedSteps.filter((s) => s === 'fetch-reddit-highlights')
        .length,
    ).toBe(1);
    expect(
      retryableStep.executedSteps.filter(
        (s) => s === 'match-and-prepare-highlights',
      ).length,
    ).toBe(1);

    // Step 3 retried
    expect(retryableStep.executedSteps).toContain('persist-highlights-batch');
    expect(retryableStep.executedSteps).toContain(
      'persist-highlights-batch-retry',
    );
    expect(result.persistedCount).toBe(1);
  });
});
