import { describe, it, expect, afterEach, spyOn } from 'bun:test';
import { z } from 'zod';
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  D1ExecResult,
  D1DatabaseSession,
  D1Meta,
  Workflow,
  WorkflowInstance,
  InstanceStatus,
  WorkflowInstanceCreateOptions,
  WorkflowBatchDeleteResult,
} from '@cloudflare/workers-types';
import { handleCronPost, postServerHandler, Route } from './cron';
import type {
  CloudflareEnv,
  HighlightIngestWorkflowParams,
} from '../../types/env';

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
      throw new Error('D1 connection failure');
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
  summary: z.object({
    totalFetched: z.number(),
  }),
  durationMs: z.number(),
});

const SkippedResponseSchema = z.object({
  success: z.literal(true),
  skipped: z.literal(true),
  reason: z.string(),
  durationMs: z.number(),
});

const WorkflowSuccessResponseSchema = z.object({
  success: z.literal(true),
  mode: z.literal('workflow'),
  instanceId: z.string(),
  durationMs: z.number(),
});

class MockWorkflowInstance implements WorkflowInstance {
  constructor(
    public id: string,
    public currentStatus: InstanceStatus = { status: 'running' },
  ) {}
  async pause(): Promise<void> {}
  async resume(): Promise<void> {}
  async terminate(): Promise<void> {}
  async restart(): Promise<void> {}
  async delete(): Promise<void> {}
  async status(): Promise<InstanceStatus> {
    return this.currentStatus;
  }
  async sendEvent(): Promise<void> {}
}

class MockWorkflowBinding<T = unknown> implements Workflow<T> {
  constructor(
    private readonly createFn?: (
      options?: WorkflowInstanceCreateOptions<T>,
    ) => Promise<WorkflowInstance>,
  ) {}

  async create(
    options?: WorkflowInstanceCreateOptions<T>,
  ): Promise<WorkflowInstance> {
    if (this.createFn) {
      return this.createFn(options);
    }
    return new MockWorkflowInstance(options?.id ?? 'wf-manual-1');
  }

  async get(id: string): Promise<WorkflowInstance> {
    return new MockWorkflowInstance(id);
  }

  async createBatch(): Promise<WorkflowInstance[]> {
    return [];
  }

  async deleteBatch(): Promise<WorkflowBatchDeleteResult> {
    return { deleted: [], errors: [] };
  }
}

