import type { Highlight } from '#/db/schema';
import {
  parseMinuteToSeconds,
  sortHighlightsChronologically,
} from '#/server/parser-helpers';

export { parseMinuteToSeconds, sortHighlightsChronologically };

export interface MatchScore {
  home: number;
  away: number;
}

/**
 * Computes final or latest recorded match score from chronologically sorted highlights.
 */
export function computeMatchScore(highlights: Highlight[]): MatchScore | null {
  for (let i = highlights.length - 1; i >= 0; i--) {
    const hl = highlights[i];
    if (hl.scoreHome !== null && hl.scoreAway !== null) {
      return { home: hl.scoreHome, away: hl.scoreAway };
    }
  }
  return null;
}

/**
 * Checks whether a match status string represents a completed/full-time match.
 * Standard API-Football full-time statuses:
 * - 'FT': Match Finished
 * - 'AET': Match Finished After Extra Time
 * - 'PEN': Match Finished After Penalty Shootout
 */
export function isFullTimeStatus(status?: string | null): boolean {
  if (!status) return false;
  const clean = status.trim().toUpperCase();
  return clean === 'FT' || clean === 'AET' || clean === 'PEN';
}

/**
 * Resolves the display scoreline for a match.
 * - If the match is in full-time status ('FT', 'AET', 'PEN'), prefers the official score from API-Football.
 * - If the match is NOT in full-time status (live, upcoming, or in-progress), tracks the score based on highlights,
 *   falling back to official API score or null if no highlights exist.
 */
export function resolveDisplayScore(
  match: {
    scoreHome?: number | null;
    scoreAway?: number | null;
    status?: string | null;
  },
  highlights: Highlight[],
): MatchScore | null {
  const isFullTime = isFullTimeStatus(match.status);
  const highlightScore = computeMatchScore(highlights);
  const hasOfficialScore =
    match.scoreHome !== null &&
    match.scoreHome !== undefined &&
    match.scoreAway !== null &&
    match.scoreAway !== undefined;

  // When game is full-time, use official score recorded from API-Football
  if (isFullTime) {
    if (hasOfficialScore) {
      return { home: match.scoreHome!, away: match.scoreAway! };
    }
    return highlightScore;
  }

  // When game is not in full-time status, track real-time score based on highlight clips
  if (highlightScore !== null) {
    return highlightScore;
  }

  if (hasOfficialScore) {
    return { home: match.scoreHome!, away: match.scoreAway! };
  }

  return null;
}

/**
 * Formats goal scoreline with brackets indicating scoring team (e.g. "[1] - 0" or "1 - [1]").
 */
export function formatGoalScore(
  highlight: Highlight,
  prevHighlight?: Highlight,
): string {
  if (highlight.scoreHome === null || highlight.scoreAway === null) {
    return '';
  }

  const { scoreHome, scoreAway } = highlight;

  if (
    prevHighlight &&
    prevHighlight.scoreHome !== null &&
    prevHighlight.scoreAway !== null
  ) {
    if (scoreHome > prevHighlight.scoreHome) {
      return `[${scoreHome}] - ${scoreAway}`;
    }
    if (scoreAway > prevHighlight.scoreAway) {
      return `${scoreHome} - [${scoreAway}]`;
    }
  }

  // 2. Infer from explicit bracket notation in highlight title (e.g. "[6]-3" or "1-[2]")
  const homeBracketMatch = highlight.title?.match(
    /\[(\d+)\]\s*[-–—]\s*\[?(\d+)\]?/,
  );
  if (homeBracketMatch) {
    return `[${homeBracketMatch[1]}] - ${homeBracketMatch[2]}`;
  }
  const awayBracketMatch = highlight.title?.match(
    /\[?(\d+)\]?\s*[-–—]\s*\[(\d+)\]/,
  );
  if (awayBracketMatch) {
    return `${awayBracketMatch[1]} - [${awayBracketMatch[2]}]`;
  }

  // 3. Fallback if first goal of the match
  if (scoreHome > 0 && scoreAway === 0) {
    return `[${scoreHome}] - ${scoreAway}`;
  }
  if (scoreAway > 0 && scoreHome === 0) {
    return `${scoreHome} - [${scoreAway}]`;
  }

  return `${scoreHome} - ${scoreAway}`;
}

/**
 * Categorizes a highlight tag for badge styling.
 */
export function getTagCategory(
  tag: string | null | undefined,
): 'penalty' | 'great_goal' | 'own_goal' | 'standard' {
  if (!tag) return 'standard';
  const clean = tag.toLowerCase().replace(/[()]/g, '').trim();
  if (clean === 'p' || clean.includes('penalty')) return 'penalty';
  if (clean.includes('great') || clean.includes('wonder')) return 'great_goal';
  if (clean === 'og' || clean.includes('own goal')) return 'own_goal';
  return 'standard';
}

interface TeamInitialsMap {
  readonly [team: string]: string | undefined;
}

/**
 * Derives clean team initials for the team avatar badge.
 */
export function getTeamInitials(teamName: string): string {
  const clean = teamName.trim();
  const KNOWN_ABBREVIATIONS: TeamInitialsMap = {
    Arsenal: 'ARS',
    'Aston Villa': 'AVL',
    Brighton: 'BHA',
    'Brighton and Hove Albion': 'BHA',
    Chelsea: 'CHE',
    Liverpool: 'LIV',
    'Manchester City': 'MCI',
    'Manchester United': 'MUN',
    Newcastle: 'NEW',
    'Newcastle United': 'NEW',
    Tottenham: 'TOT',
    'Tottenham Hotspur': 'TOT',
    'Real Madrid': 'RMA',
    Barcelona: 'BAR',
    'Bayern Munich': 'BAY',
    'Paris Saint-Germain': 'PSG',
    Juventus: 'JUV',
    'Inter Milan': 'INT',
    'AC Milan': 'MIL',
    'Borussia Dortmund': 'BVB',
  };

  const known = KNOWN_ABBREVIATIONS[clean];
  if (known) {
    return known;
  }

  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words
      .slice(0, 3)
      .map((w) => w[0].toUpperCase())
      .join('');
  }
  return clean.slice(0, 3).toUpperCase();
}

/**
 * Formats epoch milliseconds into a localized kick-off time string (e.g. "7:30 PM").
 * Accepts an optional IANA timezone; in browser environments, defaults to client timezone.
 * Returns empty string if timestamp is null, undefined, NaN, or non-positive.
 */
export function formatKickoffTime(
  timestampMs: number | null | undefined,
  timeZone?: string,
): string {
  if (
    timestampMs === null ||
    timestampMs === undefined ||
    Number.isNaN(timestampMs) ||
    timestampMs <= 0
  ) {
    return '';
  }

  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const tz =
    timeZone ||
    ('Intl' in globalThis
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'UTC');

  try {
    return date.toLocaleTimeString('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    return `${hours}:${minutes} UTC`;
  }
}
