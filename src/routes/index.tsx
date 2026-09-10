import { createFileRoute, redirect } from '@tanstack/react-router';
import { getTodayDateString } from '#/lib/date-utils';
import { getInitialDate } from '#/server/timezone';

/**
 * Returns today's calendar date formatted as YYYY-MM-DD in the user's timezone.
 */
export async function getTodayUserDate(): Promise<string> {
  if ('document' in globalThis && 'Intl' in globalThis) {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) return getTodayDateString(tz);
    } catch {
      // Fallback to server function
    }
  }
  try {
    return await getInitialDate();
  } catch {
    return getTodayDateString();
  }
}

/**
 * Returns today's UTC date formatted as YYYY-MM-DD.
 */
export function getTodayUtcDate(): string {
  return getTodayDateString('UTC');
}

/**
 * Executes root route beforeLoad redirection to today's local date.
 */
export async function handleIndexBeforeLoad() {
  const today = await getTodayUserDate();
  throw redirect({
    to: '/date/$date',
    params: { date: today },
  });
}

export const Route = createFileRoute('/')({
  beforeLoad: handleIndexBeforeLoad,
});
