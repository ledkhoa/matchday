import type { D1Database, Workflow } from '@cloudflare/workers-types';
import type { FixtureSyncWorkflowParams } from '../server/workflows/fixture-sync';
import type { HighlightIngestWorkflowParams } from '../server/workflows/highlight-ingest';

export type { FixtureSyncWorkflowParams, HighlightIngestWorkflowParams };

export interface CloudflareEnv {
  DB: D1Database;
  FIXTURE_SYNC_WORKFLOW?: Workflow<FixtureSyncWorkflowParams>;
  HIGHLIGHT_INGEST_WORKFLOW?: Workflow<HighlightIngestWorkflowParams>;
  CRON_SECRET?: string;
  API_FOOTBALL_KEY?: string;
  REDDIT_CLIENT_ID?: string;
  REDDIT_CLIENT_SECRET?: string;
  REDDIT_USER_AGENT?: string;
}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DATABASE_URL?: string;
      CRON_SECRET?: string;
      API_FOOTBALL_KEY?: string;
      REDDIT_CLIENT_ID?: string;
      REDDIT_CLIENT_SECRET?: string;
      REDDIT_USER_AGENT?: string;
    }
  }
}
