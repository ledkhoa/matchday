import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import type { WorkflowSleepDuration } from '@cloudflare/workers-types';
import type { CloudflareEnv } from '../../types/env';
import { fetchDailyFixtures, type ApiSportsFixtureItem } from '../api-football';
import { persistFixtures } from '../fixtures-sync';
import { reconcileYesterdayHighlights } from './reconcile-highlights';

export interface FixtureSyncWorkflowParams {
  /** Target UTC date string (YYYY-MM-DD). Defaults to current UTC date. */
  date?: string;
  /** Whether to execute Step 6 highlight reconciliation. Defaults to true. */
  reconcileHighlights?: boolean;
  /** Custom cooldown delay in seconds. Defaults to '10 seconds'. */
  cooldownDuration?: string;
}

export interface FixtureFetchStepOutput {
  date: string;
  totalReceived: number;
  supportedFound: number;
  supportedFixtures: ApiSportsFixtureItem[];
  errors: string[];
}

export interface FixturePersistStepOutput {
  date: string;
  persistedCount: number;
  errors: string[];
}

export interface HighlightReconciliationResult {
  auditedMatchesCount: number;
  auditedHighlightsCount: number;
  reconciledCount: number;
  unmatchedHighlightCount: number;
  discrepancies: string[];
}

export interface FixtureSyncWorkflowResult {
  instanceId: string;
  targetDate: string;
  yesterdayDate: string;
  todaySync: {
    totalReceived: number;
    supportedFound: number;
    persistedCount: number;
    errors: string[];
  };
  yesterdaySync: {
    totalReceived: number;
    supportedFound: number;
    persistedCount: number;
    errors: string[];
  };
  reconciliation?: HighlightReconciliationResult;
  durationMs: number;
}

/**
 * Cloudflare Workflow entrypoint for multi-step resilient fixture synchronization.
 *
 * Steps:
 * 1. today-fixtures-fetch: API-Football call for current date
 * 2. today-fixtures-persist: D1 upsert of current fixtures
 * 3. api-cooldown: durable zero-CPU sleep to protect API rate limits
 * 4. yesterday-fixtures-fetch: API-Football call for previous date
 * 5. yesterday-fixtures-persist: D1 upsert of final scores and match statuses
 * 6. highlight-reconciliation: audit Reddit highlights against confirmed outcomes
 */
export class FixtureSyncWorkflow extends WorkflowEntrypoint<
  CloudflareEnv,
  FixtureSyncWorkflowParams
