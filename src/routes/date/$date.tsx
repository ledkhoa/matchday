import { createFileRoute, notFound } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { matchDayQueryOptions } from '../../integrations/tanstack-query/root-provider';

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

export const Route = createFileRoute('/date/$date')({
  loader: loadDateRoute,
  notFoundComponent: () => {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <h2 className="text-2xl font-bold text-foreground">
          Invalid Date Format
        </h2>
        <p className="mt-2 text-muted-foreground">
          The date requested must follow the YYYY-MM-DD calendar format.
        </p>
      </div>
    );
  },
  component: DateRouteComponent,
});

function DateRouteComponent() {
  const { date } = Route.useParams();
  const { data } = useSuspenseQuery(matchDayQueryOptions(date));

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-extrabold tracking-tight">
        Matches for {date}
      </h1>
      <p className="mt-2 text-muted-foreground">
        Found {data.matches.length} matches.
      </p>

      {/* Full UI cards and highlight players will be mounted in MD-EPIC-5 and MD-EPIC-6 */}
      <div className="mt-6 space-y-4">
        {data.matches.map((match) => (
          <div
            key={match.id}
            className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm"
          >
            <div className="text-lg font-semibold">
              {match.teamHome} vs {match.teamAway}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {match.highlights.length} highlight
              {match.highlights.length === 1 ? '' : 's'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
