import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import type { CloudflareEnv } from '../../types/env';
import { fetchRedditPosts, type HighlightPost } from '../reddit';
import {
  matchAndPrepareHighlights,
  persistHighlightsBatch,
  hasActiveMatchWindow,
  type PreparedHighlightItem,
  type MatchAndPrepareStepOutput,
  type PersistHighlightsStepOutput,
} from '../ingest';

export type {
  PreparedHighlightItem,
  MatchAndPrepareStepOutput,
  PersistHighlightsStepOutput,
};

export interface HighlightIngestWorkflowParams {
  /** Reference timestamp in milliseconds for time-based calculations. Defaults to event.timestamp. */
  referenceTimeMs?: number;
  /** Custom Reddit search RSS feed URL (used for testing or targeted backfills). */
  feedUrl?: string;
  /** Custom Reddit User-Agent string. */
  userAgent?: string;
  /** When true, bypasses the active match window check inside the workflow. */
  force?: boolean;
}

export interface FetchRedditHighlightsStepOutput {
  posts: HighlightPost[];
  totalFetched: number;
  fetchedAt: number;
}

export interface HighlightIngestWorkflowResult {
  instanceId: string;
  totalFetched: number;
  parsedCount: number;
  matchedCount: number;
  persistedCount: number;
  skippedCount: number;
  durationMs: number;
  errors: string[];
}

export class HighlightIngestWorkflow extends WorkflowEntrypoint<
  CloudflareEnv,
  HighlightIngestWorkflowParams
> {
  async run(
    event: WorkflowEvent<HighlightIngestWorkflowParams>,
    step: WorkflowStep,
  ): Promise<HighlightIngestWorkflowResult> {
    const startTime = Date.now();
    const env = this.env;

    if (!env.DB) {
      throw new NonRetryableError('D1 Database binding (DB) is unavailable');
    }

    const referenceTimeMs =
      event.payload?.referenceTimeMs ??
      (event.timestamp ? new Date(event.timestamp).getTime() : Date.now());

    // Defensive active game window check inside workflow (unless bypassed via force: true)
    if (!event.payload?.force) {
      const windowCheck = await hasActiveMatchWindow(env.DB, referenceTimeMs);
      if (!windowCheck.hasActiveMatches) {
        return {
          instanceId: event.instanceId,
          totalFetched: 0,
          parsedCount: 0,
          matchedCount: 0,
          persistedCount: 0,
          skippedCount: 0,
          durationMs: Date.now() - startTime,
          errors: ['Skipped: outside active match window'],
        };
      }
    }

    const redditConfig = {
      feedUrl: event.payload?.feedUrl,
      userAgent: event.payload?.userAgent || env.REDDIT_USER_AGENT,
    };

    // Step 1: Fetch Reddit highlights RSS
    const fetchOutput = await step.do<FetchRedditHighlightsStepOutput>(
      'fetch-reddit-highlights',
      {
        retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' },
        timeout: '30 seconds',
      },
      async () => {
        try {
          const posts = await fetchRedditPosts(redditConfig);
          return {
            posts,
            totalFetched: posts.length,
            fetchedAt: Date.now(),
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // Distinguish fatal config from retryable network errors
          if (msg.includes('Invalid URL') || msg.includes('unsupported')) {
            throw new NonRetryableError(`Fatal Reddit fetch error: ${msg}`);
          }
          throw new Error(`Transient Reddit fetch error: ${msg}`);
        }
      },
    );

    // Fast-path: If no posts retrieved, complete early
    if (fetchOutput.posts.length === 0) {
      return {
        instanceId: event.instanceId,
        totalFetched: 0,
        parsedCount: 0,
        matchedCount: 0,
        persistedCount: 0,
        skippedCount: 0,
        durationMs: Date.now() - startTime,
        errors: [],
      };
    }

    // Step 2: Query candidate fixtures, fuzzy match, filter squads, and prepare highlights
    const matchOutput = await step.do<MatchAndPrepareStepOutput>(
      'match-and-prepare-highlights',
      {
        retries: { limit: 2, delay: '2 seconds', backoff: 'linear' },
        timeout: '30 seconds',
      },
      async () => {
        return await matchAndPrepareHighlights(env.DB, fetchOutput.posts);
      },
    );

    // Fast-path: If nothing matched to official fixtures, complete early
    if (
      matchOutput.preparedHighlights.length === 0 &&
      matchOutput.touchedMatchIds.length === 0
    ) {
      return {
        instanceId: event.instanceId,
        totalFetched: fetchOutput.totalFetched,
        parsedCount: matchOutput.parsedCount,
        matchedCount: matchOutput.matchedCount,
        persistedCount: 0,
        skippedCount: matchOutput.skippedCount,
        durationMs: Date.now() - startTime,
        errors: [],
      };
    }

    // Step 3: Chunked D1 batch persistence
    const persistOutput = await step.do<PersistHighlightsStepOutput>(
      'persist-highlights-batch',
      {
        retries: { limit: 3, delay: '2 seconds', backoff: 'exponential' },
        timeout: '30 seconds',
      },
      async () => {
        const res = await persistHighlightsBatch(
          env.DB,
          matchOutput.preparedHighlights,
          matchOutput.touchedMatchIds,
        );
        if (res.errors.length > 0) {
          throw new Error(`D1 persistence failed: ${res.errors.join('; ')}`);
        }
        return res;
      },
    );

    return {
      instanceId: event.instanceId,
      totalFetched: fetchOutput.totalFetched,
      parsedCount: matchOutput.parsedCount,
      matchedCount: matchOutput.matchedCount,
      persistedCount: persistOutput.persistedCount,
      skippedCount: matchOutput.skippedCount,
      durationMs: Date.now() - startTime,
      errors: persistOutput.errors,
    };
  }
}
