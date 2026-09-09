import type { MatchWithHighlights, Highlight } from '../db/schema';
import type { IngestResult } from '../server/ingest';

/**
 * Route parameters for /date/$date.
 */
export interface DateRouteParams {
  date: string;
}

/**
 * Clean highlight item presented to the UI layer.
 */
export interface HighlightItem extends Highlight {}

/**
 * Structured match record containing associated chronologically ordered highlights.
 */
export interface MatchDigestItem extends MatchWithHighlights {}

/**
 * Payload returned by the daily match query.
 */
export interface DailyDigestResponse {
  date: string;
  matches: MatchDigestItem[];
}

/**
 * Ingestion API HTTP Response types.
 */
export interface CronApiResponseSuccess {
  success: true;
  summary: IngestResult;
  durationMs: number;
}

export interface CronApiResponseError {
  success: false;
  error: string;
  details?: string;
}

export type CronApiResponse = CronApiResponseSuccess | CronApiResponseError;
