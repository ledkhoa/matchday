import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * Returns today's UTC date formatted as YYYY-MM-DD.
 */
export function getTodayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Executes root route beforeLoad redirection to today's date.
 */
export function handleIndexBeforeLoad() {
  const today = getTodayUtcDate();
  throw redirect({
    to: '/date/$date',
    params: { date: today },
  });
}

export const Route = createFileRoute('/')({
  beforeLoad: handleIndexBeforeLoad,
});
