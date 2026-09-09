import type {
  ScheduledController,
  ExecutionContext,
} from '@cloudflare/workers-types';
import { ingestRedditHighlights } from './ingest';
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
 * Runs the Reddit ingestion pipeline asynchronously inside `ctx.waitUntil`
 * so the edge isolate remains alive until persistence concludes without blocking
 * the immediate event resolution. All errors are caught and logged to prevent
 * unhandled isolate crashes.
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
        `[CRON] Ingestion triggered at ${new Date(event.scheduledTime).toISOString()} (cron: "${event.cron}")`,
      );

      try {
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
        const durationMs = Date.now() - startTime;

        console.log(
          `[CRON] Ingestion completed in ${durationMs}ms: fetched=${result.totalFetched}, parsed=${result.parsedCount}, persisted=${result.persistedCount}, skipped=${result.skippedCount}`,
        );

        if (result.errors.length > 0) {
          console.warn(
            `[CRON] Ingestion encountered ${result.errors.length} warnings/errors:`,
            JSON.stringify(result.errors),
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        console.error(
          `[CRON] Ingestion job failed with exception: ${message}`,
          stack,
        );
      }
    })(),
  );
}
