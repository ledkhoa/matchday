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
const { FixtureSyncWorkflow } = await import('./fixture-sync');
type FixtureSyncWorkflowParams =
  import('./fixture-sync').FixtureSyncWorkflowParams;

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
}

interface MockHighlightDbRow {
  id: string;
  match_id: string;
  score_home?: number | null;
  score_away?: number | null;
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
      const columns = [
        'id',
        'match_date',
        'team_home',
        'team_away',
        'score_home',
        'score_away',
        'status',
      ];
      const rows: (string | number | null)[][] = this.mockMatches.map((m) => [
        m.id,
        m.match_date,
        m.team_home,
        m.team_away,
        m.score_home ?? null,
        m.score_away ?? null,
        m.status ?? null,
      ]);
      if (options?.columnNames) {
        // SAFETY: D1 raw contract specifies tuple with column names as first element
        return [columns, ...rows] as [string[], ...T[]];
      }
      // SAFETY: D1 raw contract specifies array of row arrays
      return rows as T[];
    }
    if (q.includes('from "highlights"') || q.includes('from `highlights`')) {
      const columns = ['id', 'match_id', 'score_home', 'score_away'];
      const rows: (string | number | null)[][] = this.mockHighlights.map(
        (h) => [h.id, h.match_id, h.score_home ?? null, h.score_away ?? null],
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

  prepare(query: string): D1PreparedStatement {
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
  public sleptDurations: Array<{ name: string; duration: string | number }> =
    [];
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

  async sleep(name: string, duration: WorkflowSleepDuration): Promise<void> {
    this.sleptDurations.push({ name, duration });
  }

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

describe('FixtureSyncWorkflow', () => {
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

  it('executes all 6 steps in strict sequence on happy path', async () => {
    const requestedUrls: string[] = [];
    globalThis.fetch = createMockFetch(async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      const isToday = url.includes('date=2026-09-15');

      return new Response(
        JSON.stringify({
          get: 'fixtures',
          results: 1,
          response: [
            {
              fixture: {
                id: isToday ? 101 : 100,
                date: isToday ? '2026-09-15T20:00:00Z' : '2026-09-14T15:00:00Z',
                timestamp: isToday ? 1789502400 : 1789416000,
                status: { short: isToday ? 'NS' : 'FT' },
              },
              league: { id: 39, name: 'Premier League' },
              teams: {
                home: { id: 1, name: 'Arsenal' },
                away: { id: 2, name: 'Chelsea' },
              },
              goals: { home: isToday ? null : 2, away: isToday ? null : 1 },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    mockDb.mockMatches = [
      {
        id: '100',
        match_date: '2026-09-14',
        team_home: 'Arsenal',
        team_away: 'Chelsea',
        score_home: 2,
        score_away: 1,
        status: 'FT',
      },
    ];
    mockDb.mockHighlights = [
      {
        id: 'h-1',
        match_id: '100',
        score_home: 1,
        score_away: 0,
      },
      {
        id: 'h-2',
        match_id: '100',
        score_home: 2,
        score_away: 0,
      },
      {
        id: 'h-3',
        match_id: '100',
        score_home: 2,
        score_away: 1,
      },
    ];

    const env: CloudflareEnv = {
      DB: mockDb,
      API_FOOTBALL_KEY: 'valid-test-key',
    };

    const workflow = new FixtureSyncWorkflow(mockCtx, env);
    const event: WorkflowEvent<FixtureSyncWorkflowParams> = {
      instanceId: 'fixture-sync-2026-09-15',
      workflowName: 'fixture-sync-workflow',
      timestamp: new Date('2026-09-15T00:00:00Z'),
      payload: {
        date: '2026-09-15',
        reconcileHighlights: true,
      },
    };

    const result = await workflow.run(event, mockStep);

    // Verify 6 distinct steps executed in strict sequence
    expect(mockStep.executedSteps).toEqual([
      'today-fixtures-fetch',
      'today-fixtures-persist',
      'yesterday-fixtures-fetch',
      'yesterday-fixtures-persist',
      'highlight-reconciliation',
    ]);

    // Verify durable sleep cooldown was called with 10 seconds
    expect(mockStep.sleptDurations).toEqual([
      { name: 'api-cooldown', duration: '10 seconds' },
    ]);

    // Verify D1 persistence batch was called for both today and yesterday
    expect(mockDb.batchCalls.length).toBe(2);

    // Verify step outputs and workflow return shape
    expect(result.instanceId).toBe('fixture-sync-2026-09-15');
    expect(result.targetDate).toBe('2026-09-15');
    expect(result.yesterdayDate).toBe('2026-09-14');
    expect(result.todaySync.supportedFound).toBe(1);
    expect(result.todaySync.persistedCount).toBe(1);
    expect(result.yesterdaySync.supportedFound).toBe(1);
    expect(result.yesterdaySync.persistedCount).toBe(1);
    expect(result.reconciliation?.auditedMatchesCount).toBe(1);
    expect(result.reconciliation?.auditedHighlightsCount).toBe(3);
    expect(result.reconciliation?.discrepancies.length).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('throws NonRetryableError immediately when API_FOOTBALL_KEY is missing', async () => {
    const env: CloudflareEnv = {
      DB: mockDb,
      // API_FOOTBALL_KEY missing
    };

    const workflow = new FixtureSyncWorkflow(mockCtx, env);
    const event: WorkflowEvent<FixtureSyncWorkflowParams> = {
      instanceId: 'fixture-sync-2026-09-15',
      workflowName: 'fixture-sync-workflow',
      timestamp: new Date('2026-09-15T00:00:00Z'),
      payload: {},
    };

    await expect(workflow.run(event, mockStep)).rejects.toThrow(
      'API_FOOTBALL_KEY is missing or unconfigured',
    );

    expect(mockStep.executedSteps.length).toBe(0);
  });

  it('throws NonRetryableError immediately when DB binding is missing', async () => {
    // SAFETY: testing intentional runtime omission of DB binding
    const partialEnv = {
      API_FOOTBALL_KEY: 'valid-test-key',
    } as CloudflareEnv;

    const workflow = new FixtureSyncWorkflow(mockCtx, partialEnv);
    const event: WorkflowEvent<FixtureSyncWorkflowParams> = {
      instanceId: 'fixture-sync-2026-09-15',
      workflowName: 'fixture-sync-workflow',
      timestamp: new Date('2026-09-15T00:00:00Z'),
      payload: {},
    };

    await expect(workflow.run(event, mockStep)).rejects.toThrow(
      'D1 Database binding (DB) is unavailable',
    );
  });

  it('throws NonRetryableError when API returns unauthorized 401 error', async () => {
    globalThis.fetch = createMockFetch(async () => {
      return new Response(
        JSON.stringify({
          errors: {
            token: 'Error: Unauthorized. Invalid API Key.',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const env: CloudflareEnv = {
      DB: mockDb,
      API_FOOTBALL_KEY: 'invalid-key',
    };

    const workflow = new FixtureSyncWorkflow(mockCtx, env);
    const event: WorkflowEvent<FixtureSyncWorkflowParams> = {
      instanceId: 'fixture-sync-2026-09-15',
      workflowName: 'fixture-sync-workflow',
      timestamp: new Date('2026-09-15T00:00:00Z'),
      payload: {},
    };

    await expect(workflow.run(event, mockStep)).rejects.toThrow();

    expect(mockStep.executedSteps).toContain('today-fixtures-fetch');
    // Ensure it stopped before persisting or sleeping
    expect(mockStep.executedSteps).not.toContain('today-fixtures-persist');
    expect(mockStep.sleptDurations.length).toBe(0);
  });

  it('isolates step failures and retries without re-executing completed checkpointed steps', async () => {
    let yesterdayAttempts = 0;
    globalThis.fetch = createMockFetch(async (input) => {
      const url = String(input);
      if (url.includes('date=2026-09-14')) {
        yesterdayAttempts++;
        if (yesterdayAttempts === 1) {
          throw new Error('Transient network glitch on yesterday fetch');
        }
      }
      return new Response(
        JSON.stringify({
          get: 'fixtures',
          results: 1,
          response: [
            {
              fixture: {
                id: 101,
                date: '2026-09-15T20:00:00Z',
                timestamp: 1789502400,
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

    const env: CloudflareEnv = {
      DB: mockDb,
      API_FOOTBALL_KEY: 'valid-test-key',
    };

    // Custom step harness that simulates retry of failed step
    class RetryableWorkflowStep extends MockWorkflowStep {
      // SAFETY: Typed as WorkflowStep['do'] to match internal Cloudflare overload discriminators
      override do: WorkflowStep['do'] = (async <T>(
        name: string,
        configOrCallback: MockStepConfig | MockStepFunction<T>,
        callback?: MockStepFunction<T>,
      ): Promise<T> => {
        this.executedSteps.push(name);
        // SAFETY: If callback is passed, configOrCallback is configuration; otherwise it is the callback function
        const stepFn = callback ?? (configOrCallback as MockStepFunction<T>);
        try {
          // SAFETY: Minimal step context satisfies retry harness
          const ctx = {} as WorkflowStepContext<WorkflowSleepDuration>;
          const output = await stepFn(ctx);
          this.stepOutputs.set(name, output);
          return output;
        } catch {
          // Retry step once
          this.executedSteps.push(`${name}-retry`);
          // SAFETY: Minimal step context satisfies retry harness
          const ctx = {} as WorkflowStepContext<WorkflowSleepDuration>;
          const output = await stepFn(ctx);
          this.stepOutputs.set(name, output);
          return output;
        }
      }) as WorkflowStep['do'];
    }
    const retryableStep = new RetryableWorkflowStep();

    const workflow = new FixtureSyncWorkflow(mockCtx, env);
    const event: WorkflowEvent<FixtureSyncWorkflowParams> = {
      instanceId: 'fixture-sync-2026-09-15',
      workflowName: 'fixture-sync-workflow',
      timestamp: new Date('2026-09-15T00:00:00Z'),
      payload: { date: '2026-09-15', reconcileHighlights: false },
    };

    const result = await workflow.run(event, retryableStep);

    // today-fixtures-fetch and today-fixtures-persist were only executed ONCE
    expect(
      retryableStep.executedSteps.filter((s) => s === 'today-fixtures-fetch')
        .length,
    ).toBe(1);
    expect(
      retryableStep.executedSteps.filter((s) => s === 'today-fixtures-persist')
        .length,
    ).toBe(1);

    // yesterday-fixtures-fetch failed initially and was retried
    expect(retryableStep.executedSteps).toContain('yesterday-fixtures-fetch');
    expect(retryableStep.executedSteps).toContain(
      'yesterday-fixtures-fetch-retry',
    );

    // Final result succeeded after step 4 retry
    expect(result.yesterdaySync.persistedCount).toBe(1);
    expect(result.yesterdaySync.supportedFound).toBe(1);
  });

  it('skips highlight reconciliation when reconcileHighlights is false', async () => {
    globalThis.fetch = createMockFetch(async () => {
      return new Response(
        JSON.stringify({
          get: 'fixtures',
          results: 1,
          response: [
            {
              fixture: {
                id: 100,
                date: '2026-09-15T15:00:00Z',
                timestamp: 1789484400,
                status: { short: 'NS' },
              },
              league: { name: 'Premier League', logo: 'https://logo.png' },
              teams: {
                home: { name: 'Arsenal', logo: 'https://arsenal.png' },
                away: { name: 'Chelsea', logo: 'https://chelsea.png' },
              },
              goals: { home: null, away: null },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const env: CloudflareEnv = {
      DB: mockDb,
      API_FOOTBALL_KEY: 'valid-test-key',
    };

    const workflow = new FixtureSyncWorkflow(mockCtx, env);
    const event: WorkflowEvent<FixtureSyncWorkflowParams> = {
      instanceId: 'fixture-sync-2026-09-15',
      workflowName: 'fixture-sync-workflow',
      timestamp: new Date('2026-09-15T00:00:00Z'),
      payload: {
        date: '2026-09-15',
        reconcileHighlights: false,
        cooldownDuration: '5 seconds',
      },
    };

    const result = await workflow.run(event, mockStep);

    expect(mockStep.executedSteps).not.toContain('highlight-reconciliation');
    expect(mockStep.sleptDurations).toEqual([
      { name: 'api-cooldown', duration: '5 seconds' },
    ]);
    expect(result.reconciliation).toBeUndefined();
  });

  it('flags discrepancies when finished matches have goals but zero linked highlights', async () => {
    globalThis.fetch = createMockFetch(async () => {
      return new Response(
        JSON.stringify({
          get: 'fixtures',
          results: 0,
          response: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    mockDb.mockMatches = [
      {
        id: '200',
        match_date: '2026-09-14',
        team_home: 'Liverpool',
        team_away: 'Man City',
        score_home: 3,
        score_away: 2,
        status: 'FT',
      },
    ];
    // No highlights linked to match 200
    mockDb.mockHighlights = [];

    const env: CloudflareEnv = {
      DB: mockDb,
      API_FOOTBALL_KEY: 'valid-test-key',
    };

    const workflow = new FixtureSyncWorkflow(mockCtx, env);
    const event: WorkflowEvent<FixtureSyncWorkflowParams> = {
      instanceId: 'fixture-sync-2026-09-15',
      workflowName: 'fixture-sync-workflow',
      timestamp: new Date('2026-09-15T00:00:00Z'),
      payload: { date: '2026-09-15', reconcileHighlights: true },
    };

    const result = await workflow.run(event, mockStep);

    expect(result.reconciliation?.discrepancies.length).toBe(1);
    expect(result.reconciliation?.discrepancies[0]).toContain(
      'Fixture Liverpool vs Man City ended 3-2 but has 0 linked highlights',
    );
  });
});