> {
  async run(
    event: WorkflowEvent<FixtureSyncWorkflowParams>,
    step: WorkflowStep,
  ): Promise<FixtureSyncWorkflowResult> {
    const startTime = Date.now();
    const env = this.env;

    const apiKey = env.API_FOOTBALL_KEY || process.env.API_FOOTBALL_KEY;
    if (!apiKey || apiKey === 'your_api_key_here') {
      throw new NonRetryableError(
        'API_FOOTBALL_KEY is missing or unconfigured in environment',
      );
    }

    if (!env.DB) {
      throw new NonRetryableError('D1 Database binding (DB) is unavailable');
    }

    // Determine target dates (today UTC & yesterday UTC)
    const targetDate =
      event.payload?.date ||
      new Date(event.timestamp).toISOString().slice(0, 10);
    const targetDateObj = new Date(targetDate + 'T00:00:00Z');
    const yesterdayDate = new Date(targetDateObj.getTime() - 86400000)
      .toISOString()
      .slice(0, 10);

    // 1. Fetch Today Fixtures
    const todayFetch = await step.do<FixtureFetchStepOutput>(
      'today-fixtures-fetch',
      {
        retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
        timeout: '30 seconds',
      },
      async () => {
        const res = await fetchDailyFixtures(apiKey, targetDate);
        if (res.errors.length > 0) {
          const fatalError = res.errors.find(
            (e) =>
              e.includes('Unauthorized') ||
              e.includes('token') ||
              e.includes('401') ||
              e.includes('403') ||
              e.toLowerCase().includes('invalid api key') ||
              e.toLowerCase().includes('requests per day') ||
              e.toLowerCase().includes('quota exceeded'),
          );
          if (fatalError) throw new NonRetryableError(fatalError);

          const transientError = res.errors.find(
            (e) =>
              e.includes('Network error') ||
              e.includes('HTTP error') ||
              e.includes('Failed to parse') ||
              e.includes('Rate limit'),
          );
          if (transientError) throw new Error(transientError);
        }
        return {
          date: targetDate,
          totalReceived: res.totalReceived,
          supportedFound: res.supportedFound,
          supportedFixtures: res.supportedFixtures,
          errors: res.errors,
        };
      },
    );

    // 2. Persist Today Fixtures
    const todayPersist = await step.do<FixturePersistStepOutput>(
      'today-fixtures-persist',
      {
        retries: { limit: 3, delay: '2 seconds', backoff: 'exponential' },
        timeout: '30 seconds',
      },
      async () => {
        const res = await persistFixtures(env.DB, todayFetch.supportedFixtures);
        if (res.errors.length > 0) {
          throw new Error(
            `Transient persistence error: ${res.errors.join('; ')}`,
          );
        }
        return {
          date: targetDate,
          persistedCount: res.persistedCount,
          errors: res.errors,
        };
      },
    );

    // 3. Rate-Limit Cooldown
    // SAFETY: Default or user-provided cooldown duration is a valid WorkflowSleepDuration literal
    const cooldown = (event.payload?.cooldownDuration ||
      '10 seconds') as WorkflowSleepDuration;
    await step.sleep('api-cooldown', cooldown);

    // 4. Fetch Yesterday Fixtures
    const yesterdayFetch = await step.do<FixtureFetchStepOutput>(
      'yesterday-fixtures-fetch',
      {
        retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
        timeout: '30 seconds',
      },
      async () => {
        const res = await fetchDailyFixtures(apiKey, yesterdayDate);
        if (res.errors.length > 0) {
          const fatalError = res.errors.find(
            (e) =>
              e.includes('Unauthorized') ||
              e.includes('token') ||
              e.includes('401') ||
              e.includes('403') ||
              e.toLowerCase().includes('invalid api key') ||
              e.toLowerCase().includes('requests per day') ||
              e.toLowerCase().includes('quota exceeded'),
          );
          if (fatalError) throw new NonRetryableError(fatalError);

          const transientError = res.errors.find(
            (e) =>
              e.includes('Network error') ||
              e.includes('HTTP error') ||
              e.includes('Failed to parse') ||
              e.includes('Rate limit'),
          );
          if (transientError) throw new Error(transientError);
        }
        return {
          date: yesterdayDate,
          totalReceived: res.totalReceived,
          supportedFound: res.supportedFound,
          supportedFixtures: res.supportedFixtures,
          errors: res.errors,
        };
      },
    );

    // 5. Persist Yesterday Fixtures (Final Scores & Statuses)
    const yesterdayPersist = await step.do<FixturePersistStepOutput>(
      'yesterday-fixtures-persist',
      {
        retries: { limit: 3, delay: '2 seconds', backoff: 'exponential' },
        timeout: '30 seconds',
      },
      async () => {
        const res = await persistFixtures(
          env.DB,
          yesterdayFetch.supportedFixtures,
        );
        if (res.errors.length > 0) {
          throw new Error(
            `Transient persistence error: ${res.errors.join('; ')}`,
          );
        }
        return {
          date: yesterdayDate,
          persistedCount: res.persistedCount,
          errors: res.errors,
        };
      },
    );

    // 6. Optional Highlight Reconciliation
    let reconciliationResult: HighlightReconciliationResult | undefined =
      undefined;
    if (event.payload?.reconcileHighlights !== false) {
      reconciliationResult = await step.do<HighlightReconciliationResult>(
        'highlight-reconciliation',
        {
          retries: { limit: 2, delay: '5 seconds', backoff: 'linear' },
          timeout: '30 seconds',
        },
        async () => {
          return await reconcileYesterdayHighlights(env.DB, yesterdayDate);
        },
      );
    }

    return {
      instanceId: event.instanceId,
      targetDate,
      yesterdayDate,
      todaySync: {
        totalReceived: todayFetch.totalReceived,
        supportedFound: todayFetch.supportedFound,
        persistedCount: todayPersist.persistedCount,
        errors: [...todayFetch.errors, ...todayPersist.errors],
      },
      yesterdaySync: {
        totalReceived: yesterdayFetch.totalReceived,
        supportedFound: yesterdayFetch.supportedFound,
        persistedCount: yesterdayPersist.persistedCount,
        errors: [...yesterdayFetch.errors, ...yesterdayPersist.errors],
      },
      reconciliation: reconciliationResult,
      durationMs: Date.now() - startTime,
    };
  }
}
