import { createServerFn } from '@tanstack/react-start';
import { getTodayDateString } from '../lib/date-utils';

/**
 * Safely resolves the viewer's timezone from the 'tz' cookie.
 */
export async function resolveServerCookieTimezone(): Promise<
  string | undefined
> {
  try {
    const { getCookie } = await import('@tanstack/react-start/server');
    return getCookie('tz');
  } catch {
    return undefined;
  }
}

/**
 * Safely resolves today's date formatted as YYYY-MM-DD on the server
 * using the viewer's 'tz' cookie.
 */
export async function resolveServerInitialDate(): Promise<string> {
  const tz = await resolveServerCookieTimezone();
  return getTodayDateString(tz);
}

/**
 * Server function: Reads the viewer's 'tz' cookie.
 */
export const getServerTimezone = createServerFn({ method: 'GET' }).handler(
  async (): Promise<string | undefined> => {
    return await resolveServerCookieTimezone();
  },
);

/**
 * Server function: Resolves today's local date string for the viewer.
 */
export const getInitialDate = createServerFn({ method: 'GET' }).handler(
  async (): Promise<string> => {
    return await resolveServerInitialDate();
  },
);
