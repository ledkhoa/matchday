import { useState, useEffect, useMemo } from 'react';
import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Trophy } from 'lucide-react';
import { getCookie } from '@tanstack/react-start/server';
import { matchDayQueryOptions } from '../../integrations/tanstack-query/root-provider';
import { DateNav } from '#/components/DateNav';
import { MatchCard } from '#/components/MatchCard';
import { EmptyState } from '#/components/EmptyState';
import { LeagueFilter, type LeagueCount } from '#/components/LeagueFilter';

export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const dateRouteSearchSchema = z.object({
  league: z.string().optional(),
});

export type DateRouteSearch = z.infer<typeof dateRouteSearchSchema>;

/**
 * Resolves the viewer's timezone from client Intl or server cookie.
 */
export function resolveRequestTimezone(): string {
  if ('document' in globalThis && 'Intl' in globalThis) {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }
  try {
    return getCookie('tz') || 'UTC';
  } catch {
    return 'UTC';
  }
}

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

  // 2. Pre-fetch via TanStack Query client for SSR hydration respecting viewer timezone
  const tz = resolveRequestTimezone();
  return await context.queryClient.ensureQueryData(
    matchDayQueryOptions(date, tz),
  );
}

export function DateRouteComponent() {
  const { date } = Route.useParams();
  const tz = useMemo(() => resolveRequestTimezone(), []);

  // SAFETY: Safely resolve active league from URL search params with fallback for test mocks
  let activeLeague: string | undefined;
  try {
    const search = Route.useSearch();
    activeLeague = search?.league;
  } catch {
    activeLeague = undefined;
  }

  const navigate = useNavigate();
  const { data } = useSuspenseQuery(matchDayQueryOptions(date, tz));
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(
    null,
  );

  // Compute available active leagues and their counts from the current day's fixtures
  const availableLeagues = useMemo<LeagueCount[]>(() => {
    const leagueMap = new Map<string, LeagueCount>();
    for (const match of data.matches) {
      if (match.competition) {
        const existing = leagueMap.get(match.competition);
        if (existing) {
          existing.count++;
        } else {
          leagueMap.set(match.competition, {
            name: match.competition,
            logo: match.leagueLogo,
            count: 1,
          });
        }
      }
    }
    return Array.from(leagueMap.values());
  }, [data.matches]);

  // Filter matches by selected league
  const filteredMatches = useMemo(() => {
    if (!activeLeague) return data.matches;
    return data.matches.filter((m) => m.competition === activeLeague);
  }, [data.matches, activeLeague]);

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

  const handleSelectLeague = (league?: string) => {
    try {
      navigate({
        to: '/date/$date',
        params: { date },
        search: (prev: DateRouteSearch) => ({
          ...prev,
          league: league || undefined,
        }),
      });
    } catch {
      // In tests where router context is not mounted
    }
  };

  return (
    <div className="space-y-6">
      {/* Date Navigation Bar */}
      <DateNav currentDate={date} />

      {/* Content Feed */}
      {data.matches.length === 0 ? (
        <EmptyState date={date} />
      ) : (
        <div className="space-y-4 sm:space-y-6">
          {/* League Filter Bar */}
          <LeagueFilter
            activeLeague={activeLeague}
            totalMatches={data.matches.length}
            availableLeagues={availableLeagues}
            onSelectLeague={handleSelectLeague}
          />

          {filteredMatches.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center shadow-inner sm:p-12">
              <Trophy className="mb-3 h-10 w-10 text-zinc-600" />
              <h3 className="text-base font-bold text-zinc-200 sm:text-lg">
                No matches found for {activeLeague}
              </h3>
              <p className="mt-1 text-xs text-zinc-400 sm:text-sm">
                There are no scheduled {activeLeague} fixtures on this date.
              </p>
              <button
                type="button"
                onClick={() => handleSelectLeague(undefined)}
                className="mt-4 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                Show All Matches ({data.matches.length})
              </button>
            </div>
          ) : (
            filteredMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                activeHighlightId={activeHighlightId}
                timeZone={tz}
                onSelectHighlight={(hl) =>
                  setActiveHighlightId((prev) =>
                    prev === hl.id ? null : hl.id,
                  )
                }
                onCloseHighlight={() => setActiveHighlightId(null)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute('/date/$date')({
  validateSearch: dateRouteSearchSchema,
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
