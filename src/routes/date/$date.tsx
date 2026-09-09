import { useState, useEffect } from 'react';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { matchDayQueryOptions } from '../../integrations/tanstack-query/root-provider';
import { DateNav } from '#/components/DateNav';
import { MatchCard } from '#/components/MatchCard';
import { EmptyState } from '#/components/EmptyState';

export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates that a string is a calendar-valid ISO 8601 date (YYYY-MM-DD).
 */
export function isValidIsoDate(dateString: string): boolean {
  if (!ISO_DATE_REGEX.test(dateString)) {
    return false;
  }
  const date = new Date(`${dateString}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === dateString
  );
}

export interface DateRouteLoaderContext {
  params: { date: string };
  context: { queryClient: QueryClient };
}

/**
 * Route loader for /date/$date. Validates date parameter and pre-fetches match data for SSR hydration.
 */
export async function loadDateRoute({
  params,
  context,
}: DateRouteLoaderContext) {
  const { date } = params;

  // 1. Strict ISO date pattern and calendar validity check
  if (!isValidIsoDate(date)) {
    throw notFound();
  }

  // 2. Pre-fetch via TanStack Query client for SSR hydration
  return await context.queryClient.ensureQueryData(matchDayQueryOptions(date));
}

export function DateRouteComponent() {
  const { date } = Route.useParams();
  const { data } = useSuspenseQuery(matchDayQueryOptions(date));
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(
    null,
  );

  // Reset active highlight whenever date parameter changes
  useEffect(() => {
    setActiveHighlightId(null);
  }, [date]);

  // Global Escape key listener collapses any currently playing video
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveHighlightId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="space-y-6">
      {/* Date Navigation Bar */}
      <DateNav currentDate={date} />

      {/* Content Feed */}
      {data.matches.length === 0 ? (
        <EmptyState date={date} />
      ) : (
        <div className="space-y-4 sm:space-y-6">
          {data.matches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              activeHighlightId={activeHighlightId}
              onSelectHighlight={(hl) =>
                setActiveHighlightId((prev) => (prev === hl.id ? null : hl.id))
              }
              onCloseHighlight={() => setActiveHighlightId(null)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute('/date/$date')({
  loader: loadDateRoute,
  notFoundComponent: () => {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <h2 className="text-2xl font-bold text-zinc-100">
          Invalid Date Format
        </h2>
        <p className="mt-2 text-zinc-400">
          The date requested must follow the YYYY-MM-DD calendar format.
        </p>
      </div>
    );
  },
  component: DateRouteComponent,
});
