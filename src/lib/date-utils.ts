/**
 * Returns today's UTC calendar date as YYYY-MM-DD.
 */
export function getTodayUtcString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Adds or subtracts days from an ISO date string in UTC.
 */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Formats an ISO date (YYYY-MM-DD) into a human-readable display string in UTC.
 * Desktop: 'Saturday, September 9, 2026'
 * Mobile (short): 'Sat, Sep 9'
 */
export function formatDisplayDate(
  isoDate: string,
  options?: { short?: boolean },
): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));

  if (options?.short) {
    return date.toLocaleDateString('en-US', {
      timeZone: 'UTC',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Checks if a given ISO date is today's UTC calendar date.
 */
export function isTodayDate(isoDate: string): boolean {
  return isoDate === getTodayUtcString();
}

/**
 * Checks if a given ISO date is in the future relative to UTC today.
 */
export function isFutureDate(isoDate: string): boolean {
  return isoDate > getTodayUtcString();
}
