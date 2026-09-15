import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import {
  ingestRedditHighlights,
  hasActiveMatchWindow,
  type IngestResult,
} from '../../server/ingest';
import type { CloudflareEnv } from '../../types/env';

const CronRequestBodySchema = z.object({
  instanceId: z.string().optional(),
  force: z.boolean().optional(),
  feedUrl: z.string().optional(),
  mode: z.enum(['workflow', 'direct']).optional(),
  skipOutsideGameHours: z.boolean().optional(),
});

interface CronDirectSuccessResponse {
  success: true;
  mode?: 'direct';
  summary: IngestResult;
  durationMs: number;
}

interface CronWorkflowSuccessResponse {
  success: true;
  mode: 'workflow';
  instanceId: string;
  durationMs: number;
}

interface CronSkippedResponse {
  success: true;
  skipped: true;
  reason: string;
  nextMatch?: {
    teamHome: string;
    teamAway: string;
    kickoffTime: number | null;
  } | null;
  durationMs: number;
}

export type CronSuccessResponse =
  CronDirectSuccessResponse | CronWorkflowSuccessResponse | CronSkippedResponse;

export interface CronErrorResponse {
  success: false;
  error: string;
  details?: string;
}

/**
 * Handles authenticated POST requests to /api/cron for manual ingestion triggering.
 */
