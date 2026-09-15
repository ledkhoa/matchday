import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import {
  syncDailyFixtures,
  type FixtureSyncResult,
} from '../../server/api-football';
import type { CloudflareEnv } from '../../types/env';

const FixturesRequestBodySchema = z.object({
  date: z.string().optional(),
  instanceId: z.string().optional(),
  reconcileHighlights: z.boolean().optional(),
});

interface FixturesDirectSuccessResponse {
  success: true;
  mode?: 'direct';
  date: string;
  previousDate: string;
  summary: FixtureSyncResult;
  previousDaySummary: FixtureSyncResult;
  durationMs: number;
}

interface FixturesWorkflowSuccessResponse {
  success: true;
  mode: 'workflow';
  instanceId: string;
  date: string;
  previousDate: string;
  durationMs: number;
}

export type FixturesSuccessResponse =
  FixturesDirectSuccessResponse | FixturesWorkflowSuccessResponse;

interface FixturesErrorResponse {
  success: false;
  error: string;
  details?: string;
}

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Handles authenticated POST requests to /api/fixtures for manual fixture sync and backfills.
 */
export async function handleFixturesPost(
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
    const body: FixturesErrorResponse = {
      success: false,
      error: 'Unauthorized',
    };
    return new Response(JSON.stringify(body), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 3. Parse and validate optional target date
  let targetDate = new Date().toISOString().slice(0, 10);
  let customInstanceId: string | undefined = undefined;
  let customReconcileHighlights: boolean | undefined = undefined;

  if (request.body) {
    try {
      const cloned = request.clone();
      const text = await cloned.text();
      if (text && text.trim().length > 0) {
        const json: unknown = JSON.parse(text);
        const parsed = FixturesRequestBodySchema.safeParse(json);
        if (parsed.success) {
          if (parsed.data.date) {
            const dateStr = parsed.data.date.trim();
            if (!ISO_DATE_REGEX.test(dateStr) || isNaN(Date.parse(dateStr))) {
              const body: FixturesErrorResponse = {
                success: false,
                error: 'Invalid date format. Expected YYYY-MM-DD',
              };
              return new Response(JSON.stringify(body), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              });
            }
            targetDate = dateStr;
          }
          if (parsed.data.instanceId) {
            customInstanceId = parsed.data.instanceId.trim();
          }
          if (parsed.data.reconcileHighlights !== undefined) {
            customReconcileHighlights = parsed.data.reconcileHighlights;
          }
        }
      }
    } catch {
      // Body was not JSON; default to today's date
    }
  }

  // 4. Validate runtime bindings and execute fixture synchronization
  try {
    if (!env?.DB) {
      const body: FixturesErrorResponse = {
        success: false,
        error: 'Server configuration error',
        details: 'Database binding (DB) is unavailable in worker context',
      };
      return new Response(JSON.stringify(body), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const apiKey = env.API_FOOTBALL_KEY || process.env.API_FOOTBALL_KEY;
    if (!apiKey || apiKey === 'your_api_key_here') {
      const body: FixturesErrorResponse = {
        success: false,
        error: 'Server configuration error',
        details: 'API_FOOTBALL_KEY is not configured in worker environment',
      };
      return new Response(JSON.stringify(body), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const targetDateObj = new Date(targetDate + 'T00:00:00Z');
    const yesterdayDate = new Date(
      targetDateObj.getTime() - 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .slice(0, 10);

    // If Cloudflare Workflow binding is present, trigger durable workflow
    if (env.FIXTURE_SYNC_WORKFLOW) {
      const instanceId =
        customInstanceId || `fixture-sync-${targetDate}-manual-${Date.now()}`;

      try {
        const instance = await env.FIXTURE_SYNC_WORKFLOW.create({
          id: instanceId,
          params: {
            date: targetDate,
            reconcileHighlights: customReconcileHighlights ?? true,
          },
        });

        const durationMs = Date.now() - startTime;
        console.log(
          `[API:FIXTURES] Dispatched FixtureSyncWorkflow instance: ${instance.id} for date: ${targetDate}`,
        );

        const body: FixturesWorkflowSuccessResponse = {
          success: true,
          mode: 'workflow',
          instanceId: instance.id,
          date: targetDate,
          previousDate: yesterdayDate,
          durationMs,
        };

        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('already exists') || msg.includes('conflict')) {
          const body: FixturesErrorResponse = {
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

    console.log(
      `[API:FIXTURES] Fixture sync started for target date: ${targetDate} and previous day: ${yesterdayDate}`,
    );
    const summary = await syncDailyFixtures(env.DB, apiKey, targetDate);
    const previousDaySummary = await syncDailyFixtures(
      env.DB,
      apiKey,
      yesterdayDate,
    );
    const durationMs = Date.now() - startTime;

    console.log(
      `[API:FIXTURES] Fixture sync concluded in ${durationMs}ms: todayFound=${summary.supportedFound}, todayPersisted=${summary.persistedCount}, prevFound=${previousDaySummary.supportedFound}, prevPersisted=${previousDaySummary.persistedCount}`,
    );

    const body: FixturesDirectSuccessResponse = {
      success: true,
      mode: 'direct',
      date: targetDate,
      previousDate: yesterdayDate,
      summary,
      previousDaySummary,
      durationMs,
    };

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    console.error(`[API:FIXTURES] Fixture sync execution failed: ${details}`);
    const body: FixturesErrorResponse = {
      success: false,
      error: 'Sync failed',
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
  return handleFixturesPost(request, context);
};

export const Route = createFileRoute('/api/fixtures')({
  server: {
    handlers: {
      POST: postServerHandler,
    },
  },
});
