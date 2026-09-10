import { createFileRoute, redirect } from '@tanstack/react-router';
import { getCookie } from '@tanstack/react-start/server';
import { getTodayDateString } from '#/lib/date-utils';

/**
 * Returns today's calendar date formatted as YYYY-MM-DD in the user's timezone.
 */
export function getTodayUserDate(): string {
  let tz: string | undefined;
  if ('document' in globalThis && 'Intl' in globalThis) {
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      tz = undefined;
    }
  } else {
    try {
      tz = getCookie('tz');
    } catch {
      tz = undefined;
    }
  }
  return getTodayDateString(tz);
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
export function handleIndexBeforeLoad() {
  const today = getTodayUserDate();
  throw redirect({
    to: '/date/$date',
    params: { date: today },
  });
}

export const Route = createFileRoute('/')({
  beforeLoad: handleIndexBeforeLoad,
});
