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

export type MatchStatusVariant =
  'ft' | 'live' | 'ht' | 'upcoming' | 'postponed' | 'unknown';

export interface FormattedMatchStatus {
  label: string;
  variant: MatchStatusVariant;
  isLive: boolean;
}

/**
 * Formats epoch milliseconds into a standardized UTC kick-off time string (e.g. "19:45 UTC").
 * Using UTC prevents React SSR hydration mismatches across client timezones.
 * Returns empty string if timestamp is null, undefined, NaN, or non-positive.
 */
export function formatKickoffTime(
  timestampMs: number | null | undefined,
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

  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes} UTC`;
}

/**
 * Normalizes API-Football match status codes into presentation labels and variants.
 */
export function formatMatchStatus(
  status: string | null | undefined,
  kickoffTime?: number | null,
): FormattedMatchStatus {
  const clean = status?.trim().toUpperCase() ?? '';

  switch (clean) {
    // Full Time & Concluded
    case 'FT':
      return { label: 'FT', variant: 'ft', isLive: false };
    case 'AET':
      return { label: 'AET', variant: 'ft', isLive: false };
    case 'PEN':
      return { label: 'PEN', variant: 'ft', isLive: false };

    // In-Play / Live
    case '1H':
      return { label: '1st Half', variant: 'live', isLive: true };
    case '2H':
      return { label: '2nd Half', variant: 'live', isLive: true };
    case 'ET':
      return { label: 'Extra Time', variant: 'live', isLive: true };
    case 'P':
    case 'LIVE':
      return { label: 'LIVE', variant: 'live', isLive: true };

    // Interval
    case 'HT':
      return { label: 'HT', variant: 'ht', isLive: false };
    case 'BT':
      return { label: 'Break', variant: 'ht', isLive: false };

    // Postponed / Suspended / Interrupted / Cancelled
    case 'PST':
      return { label: 'Postponed', variant: 'postponed', isLive: false };
    case 'CANC':
      return { label: 'Cancelled', variant: 'postponed', isLive: false };
    case 'ABD':
      return { label: 'Abandoned', variant: 'postponed', isLive: false };
    case 'SUSP':
    case 'INT':
      return { label: 'Suspended', variant: 'postponed', isLive: false };

    // Scheduled / Not Started
    case 'NS':
    case 'TBD': {
      const timeStr = formatKickoffTime(kickoffTime);
      return {
        label: timeStr || 'Upcoming',
        variant: 'upcoming',
        isLive: false,
      };
    }

    // Default / Unset Status
    default: {
      if (kickoffTime) {
        const timeStr = formatKickoffTime(kickoffTime);
        if (timeStr) {
          return { label: timeStr, variant: 'upcoming', isLive: false };
        }
      }
      return { label: '', variant: 'unknown', isLive: false };
    }
  }
}