export async function handleCronPost(
  request: Request,
  context?: { env?: CloudflareEnv },
): Promise<Response> {
  const startTime = Date.now();

  try {
    const authHeader = request.headers.get('Authorization');
    const env = context?.env;
    const expectedSecret = env?.CRON_SECRET;

    if (!expectedSecret) {
      console.error(
        '[API:CRON] CRON_SECRET is not configured in worker environment',
      );
      const body: CronErrorResponse = { success: false, error: 'Unauthorized' };
      return new Response(JSON.stringify(body), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
      console.warn('[API:CRON] Unauthorized manual ingestion request rejected');
      const body: CronErrorResponse = {
        success: false,
        error: 'Unauthorized',
        details: 'Invalid or missing Authorization header',
      };
      return new Response(JSON.stringify(body), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!env?.DB) {
      console.error(
        '[API:CRON] Database binding (DB) is missing from worker context',
      );
      const body: CronErrorResponse = {
        success: false,
        error: 'Server configuration error',
        details: 'Database binding (DB) is unavailable in worker context',
      };
      return new Response(JSON.stringify(body), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(request.url);
    let bodyInstanceId: string | undefined = undefined;
    let bodyFeedUrl: string | undefined = undefined;
    let bodyForce = false;
    let bodySkipOutsideGameHours = false;
    let bodyMode: 'workflow' | 'direct' | undefined = undefined;

    if (request.body) {
      try {
        const cloned = request.clone();
        const text = await cloned.text();
        if (text && text.trim().length > 0) {
          const json: unknown = JSON.parse(text);
          const parsed = CronRequestBodySchema.safeParse(json);
          if (parsed.success) {
            if (parsed.data.instanceId) {
              bodyInstanceId = parsed.data.instanceId.trim();
            }
            if (parsed.data.feedUrl) {
              bodyFeedUrl = parsed.data.feedUrl.trim();
            }
            if (parsed.data.force !== undefined) {
              bodyForce = parsed.data.force;
            }
            if (parsed.data.skipOutsideGameHours !== undefined) {
              bodySkipOutsideGameHours = parsed.data.skipOutsideGameHours;
            }
            if (parsed.data.mode) {
              bodyMode = parsed.data.mode;
            }
          }
        }
      } catch {
        // Body was not JSON; use query params
      }
    }

    const skipOutsideGameHours =
      bodySkipOutsideGameHours ||
      url.searchParams.get('skipOutsideGameHours') === 'true';
    const force = bodyForce || url.searchParams.get('force') === 'true';
    const queryMode = url.searchParams.get('mode');
    const requestedMode: 'workflow' | 'direct' | undefined =
      bodyMode ??
      (queryMode === 'workflow' || queryMode === 'direct'
        ? queryMode
        : undefined);

    if (skipOutsideGameHours && !force) {
      const windowCheck = await hasActiveMatchWindow(env.DB);
      if (!windowCheck.hasActiveMatches) {
        const durationMs = Date.now() - startTime;
        console.log(
          '[API:CRON] Skipping manual ingestion: outside active game hours',
        );
        const body: CronSkippedResponse = {
          success: true,
          skipped: true,
          reason: 'outside_game_hours',
          nextMatch: windowCheck.nextMatch,
          durationMs,
        };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Determine execution mode
    if (requestedMode === 'workflow' && !env.HIGHLIGHT_INGEST_WORKFLOW) {
      const body: CronErrorResponse = {
        success: false,
        error: 'Server configuration error',
        details:
          'HIGHLIGHT_INGEST_WORKFLOW binding is unavailable in worker context',
      };
      return new Response(JSON.stringify(body), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const shouldUseWorkflow =
      requestedMode === 'workflow' ||
      (requestedMode !== 'direct' && Boolean(env.HIGHLIGHT_INGEST_WORKFLOW));

    if (shouldUseWorkflow && env.HIGHLIGHT_INGEST_WORKFLOW) {
      const instanceId =
        bodyInstanceId || `highlight-ingest-manual-${Date.now()}`;

      try {
        const instance = await env.HIGHLIGHT_INGEST_WORKFLOW.create({
          id: instanceId,
          params: {
            referenceTimeMs: Date.now(),
            userAgent: env.REDDIT_USER_AGENT,
            feedUrl: bodyFeedUrl,
            force: force || undefined,
          },
        });

        const durationMs = Date.now() - startTime;
        console.log(
          `[API:CRON] Dispatched HighlightIngestWorkflow instance: ${instance.id}`,
        );

        const body: CronWorkflowSuccessResponse = {
          success: true,
          mode: 'workflow',
          instanceId: instance.id,
          durationMs,
        };

        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('already exists') || msg.includes('conflict')) {
          const body: CronErrorResponse = {
            success: false,
            error: 'Workflow instance already exists',
            details: `Instance ID '${instanceId}' already exists`,
          };
          return new Response(JSON.stringify(body), {
            status: 409,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        throw err;
      }
    }

    const config =
      env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET
        ? {
            clientId: env.REDDIT_CLIENT_ID,
            clientSecret: env.REDDIT_CLIENT_SECRET,
            userAgent: env.REDDIT_USER_AGENT,
            feedUrl: bodyFeedUrl,
          }
        : {
            userAgent: env.REDDIT_USER_AGENT,
            feedUrl: bodyFeedUrl,
          };

    console.log('[API:CRON] Manual ingestion execution started');
    const summary = await ingestRedditHighlights(env.DB, config);
    const durationMs = Date.now() - startTime;

    console.log(
      `[API:CRON] Manual ingestion concluded in ${durationMs}ms: fetched=${summary.totalFetched}, persisted=${summary.persistedCount}`,
    );

    const body: CronDirectSuccessResponse = {
      success: true,
      mode: 'direct',
      summary,
      durationMs,
    };

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    console.error(`[API:CRON] Ingestion execution failed: ${details}`);
    const body: CronErrorResponse = {
      success: false,
      error: 'Ingestion failed',
      details,
    };

    return new Response(JSON.stringify(body), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export interface PostHandlerArgs {
  request: Request;
  context?: {
    env?: CloudflareEnv;
  };
}

export const postServerHandler = async ({
  request,
  context,
}: PostHandlerArgs) => {
  return handleCronPost(request, context);
};

export const Route = createFileRoute('/api/cron')({
  server: {
    handlers: {
      POST: postServerHandler,
    },
  },
});
