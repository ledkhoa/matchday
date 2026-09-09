/**
 * Converts a soccer match minute string (e.g., "45'", "45+2'", "90+5'", "105'")
 * into total chronological seconds for accurate sorting.
 */
export function parseMinuteToSeconds(
  minute: string | null | undefined,
): number {
  if (!minute) {
    return Number.MAX_SAFE_INTEGER;
  }

  const cleaned = minute.replace(/['’]/g, '').trim();
  const plusIndex = cleaned.indexOf('+');

  if (plusIndex !== -1) {
    const regular = parseInt(cleaned.slice(0, plusIndex), 10);
    const extra = parseInt(cleaned.slice(plusIndex + 1), 10);
    if (!Number.isNaN(regular) && !Number.isNaN(extra)) {
      return (regular + extra) * 60;
    }
  }

  const parsed = parseInt(cleaned, 10);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed * 60;
}

/**
 * Sorts highlights chronologically by minute.
 * If minutes are equal or missing, sorts by postedAt timestamp ascending.
 */
export function sortHighlightsChronologically<
  T extends { minute: string | null | undefined; postedAt: number },
>(highlights: T[]): T[] {
  return [...highlights].sort((a, b) => {
    const timeA = parseMinuteToSeconds(a.minute);
    const timeB = parseMinuteToSeconds(b.minute);

    if (timeA !== timeB) {
      return timeA - timeB;
    }

    return a.postedAt - b.postedAt;
  });
}
