import { createFileRoute } from '@tanstack/react-router';
import { ingestRedditHighlights, type IngestResult } from '../../server/ingest';
import type { CloudflareEnv } from '../../types/env';

interface CronSuccessResponse {
  success: true;
  summary: IngestResult;
  durationMs: number;
}

interface CronErrorResponse {
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

  // 1. Resolve Cloudflare environment bindings
  const env = context?.env;
  const expectedSecret = env?.CRON_SECRET;

  // 2. Enforce Bearer authentication
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;

  if (!expectedSecret || !token || token !== expectedSecret) {
    const body: CronErrorResponse = { success: false, error: 'Unauthorized' };
    return new Response(JSON.stringify(body), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 3. Execute ingestion pipeline
  try {
    if (!env?.DB) {
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

    const config =
      env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET
        ? {
            clientId: env.REDDIT_CLIENT_ID,
            clientSecret: env.REDDIT_CLIENT_SECRET,
            userAgent: env.REDDIT_USER_AGENT,
          }
        : {
            userAgent: env.REDDIT_USER_AGENT,
          };

    console.log('[API:CRON] Manual ingestion execution started');
    const summary = await ingestRedditHighlights(env.DB, config);
    const durationMs = Date.now() - startTime;

    console.log(
      `[API:CRON] Manual ingestion concluded in ${durationMs}ms: fetched=${summary.totalFetched}, persisted=${summary.persistedCount}`,
    );

    const body: CronSuccessResponse = {
      success: true,
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
