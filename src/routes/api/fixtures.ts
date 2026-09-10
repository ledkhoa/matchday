import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import {
  syncDailyFixtures,
  type FixtureSyncResult,
} from '../../server/api-football';
import type { CloudflareEnv } from '../../types/env';

const FixturesRequestBodySchema = z.object({
  date: z.string().optional(),
});

interface FixturesSuccessResponse {
  success: true;
  date: string;
  summary: FixtureSyncResult;
  durationMs: number;
}

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
  if (request.body) {
    try {
      const cloned = request.clone();
      const text = await cloned.text();
      if (text && text.trim().length > 0) {
        const json: unknown = JSON.parse(text);
        const parsed = FixturesRequestBodySchema.safeParse(json);
        if (parsed.success && parsed.data.date) {
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

    console.log(
      `[API:FIXTURES] Manual fixture sync execution started for date: ${targetDate}`,
    );
    const summary = await syncDailyFixtures(env.DB, apiKey, targetDate);
    const durationMs = Date.now() - startTime;

    console.log(
      `[API:FIXTURES] Fixture sync concluded in ${durationMs}ms: found=${summary.supportedFound}, persisted=${summary.persistedCount}`,
    );

    const body: FixturesSuccessResponse = {
      success: true,
      date: targetDate,
      summary,
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
