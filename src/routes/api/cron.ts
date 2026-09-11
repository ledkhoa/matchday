import { createFileRoute } from '@tanstack/react-router';
import {
  ingestRedditHighlights,
  hasActiveMatchWindow,
  type IngestResult,
} from '../../server/ingest';
import type { CloudflareEnv } from '../../types/env';

interface CronSuccessResponse {
  success: true;
  summary?: IngestResult;
  durationMs: number;
  skipped?: boolean;
  reason?: string;
  nextMatch?: {
    teamHome: string;
    teamAway: string;
    kickoffTime: number | null;
  } | null;
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
    const skipOutsideGameHours =
      url.searchParams.get('skipOutsideGameHours') === 'true';

    if (skipOutsideGameHours) {
      const windowCheck = await hasActiveMatchWindow(env.DB);
      if (!windowCheck.hasActiveMatches) {
        const durationMs = Date.now() - startTime;
        console.log(
          '[API:CRON] Skipping manual ingestion: outside active game hours',
        );
        const body: CronSuccessResponse = {
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