describe('/api/cron handler', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects request without Authorization header (401)', async () => {
    const env: CloudflareEnv = {
      DB: new TestD1Database(),
      CRON_SECRET: 'super-secret',
    };

    const request = new Request('http://localhost/api/cron', {
      method: 'POST',
    });

    const response = await handleCronPost(request, { env });
    expect(response.status).toBe(401);

    const body = ErrorResponseSchema.parse(await response.json());
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('rejects request with invalid Bearer token (401)', async () => {
    const env: CloudflareEnv = {
      DB: new TestD1Database(),
      CRON_SECRET: 'super-secret',
    };

    const request = new Request('http://localhost/api/cron', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer wrong-secret',
      },
    });

    const response = await handleCronPost(request, { env });
    expect(response.status).toBe(401);

    const body = ErrorResponseSchema.parse(await response.json());
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('rejects request with non-Bearer Authorization header like Basic (401)', async () => {
    const env: CloudflareEnv = {
      DB: new TestD1Database(),
      CRON_SECRET: 'super-secret',
    };

    const request = new Request('http://localhost/api/cron', {
      method: 'POST',
      headers: {
        Authorization: 'Basic c3VwZXItc2VjcmV0',
      },
    });

    const response = await handleCronPost(request, { env });
    expect(response.status).toBe(401);

    const body = ErrorResponseSchema.parse(await response.json());
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('rejects request with empty Bearer token (401)', async () => {
    const env: CloudflareEnv = {
      DB: new TestD1Database(),
      CRON_SECRET: 'super-secret',
    };

    const request = new Request('http://localhost/api/cron', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer   ',
      },
    });

    const response = await handleCronPost(request, { env });
    expect(response.status).toBe(401);

    const body = ErrorResponseSchema.parse(await response.json());
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('rejects request when CRON_SECRET is unset (401)', async () => {
    const env: CloudflareEnv = {
      DB: new TestD1Database(),
      CRON_SECRET: undefined,
    };

    const request = new Request('http://localhost/api/cron', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer some-token',
      },
    });

    const response = await handleCronPost(request, { env });
    expect(response.status).toBe(401);

    const body = ErrorResponseSchema.parse(await response.json());
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 500 when database binding (DB) is unavailable', async () => {
    const request = new Request('http://localhost/api/cron', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer super-secret',
      },
    });

    // SAFETY: testing intentional runtime omission of DB binding
    const partialEnv = {
      CRON_SECRET: 'super-secret',
    } as CloudflareEnv;

    const response = await handleCronPost(request, { env: partialEnv });
    expect(response.status).toBe(500);

    const body = ErrorResponseSchema.parse(await response.json());
    expect(body.success).toBe(false);
    expect(body.error).toBe('Server configuration error');
  });

  it('executes ingestion and returns 200 with stats for valid token', async () => {
    const env: CloudflareEnv = {
      DB: new TestD1Database(),
      CRON_SECRET: 'super-secret',
      REDDIT_USER_AGENT: 'test-agent',
    };

    globalThis.fetch = createMockFetch(async () => {
      return new Response(
        JSON.stringify({
          kind: 'Listing',
          data: { children: [] },
        }),
        { status: 200 },
      );
    });

    const request = new Request('http://localhost/api/cron', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer super-secret',
      },
    });

    const consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});

    const response = await handleCronPost(request, { env });
    expect(response.status).toBe(200);

    const body = SuccessResponseSchema.parse(await response.json());
    expect(body.success).toBe(true);
    expect(body.summary.totalFetched).toBe(0);
    expect(body.durationMs).toBeGreaterThanOrEqual(0);

    consoleLogSpy.mockRestore();
  });

  it('returns 500 with error details if ingestion throws', async () => {
    const envWithCrashingDb: CloudflareEnv = {
      CRON_SECRET: 'super-secret',
      get DB(): D1Database {
        throw new Error('D1 connection failure');
      },
    };

    const request = new Request('http://localhost/api/cron', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer super-secret',
      },
    });

    const consoleErrorSpy = spyOn(console, 'error').mockImplementation(
      () => {},
    );

    const response = await handleCronPost(request, { env: envWithCrashingDb });

    expect(response.status).toBe(500);
    const body = ErrorResponseSchema.parse(await response.json());
    expect(body.success).toBe(false);
    expect(body.error).toBe('Ingestion failed');
    expect(body.details).toContain('D1 connection failure');

    consoleErrorSpy.mockRestore();
  });

  it('skips manual ingestion when skipOutsideGameHours=true and no active matches exist', async () => {
    const env: CloudflareEnv = {
      DB: new TestD1Database(),
      CRON_SECRET: 'super-secret',
    };

    const request = new Request(
      'http://localhost/api/cron?skipOutsideGameHours=true',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer super-secret',
        },
      },
    );

    const response = await handleCronPost(request, { env });
    expect(response.status).toBe(200);

    const json = SkippedResponseSchema.parse(await response.json());
    expect(json.success).toBe(true);
    expect(json.skipped).toBe(true);
    expect(json.reason).toBe('outside_game_hours');
  });

  it('delegates POST handler defined on Route server options', async () => {
    expect(Route.options.server).toBeDefined();

    const env: CloudflareEnv = {
      DB: new TestD1Database(),
      CRON_SECRET: 'super-secret',
    };

    const request = new Request('http://localhost/api/cron', {
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

  it('dispatches to HIGHLIGHT_INGEST_WORKFLOW when binding is present', async () => {
    let capturedOptions:
      WorkflowInstanceCreateOptions<HighlightIngestWorkflowParams> | undefined;
    const workflowBinding =
      new MockWorkflowBinding<HighlightIngestWorkflowParams>(
        async (options) => {
          capturedOptions = options;
          return new MockWorkflowInstance(
            options?.id ?? 'wf-manual-highlight-1',
          );
        },
      );

    const env: CloudflareEnv = {
      DB: new TestD1Database(),
      CRON_SECRET: 'super-secret',
      HIGHLIGHT_INGEST_WORKFLOW: workflowBinding,
      REDDIT_USER_AGENT: 'test-agent',
    };

    const request = new Request('http://localhost/api/cron', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer super-secret',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instanceId: 'custom-ingest-inst-1',
        force: true,
      }),
    });

    const response = await handleCronPost(request, { env });
    expect(response.status).toBe(200);

    const body = WorkflowSuccessResponseSchema.parse(await response.json());
    expect(body.success).toBe(true);
    expect(body.mode).toBe('workflow');
    expect(body.instanceId).toBe('custom-ingest-inst-1');
    expect(capturedOptions?.id).toBe('custom-ingest-inst-1');
    expect(capturedOptions?.params?.force).toBe(true);
  });

  it('returns 409 conflict when workflow instance already exists', async () => {
    const workflowBinding =
      new MockWorkflowBinding<HighlightIngestWorkflowParams>(
        async (options) => {
          throw new Error(`Instance with id '${options?.id}' already exists`);
        },
      );

    const env: CloudflareEnv = {
      DB: new TestD1Database(),
      CRON_SECRET: 'super-secret',
      HIGHLIGHT_INGEST_WORKFLOW: workflowBinding,
    };

    const request = new Request('http://localhost/api/cron', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer super-secret',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instanceId: 'duplicate-inst-id',
        force: true,
      }),
    });

    const response = await handleCronPost(request, { env });
    expect(response.status).toBe(409);

    const body = ErrorResponseSchema.parse(await response.json());
    expect(body.success).toBe(false);
    expect(body.error).toBe('Workflow instance already exists');
  });

  it('returns 500 when mode=workflow is explicitly requested but HIGHLIGHT_INGEST_WORKFLOW binding is absent', async () => {
    const env: CloudflareEnv = {
      DB: new TestD1Database(),
      CRON_SECRET: 'super-secret',
      // HIGHLIGHT_INGEST_WORKFLOW omitted
    };

    const request = new Request('http://localhost/api/cron?mode=workflow', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer super-secret',
      },
    });

    const response = await handleCronPost(request, { env });
    expect(response.status).toBe(500);

    const body = ErrorResponseSchema.parse(await response.json());
    expect(body.success).toBe(false);
    expect(body.error).toBe('Server configuration error');
  });
});
