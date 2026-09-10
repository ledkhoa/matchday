import { QueryClient, queryOptions } from '@tanstack/react-query';
import {
  fetchMatchesForDate,
  type DayMatchesResult,
} from '../../server/matches';

export const MATCH_QUERY_STALE_TIME_MS = 1000 * 60 * 5; // 5 minutes

/**
 * Factory for matchday query options.
 * Enables unified query fetching across route loaders, client pre-fetching,
 * and Suspense hooks.
 */
export const matchDayQueryOptions = (date: string, tz?: string) =>
  queryOptions<DayMatchesResult, Error>({
    queryKey: ['matches', date, tz ?? 'UTC'],
    queryFn: () => fetchMatchesForDate({ data: { date, tz } }),
    staleTime: MATCH_QUERY_STALE_TIME_MS,
  });

export function getContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: MATCH_QUERY_STALE_TIME_MS,
      },
    },
  });

  return {
    queryClient,
  };
}

export default function TanstackQueryProvider() {}
