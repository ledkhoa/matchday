export interface ParsedTitle {
  teamHome: string;
  teamAway: string;
  scoreHome: number;
  scoreAway: number;
  scorer: string | null;
  minute: string | null;
  tag: string | null;
}

/**
 * Matches score patterns such as:
 * "Arsenal [1] - 0 Chelsea" or "Real Madrid 2 - [2] Barcelona"
 * Captures: [1] teamHome, [2] scoreHome, [3] scoreAway, [4] teamAway, [5] optional details
 */
const GOAL_TITLE_REGEX =
  /^(.+?)\s*\[?(\d+)\]?\s*[-–—]\s*\[?(\d+)\]?\s*(.+?)(?:\s*[-–—]\s*(.*))?$/i;

/** Matches non-highlight meta threads to immediately discard */
const META_THREAD_PREFIX_REGEX =
  /^(?:\[?\s*(?:post[- ]match|match|pre[- ]match)\s*thread\s*\]?|daily discussion|transfer round[- ]up)/i;

/** Extracts trailing minute patterns like 45', 90+2', 90'+4', 120+1', 45+2, 90' */
const MINUTE_REGEX = /\b(\d+['′]?(?:\+\d+)?['′]?)$/;
/** Extracts inline minute patterns */
const INLINE_MINUTE_REGEX = /\b(\d+['′]?(?:\+\d+)?['′]?)\b/;
/** Extracts trailing parenthesized tags like (Great Goal), (P), (OG), (Penalty) */
const TAG_REGEX = /\(([^)]+)\)$/;

/** Strips invisible directional and zero-width unicode formatting characters */
const UNICODE_CONTROL_CHARS = /[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E]/g;

export function parseRedditTitle(title: string): ParsedTitle | null {
  const cleanTitle = title.replace(UNICODE_CONTROL_CHARS, '').trim();

  // 1. Filter out known meta and discussion threads
  if (META_THREAD_PREFIX_REGEX.test(cleanTitle)) {
    return null;
  }

  // 2. Execute primary team and score regex
  const match = cleanTitle.match(GOAL_TITLE_REGEX);
  if (!match) {
    return null;
  }

  const rawTeamHome = match[1]?.trim();
  const rawScoreHome = match[2];
  const rawScoreAway = match[3];
  const rawTeamAway = match[4]?.trim();
  let details = match[5]?.trim() ?? '';

  if (!rawTeamHome || !rawScoreHome || !rawScoreAway || !rawTeamAway) {
    return null;
  }

  // Reject titles where home team contains thread indicators
  if (META_THREAD_PREFIX_REGEX.test(rawTeamHome)) {
    return null;
  }

  const scoreHome = parseInt(rawScoreHome, 10);
  const scoreAway = parseInt(rawScoreAway, 10);

  if (Number.isNaN(scoreHome) || Number.isNaN(scoreAway)) {
    return null;
  }

  let tag: string | null = null;
  let minute: string | null = null;
  let scorer: string | null = null;

  // 3. Extract parenthesized tag if positioned at end of details (e.g., "(Great Goal)", "(Penalty)")
  const tagEndMatch = details.match(TAG_REGEX);
  if (tagEndMatch && tagEndMatch[1]) {
    tag = tagEndMatch[1].trim();
    details = details.replace(TAG_REGEX, '').trim();
  }

  // 4. Extract minute from end of details or inline
  const minuteEndMatch = details.match(MINUTE_REGEX);
  if (minuteEndMatch && minuteEndMatch[1]) {
    minute = minuteEndMatch[1].trim();
    details = details.replace(MINUTE_REGEX, '').trim();
  } else {
    const inlineMinuteMatch = details.match(INLINE_MINUTE_REGEX);
    if (inlineMinuteMatch && inlineMinuteMatch[1]) {
      minute = inlineMinuteMatch[1].trim();
      details = details.replace(INLINE_MINUTE_REGEX, '').trim();
    }
  }

  // 5. If tag was positioned before minute (e.g., "Saka (P) 22'"), extract it after minute removal
  if (!tag) {
    const tagMatch = details.match(TAG_REGEX);
    if (tagMatch && tagMatch[1]) {
      tag = tagMatch[1].trim();
      details = details.replace(TAG_REGEX, '').trim();
    }
  }

  // 6. Remaining string in details represents the goalscorer
  if (details.length > 0) {
    scorer = details.replace(/^[-–—\s]+|[-–—\s]+$/g, '').trim() || null;
  }

  return {
    teamHome: rawTeamHome,
    teamAway: rawTeamAway,
    scoreHome,
    scoreAway,
    scorer,
    minute,
    tag,
  };
}

/**
 * Generates a deterministic match identifier using UTC date and alphabetically sorted
 * normalized team slugs.
 *
 * Example:
 *   generateMatchId("2026-09-09", "Arsenal", "Chelsea") === "2026-09-09_arsenal_chelsea"
 *   generateMatchId("2026-09-09", "Chelsea", "Arsenal") === "2026-09-09_arsenal_chelsea"
 */
export function generateMatchId(
  dateStr: string,
  teamA: string,
  teamB: string,
): string {
  const normalize = (team: string): string =>
    team.toLowerCase().replace(/[^a-z0-9]/g, '');

  const sortedTeams = [normalize(teamA), normalize(teamB)].sort().join('_');
  return `${dateStr}_${sortedTeams}`;
}

/**
 * Generates a unique fingerprint for a specific goal event in a match.
 * Used to deduplicate multiple user submissions of the exact same goal on Reddit.
 *
 * Example:
 *   generateGoalFingerprint("2026-09-09_chelsea_leeds", "90'+4'", 6, 3) === "2026-09-09_chelsea_leeds_m904_h6_a3"
 */
export function generateGoalFingerprint(
  matchId: string,
  minute: string | null,
  scoreHome: number | null,
  scoreAway: number | null,
): string | null {
  if (scoreHome === null || scoreAway === null) {
    return null;
  }
  const cleanMin = (minute ?? '').replace(/[^0-9]/g, '');
  return `${matchId}_m${cleanMin}_h${scoreHome}_a${scoreAway}`;
}
