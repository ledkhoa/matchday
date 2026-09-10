export interface ZonedDayRange {
  startMs: number;
  endMs: number;
}

/**
 * Resolves the client's current IANA timezone name.
 * Defaults to 'UTC' in non-browser / SSR environments.
 */
export function getClientTimezone(): string {
  if ('Intl' in globalThis) {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }
  return 'UTC';
}

/**
 * Returns today's calendar date as YYYY-MM-DD in the specified timezone (or client local timezone).
 */
export function getTodayDateString(timeZone?: string): string {
  const tz = timeZone || getClientTimezone();
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return formatter.format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Returns today's UTC calendar date as YYYY-MM-DD.
 */
export function getTodayUtcString(): string {
  return getTodayDateString('UTC');
}

/**
 * Calculates the local timezone offset in milliseconds relative to UTC at a given timestamp.
 */
function getTzOffsetMs(timeMs: number, tz: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    fractionalSecondDigits: 3,
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(timeMs));
  let year = 1970;
  let month = 1;
  let day = 1;
  let hour = 0;
  let minute = 0;
  let second = 0;
  let frac = 0;

  for (const part of parts) {
    if (part.type === 'year') year = parseInt(part.value, 10);
    else if (part.type === 'month') month = parseInt(part.value, 10);
    else if (part.type === 'day') day = parseInt(part.value, 10);
    else if (part.type === 'hour') {
      const h = parseInt(part.value, 10);
      hour = h === 24 ? 0 : h;
    } else if (part.type === 'minute') minute = parseInt(part.value, 10);
    else if (part.type === 'second') second = parseInt(part.value, 10);
    else if (part.type === 'fractionalSecond') frac = parseInt(part.value, 10);
  }

  const localTimeAsUtc = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    frac,
  );
  return localTimeAsUtc - timeMs;
}

/**
 * Computes exact UTC millisecond bounds [startMs, endMs] for a calendar day in any IANA timezone.
 * Handles DST transitions seamlessly by evaluating dynamic local offset.
 */
export function getZonedDayRange(
  dateStr: string,
  timeZone?: string,
): ZonedDayRange {
  const tz = timeZone || 'UTC';
  const parts = dateStr.split('-').map(Number);
  let year = parts[0];
  let month = parts[1];
  let day = parts[2];

  if (
    !year ||
    !month ||
    !day ||
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day)
  ) {
    const now = new Date();
    year = now.getUTCFullYear();
    month = now.getUTCMonth() + 1;
    day = now.getUTCDate();
  }

  const guess = Date.UTC(year, month - 1, day, 0, 0, 0);

  try {
    const offsetMs = getTzOffsetMs(guess, tz);
    const startMs = guess - offsetMs;
    const nextDayGuess = Date.UTC(year, month - 1, day + 1, 0, 0, 0);
    const nextOffsetMs = getTzOffsetMs(nextDayGuess, tz);
    const endMs = nextDayGuess - nextOffsetMs - 1;
    return { startMs, endMs };
  } catch {
    // Fallback to UTC day bounds if timezone is unrecognized
    const startMs = guess;
    const endMs = Date.UTC(year, month - 1, day + 1, 0, 0, 0) - 1;
    return { startMs, endMs };
  }
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
 * Formats an ISO date (YYYY-MM-DD) into a human-readable display string.
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
 * Checks if a given ISO date is today's calendar date in the specified timezone (or client timezone).
 */
export function isTodayDate(isoDate: string, timeZone?: string): boolean {
  return isoDate === getTodayDateString(timeZone);
}

/**
 * Checks if a given ISO date is in the future relative to today in the specified timezone.
 */
export function isFutureDate(isoDate: string, timeZone?: string): boolean {
  return isoDate > getTodayDateString(timeZone);
}
