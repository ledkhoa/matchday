import type {
  ScheduledController,
  ExecutionContext,
} from '@cloudflare/workers-types';
import { ingestRedditHighlights, hasActiveMatchWindow } from './ingest';
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
          // Midnight UTC: Sync daily official fixtures for today and yesterday.
          // We sync today to discover upcoming matches and logos, and yesterday to
          // finalize official scores and statuses (FT) after all games conclude,
          // preserving free-tier quotas with only 2 API requests per day.
          console.log(
            '[CRON] Dispatching daily official fixtures synchronization',
          );
          if (!env.API_FOOTBALL_KEY) {
            console.error(
              '[CRON] API_FOOTBALL_KEY is not configured in worker environment',
            );
            return;
          }

          // 1. Sync today's fixtures
          const todayResult = await syncDailyFixtures(
            env.DB,
            env.API_FOOTBALL_KEY,
          );
          console.log(
            `[CRON] Today fixture sync completed: found=${todayResult.supportedFound}, persisted=${todayResult.persistedCount}`,
          );
          if (todayResult.errors.length > 0) {
            console.error(
              `[CRON] Today fixture sync reported errors: ${JSON.stringify(todayResult.errors)}`,
            );
          }

          // 2. Sync yesterday's fixtures to record final scores and statuses
          const scheduledDate = new Date(event.scheduledTime || Date.now());
          const yesterday = new Date(
            scheduledDate.getTime() - 24 * 60 * 60 * 1000,
          )
            .toISOString()
            .slice(0, 10);

          console.log(
            `[CRON] Dispatching previous day fixture sync for ${yesterday}`,
          );
          const yesterdayResult = await syncDailyFixtures(
            env.DB,
            env.API_FOOTBALL_KEY,
            yesterday,
          );
          console.log(
            `[CRON] Yesterday (${yesterday}) fixture sync completed: found=${yesterdayResult.supportedFound}, persisted=${yesterdayResult.persistedCount}`,
          );
          if (yesterdayResult.errors.length > 0) {
            console.error(
              `[CRON] Yesterday fixture sync reported errors: ${JSON.stringify(yesterdayResult.errors)}`,
            );
          }

          console.log(
            `[CRON] Midnight fixture sync process finished in ${Date.now() - startTime}ms`,
          );
        } else {
          // Default / 5-minute trigger ("*/5 * * * *"): Ingest Reddit highlights
          const nowMs = event.scheduledTime || Date.now();
          const windowCheck = await hasActiveMatchWindow(env.DB, nowMs);

          if (!windowCheck.hasActiveMatches) {
            const nextInfo = windowCheck.nextMatch
              ? ` Next match: ${windowCheck.nextMatch.teamHome} vs ${windowCheck.nextMatch.teamAway} at ${new Date(windowCheck.nextMatch.kickoffTime ?? 0).toISOString()}.`
              : ' No upcoming matches scheduled.';
            console.log(
              `[CRON] Outside of active game hours.${nextInfo} Skipping Reddit ingestion.`,
            );
            return;
          }

          console.log(
            `[CRON] Dispatching 5-minute Reddit highlight ingestion (${windowCheck.activeMatchCount} active match(es))`,
          );
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
