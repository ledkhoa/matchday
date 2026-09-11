import type {
  ScheduledController,
  ExecutionContext,
} from '@cloudflare/workers-types';
import { ingestRedditHighlights } from './ingest';
import { syncDailyFixtures } from './api-football';
import type { CloudflareEnv } from '../types/env';

export interface ScheduledExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
}

export interface ScheduledEventPayload {
  readonly scheduledTime: number;
  readonly cron: string;
  noRetry?(): void;
}

/**
 * Handles Cloudflare Workers scheduled cron triggers.
 *
 * Multiplexes between daily official fixtures synchronization at midnight UTC ("0 0 * * *")
 * and 5-minute Reddit highlight ingestion ("*\/5 * * * *").
 *
 * Runs asynchronously inside `ctx.waitUntil` so the edge isolate remains alive until
 * persistence concludes without blocking the immediate event resolution.
 * All errors are caught and logged to prevent unhandled isolate crashes.
 */
export async function handleScheduled(
  event: ScheduledController | ScheduledEventPayload,
  env: CloudflareEnv,
  ctx: ExecutionContext | ScheduledExecutionContext,
): Promise<void> {
  ctx.waitUntil(
    (async () => {
      const startTime = Date.now();
      console.log(
        `[CRON] Event triggered at ${new Date(event.scheduledTime).toISOString()} (cron: "${event.cron}")`,
      );

      try {
        if (event.cron === '0 0 * * *') {
          // Midnight UTC: Sync daily official fixtures
          console.log(
            '[CRON] Dispatching daily official fixtures synchronization',
          );
          if (!env.API_FOOTBALL_KEY) {
            console.error(
              '[CRON] API_FOOTBALL_KEY is not configured in worker environment',
            );
            return;
          }
          const result = await syncDailyFixtures(env.DB, env.API_FOOTBALL_KEY);
          console.log(
            `[CRON] Fixture sync completed in ${Date.now() - startTime}ms: found=${result.supportedFound}, persisted=${result.persistedCount}`,
          );
          if (result.errors.length > 0) {
            console.error(
              `[CRON] Fixture sync reported errors: ${JSON.stringify(result.errors)}`,
            );
          }
        } else {
          // Default / 5-minute trigger ("*/5 * * * *"): Ingest Reddit highlights
          console.log('[CRON] Dispatching 5-minute Reddit highlight ingestion');
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

          const result = await ingestRedditHighlights(env.DB, config);
          console.log(
            `[CRON] Ingestion completed in ${Date.now() - startTime}ms: fetched=${result.totalFetched}, persisted=${result.persistedCount}, skipped=${result.skippedCount}`,
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        console.error(
          `[CRON] Cron job failed with exception: ${message}`,
          stack,
        );
      }
    })(),
  );
}
