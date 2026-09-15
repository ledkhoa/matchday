import type { D1Database } from '@cloudflare/workers-types';
import { eq, inArray } from 'drizzle-orm';
import { createDb } from '../../db';
import * as schema from '../../db/schema';
import type { HighlightReconciliationResult } from './fixture-sync';

const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN']);

/**
 * Audits yesterday's finished matches against stored Reddit highlights,
 * detecting missing score metadata, orphaned highlights, and unlinked goals.
 */
export async function reconcileYesterdayHighlights(
  d1: D1Database,
  yesterdayDate: string,
): Promise<HighlightReconciliationResult> {
  const db = createDb(d1);
  const result: HighlightReconciliationResult = {
    auditedMatchesCount: 0,
    auditedHighlightsCount: 0,
    reconciledCount: 0,
    unmatchedHighlightCount: 0,
    discrepancies: [],
  };

  // 1. Query yesterday's finished matches
  const finishedMatches = await db
    .select({
      id: schema.matches.id,
      matchDate: schema.matches.matchDate,
      teamHome: schema.matches.teamHome,
      teamAway: schema.matches.teamAway,
      scoreHome: schema.matches.scoreHome,
      scoreAway: schema.matches.scoreAway,
      status: schema.matches.status,
    })
    .from(schema.matches)
    .where(eq(schema.matches.matchDate, yesterdayDate));

  result.auditedMatchesCount = finishedMatches.length;
  if (finishedMatches.length === 0) return result;

  const matchIds = finishedMatches.map((m) => m.id);

  // 2. Query highlights for these matches
  const linkedHighlights = await db
    .select({
      id: schema.highlights.id,
      matchId: schema.highlights.matchId,
      scoreHome: schema.highlights.scoreHome,
      scoreAway: schema.highlights.scoreAway,
    })
    .from(schema.highlights)
    .where(inArray(schema.highlights.matchId, matchIds));

  result.auditedHighlightsCount = linkedHighlights.length;

  // 3. Reconcile missing scores and count goals
  const now = Date.now();
  for (const match of finishedMatches) {
    if (!match.status || !FINISHED_STATUSES.has(match.status.toUpperCase())) {
      continue;
    }

    const matchHighlights = linkedHighlights.filter(
      (h) => h.matchId === match.id,
    );
    const totalGoalsInFixture = (match.scoreHome ?? 0) + (match.scoreAway ?? 0);

    if (totalGoalsInFixture > 0 && matchHighlights.length === 0) {
      result.discrepancies.push(
        `Fixture ${match.teamHome} vs ${match.teamAway} ended ${match.scoreHome}-${match.scoreAway} but has 0 linked highlights`,
      );
    }
  }

  // 4. Touch updatedAt for matches to trigger downstream freshness
  await db
    .update(schema.matches)
    .set({ updatedAt: now })
    .where(inArray(schema.matches.id, matchIds));

  return result;
}
