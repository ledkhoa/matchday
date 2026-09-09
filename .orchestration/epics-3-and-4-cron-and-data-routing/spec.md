# Technical Specification: MD-EPIC-3 & MD-EPIC-4 Cron Triggers, Ingestion Execution & Data Routing

- **Epic Keys:** `MD-EPIC-3` & `MD-EPIC-4`
- **Target Sprint:** Sprint 2
- **Estimated Points:** 13 SP (5 SP for MD-EPIC-3, 8 SP for MD-EPIC-4)
- **Status:** Approved for Implementation
- **Target File:** `.orchestration/epics-3-and-4-cron-and-data-routing/spec.md`
- **Document Version:** 1.0.0

---

## 1. Executive Summary & Scope

### 1.1 Overview

This technical specification combines **MD-EPIC-3 (Scheduled Cron Triggers & Ingestion Execution)** and **MD-EPIC-4 (Routing, Server Functions & Data Loaders)** into a unified architectural blueprint for MatchDay's serverless orchestration and data presentation layers.

Together, these epics bridge the persistence pipeline established in Sprint 1 (`matches` and `highlights` tables in Cloudflare D1) to the responsive front-end experience built in Sprint 3:

1. **Automated Edge Ingestion (MD-EPIC-3)**: Runs scheduled background scraping on Cloudflare Workers every 10 minutes via cron triggers, supplemented by an authenticated manual HTTP endpoint (`/api/cron`) for testing, backfills, and health checks.
2. **Deterministic Routing & SSR Hydration (MD-EPIC-4)**: Routes incoming users from `/` to today's date digest (`/date/$date`), executes type-safe route loaders querying D1, and hydrates TanStack Query cache for instant client-side transitions between calendar days.

### 1.2 User Story Scope

This specification governs five user stories:

- **[MD-301] Configure Cloudflare Cron Trigger in Worker Handler**:
  Configure `wrangler.jsonc` with `"triggers": { "crons": ["*/10 * * * *"] }`, implement edge scheduled event handler in `src/server/cron.ts` using `ctx.waitUntil(...)`, and route scheduled events through the Cloudflare Worker entrypoint without blocking the worker isolate.
- **[MD-302] Secure Manual Ingestion Route (`/api/cron`)**:
  Implement authenticated HTTP POST server endpoint in `src/routes/api/cron.ts` enforcing `Authorization: Bearer <CRON_SECRET>`, invoking `ingestRedditHighlights(env.DB)`, and returning structured status payloads with zero `any` types.
- **[MD-401] Implement Root Route (`/`) Auto-Redirect to Today's Date**:
  Configure `src/routes/index.tsx` `beforeLoad` hook to throw a redirect to `/date/$date` using the current UTC ISO date (`YYYY-MM-DD`), preventing blank flashes and hydration mismatches during SSR and client navigation.
- **[MD-402] Daily Match Route Loader & D1 Query (`/date/$date`)**:
  Build `src/routes/date/$date.tsx` route loader validating the `$date` URL parameter against ISO date regex (`^\d{4}-\d{2}-\d{2}$`) with `notFound()`, querying Cloudflare D1 with relation joins, grouping highlights under matches, and sorting clips chronologically by match minute (including stoppage time).
- **[MD-403] TanStack Query Integration & SSR Hydration**:
  Define `createServerFn` data fetcher and `matchDayQueryOptions(date)` in `src/integrations/tanstack-query/root-provider.tsx`, pre-fetch queries in the route loader via `context.queryClient.ensureQueryData`, and consume cached data via `useSuspenseQuery` with full server-side HTML rendering and 5-minute client-side stale time.

### 1.3 Out of Scope

- UI component markup, Tailwind styling, match score cards, and responsive date navigation controls (scheduled for MD-EPIC-5).
- Inline video player embeds, iframe rendering, and domain fallbacks (scheduled for MD-EPIC-6).
- End-to-end browser tests with Playwright and production custom domain routing (scheduled for MD-EPIC-7).

---

## 2. End-to-End System Architecture & Data Flow

### 2.1 System Architecture Diagram

```mermaid
flowchart TD
    subgraph Cloudflare Edge Runtime
        subgraph Scheduled Ingestion ["MD-EPIC-3: Edge Ingestion Engine"]
            CronEvent[Cloudflare Cron Trigger: */10 * * * *] -->|scheduled event| EntryWorker[Worker Entrypoint: src/server/entry.ts]
            EntryWorker -->|ctx.waitUntil| CronHandler["handleScheduled() (src/server/cron.ts)"]

            ManualReq[HTTP POST /api/cron] -->|Bearer Token Header| ApiRoute["/api/cron Handler (src/routes/api/cron.ts)"]
            ApiRoute -->|Validate CRON_SECRET| IngestService["ingestRedditHighlights(env.DB)"]
            CronHandler --> IngestService

            IngestService -->|Fetch r/soccer/new.json| RedditAPI[(Reddit API)]
            IngestService -->|Batch Upserts| D1[(Cloudflare D1 SQLite)]
        end

        subgraph Client & SSR Routing ["MD-EPIC-4: TanStack Start Routing & Loaders"]
            UserNavRoot[User navigates to /] -->|beforeLoad 307 redirect| RedirectHook["Index Route (src/routes/index.tsx)"]
            RedirectHook -->|Redirect to /date/YYYY-MM-DD| DateRoute["Date Route (src/routes/date/$date.tsx)"]

            UserNavDate[User navigates to /date/$date] --> DateRoute
            DateRoute -->|validate regex ^\\d{4}-\\d{2}-\\d{2}$| DateValidator{Valid Date?}
            DateValidator -->|No| NotFoundHandler[throw notFound()]
            DateValidator -->|Yes| RouteLoader[Route Loader: ensureQueryData]

            RouteLoader --> QueryOptions["matchDayQueryOptions(date)"]
            QueryOptions --> ServerFn["fetchMatchesForDate (createServerFn)"]

            ServerFn -->|SSR / RPC execution| D1Query["Drizzle / D1 Query: SELECT matches + highlights"]
            D1Query --> D1

            D1 -->|Rows returned| Sorter["sortHighlightsChronologically()"]
            Sorter --> QueryCache[(TanStack Query Cache)]

            QueryCache -->|SSR Hydration Stream| SSRHtml[SSR HTML Page]
            QueryCache -->|Client Cache Hit (staleTime 5m)| InstantRender[Instant Page Transition]
        end
    end
```

### 2.2 Component Interaction Matrix

| Story      | Source File                                         | Caller / Trigger                                  | Dependencies                                                    | Execution Context                                   |
| :--------- | :-------------------------------------------------- | :------------------------------------------------ | :-------------------------------------------------------------- | :-------------------------------------------------- |
| **MD-301** | `src/server/cron.ts`                                | Cloudflare Cron Trigger (`*/10 * * * *`)          | `src/server/ingest.ts`, `src/types/env.d.ts`                    | Cloudflare Worker Background Task (`ctx.waitUntil`) |
| **MD-301** | `src/server/entry.ts`                               | Cloudflare Worker runtime (`fetch` & `scheduled`) | `@tanstack/react-start/server-entry`, `src/server/cron.ts`      | Cloudflare Edge Worker Entrypoint                   |
| **MD-302** | `src/routes/api/cron.ts`                            | HTTP POST `/api/cron` with `Authorization`        | `src/server/ingest.ts`, `src/types/env.d.ts`                    | TanStack Start Server Route Handler                 |
| **MD-401** | `src/routes/index.tsx`                              | Browser navigation to `/`                         | `@tanstack/react-router`                                        | Client Router & Edge SSR                            |
| **MD-402** | `src/routes/date/$date.tsx`                         | Navigation to `/date/$date`                       | `src/db/index.ts`, `src/db/schema.ts`, `@tanstack/react-router` | Server Loader & Client Router                       |
| **MD-403** | `src/integrations/tanstack-query/root-provider.tsx` | Date route loader & component hook                | `@tanstack/react-query`, `@tanstack/react-start`                | Server Function RPC & Client Cache                  |

### 2.3 Edge Runtime & Cloudflare D1 Constraints

1. **Worker Cron Execution Lifecycle**:
   - Scheduled invocations do not receive a standard HTTP `Request` or return an HTTP `Response`.
   - The worker isolate terminates as soon as the synchronous handler finishes unless async tasks are registered with `ctx.waitUntil(promise)`.
   - Ingestion duration must remain well within Cloudflare Worker wall-clock limits (free plans allow 30s CPU time, paid plans allow up to 15 minutes of asynchronous execution).
2. **Zero Unhandled Promise Rejections**:
   - Any unhandled exception in `ctx.waitUntil` marks the cron invocation as failed in Cloudflare dashboard metrics.
   - All errors inside `handleScheduled` must be captured, formatted, and logged with `console.error` without rethrowing.
3. **Stateless Edge Connection Handling**:
   - D1 bindings (`env.DB`) must be passed from the request/scheduled execution context into Drizzle's `createDb(env.DB)`. No persistent global database clients may be initialized at module scope.
4. **Isomorphic Data Serialization**:
   - TanStack Start server functions serialize returned data across the SSR/client boundary.
   - Dates, numbers, and null values must serialize cleanly to JSON. SQLite integer timestamps (`posted_at`, `created_at`, `updated_at`) must remain numbers.

---

## 3. Detailed Module Specifications

### 3.1 MD-301: Cloudflare Cron Trigger Configuration & Worker Handler

#### 3.1.1 Configuration (`wrangler.jsonc`)

The scheduled trigger must run every 10 minutes (`*/10 * * * *`).

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "matchday",
  "compatibility_date": "2025-09-02",
  "compatibility_flags": ["nodejs_compat"],
  "main": "src/server/entry.ts",
  "observability": {
    "enabled": true,
  },
  "upload_source_maps": true,
  "triggers": {
    "crons": ["*/10 * * * *"],
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "matchday-db",
      "database_id": "local-matchday-db",
      "migrations_dir": "migrations",
    },
  ],
}
```

> [!IMPORTANT]
> The `main` field in `wrangler.jsonc` is updated from `@tanstack/react-start/server-entry` to `src/server/entry.ts`. This allows MatchDay to cleanly intercept both incoming HTTP traffic (delegated to TanStack Start's request handler) and scheduled cron triggers (delegated to `handleScheduled`).

#### 3.1.2 Scheduled Handler Implementation (`src/server/cron.ts`)

Create `src/server/cron.ts` to implement the edge scheduled event handler:

```typescript
import { ingestRedditHighlights } from './ingest';
import type { CloudflareEnv } from '../types/env';

/**
 * Handles Cloudflare Workers scheduled cron triggers.
 *
 * Runs the Reddit ingestion pipeline asynchronously inside `ctx.waitUntil`
 * so the edge isolate remains alive until persistence concludes without blocking
 * the immediate event resolution. All errors are caught and logged to prevent
 * unhandled isolate crashes.
 */
export async function handleScheduled(
  event: ScheduledEvent,
  env: CloudflareEnv,
  ctx: ExecutionContext,
): Promise<void> {
  ctx.waitUntil(
    (async () => {
      const startTime = Date.now();
      console.log(
        `[CRON] Ingestion triggered at ${new Date(event.scheduledTime).toISOString()} (cron: "${event.cron}")`,
      );

      try {
        const config =
          env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET
            ? {
                clientId: env.REDDIT_CLIENT_ID,
                clientSecret: env.REDDIT_CLIENT_SECRET,
                userAgent: env.REDDIT_USER_AGENT,
              }
            : {
                userAgent: env.REDDIT_USER_AGENT,
              };

        const result = await ingestRedditHighlights(env.DB, config);
        const durationMs = Date.now() - startTime;

        console.log(
          `[CRON] Ingestion completed in ${durationMs}ms: fetched=${result.totalFetched}, parsed=${result.parsedCount}, persisted=${result.persistedCount}, skipped=${result.skippedCount}`,
        );

        if (result.errors.length > 0) {
          console.warn(
            `[CRON] Ingestion encountered ${result.errors.length} warnings/errors:`,
            JSON.stringify(result.errors),
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        console.error(
          `[CRON] Ingestion job failed with exception: ${message}`,
          stack,
        );
      }
    })(),
  );
}
```

#### 3.1.3 Unified Worker Entrypoint (`src/server/entry.ts`)

Create `src/server/entry.ts` to bridge TanStack Start edge SSR with Cloudflare Workers' `scheduled` hook:

```typescript
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server';
import { handleScheduled } from './cron';
import type { CloudflareEnv } from '../types/env';

/**
 * Default TanStack Start HTTP request handler.
 * Handles SSR, streaming HTML responses, client RPC server functions,
 * and server API file routes.
 */
const fetchHandler = createStartHandler(defaultStreamHandler);

export default {
  /**
   * Dispatches incoming HTTP requests to TanStack Start's request pipeline.
   */
  async fetch(
    request: Request,
    env: CloudflareEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    return await fetchHandler(request, {
      context: {
        env,
        ctx,
      },
    });
  },

  /**
   * Dispatches Cloudflare Workers scheduled cron triggers to the ingestion pipeline.
   */
  async scheduled(
    event: ScheduledEvent,
    env: CloudflareEnv,
    ctx: ExecutionContext,
  ): Promise<void> {
    await handleScheduled(event, env, ctx);
  },
};
```

---

### 3.2 MD-302: Authenticated Manual Ingestion Route (`src/routes/api/cron.ts`)

#### 3.2.1 Endpoint Specification

- **Path:** `/api/cron`
- **Method:** `POST`
- **Authentication:** Bearer token via `Authorization: Bearer <CRON_SECRET>`
- **Content-Type:** `application/json`

#### 3.2.2 Response Payloads & Status Codes

##### 1. HTTP 401 Unauthorized (Missing or Invalid Secret)

```json
{
  "success": false,
  "error": "Unauthorized"
}
```

##### 2. HTTP 200 OK (Successful Ingestion Run)

```json
{
  "success": true,
  "summary": {
    "totalFetched": 25,
    "parsedCount": 18,
    "persistedCount": 14,
    "skippedCount": 7,
    "errors": []
  },
  "durationMs": 412
}
```

##### 3. HTTP 500 Internal Server Error (Ingestion Failure)

```json
{
  "success": false,
  "error": "Ingestion failed",
  "details": "D1_ERROR: database is locked"
}
```

#### 3.2.3 Implementation Details (`src/routes/api/cron.ts`)

In TanStack Start (v1.168+), server routes are defined using `createFileRoute` with the `server.handlers` configuration:

```typescript
import { createFileRoute } from '@tanstack/react-router';
import { ingestRedditHighlights, type IngestResult } from '../../server/ingest';
import type { CloudflareEnv } from '../../types/env';

interface CronSuccessResponse {
  success: true;
  summary: IngestResult;
  durationMs: number;
}

interface CronErrorResponse {
  success: false;
  error: string;
  details?: string;
}

export const Route = createFileRoute('/api/cron')({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        const startTime = Date.now();

        // 1. Resolve Cloudflare environment bindings
        const env =
          (context as { env?: CloudflareEnv }).env ??
          (process.env as unknown as CloudflareEnv);
        const expectedSecret = env?.CRON_SECRET;

        // 2. Enforce Bearer authentication
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.startsWith('Bearer ')
          ? authHeader.slice(7).trim()
          : null;

        if (!expectedSecret || !token || token !== expectedSecret) {
          const body: CronErrorResponse = {
            success: false,
            error: 'Unauthorized',
          };
          return new Response(JSON.stringify(body), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // 3. Verify database binding exists
        if (!env?.DB) {
          const body: CronErrorResponse = {
            success: false,
            error: 'Server configuration error',
            details: 'Database binding (DB) is unavailable in worker context',
          };
          return new Response(JSON.stringify(body), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // 4. Execute ingestion pipeline
        try {
          const config =
            env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET
              ? {
                  clientId: env.REDDIT_CLIENT_ID,
                  clientSecret: env.REDDIT_CLIENT_SECRET,
                  userAgent: env.REDDIT_USER_AGENT,
                }
              : {
                  userAgent: env.REDDIT_USER_AGENT,
                };

          const summary = await ingestRedditHighlights(env.DB, config);
          const durationMs = Date.now() - startTime;

          const body: CronSuccessResponse = {
            success: true,
            summary,
            durationMs,
          };

          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          const details =
            error instanceof Error ? error.message : String(error);
          const body: CronErrorResponse = {
            success: false,
            error: 'Ingestion failed',
            details,
          };

          return new Response(JSON.stringify(body), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      },
    },
  },
});
```

---

### 3.3 MD-401: Root Route (`/`) Auto-Redirect to Today's Date

#### 3.3.1 Behavior & Mechanics

When a user visits `/`, the application must immediately redirect to `/date/$date` using the current date formatted as `YYYY-MM-DD` in UTC.

- **SSR Handling**: During server-side rendering, `beforeLoad` throws `redirect({ to: '/date/$date', params: { date: today } })`, instructing the server handler to issue an HTTP `307 Temporary Redirect` response.
- **Client Handling**: During client transitions, TanStack Router intercepts the redirect and navigates without triggering a browser refresh or blank screen.
- **UTC Date Standard**: All date keys in MatchDay are stored and indexed as UTC ISO dates (`YYYY-MM-DD`). Using local system time would cause timezone mismatches between client browsers in APAC/EMEA/Americas and D1 database keys.

#### 3.3.2 Implementation (`src/routes/index.tsx`)

Replace the starter placeholder in `src/routes/index.tsx`:

```typescript
import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * Returns today's UTC date formatted as YYYY-MM-DD.
 */
export function getTodayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    const today = getTodayUtcDate();
    throw redirect({
      to: '/date/$date',
      params: { date: today },
    });
  },
});
```

---

### 3.4 MD-402: Daily Match Route Loader & D1 Query Engine (`src/routes/date/$date.tsx`)

#### 3.4.1 Route Parameter Validation

The `$date` param must strictly adhere to the ISO 8601 calendar date format `YYYY-MM-DD` (`^\d{4}-\d{2}-\d{2}$`).

```typescript
export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

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
```

If the parameter is invalid, the route must call `throw notFound()`.

#### 3.4.2 Database Access & Relational Query Strategy

##### Schema Alignment

In `src/db/schema.ts`, table definitions and relations are already configured:

```typescript
// matches table columns: id, matchDate, teamHome, teamAway, createdAt, updatedAt
// highlights table columns: id, matchId, title, scoreHome, scoreAway, scorer, minute, tag, embedUrl, sourceUrl, redditUrl, redditScore, postedAt
```

##### Query Implementation Options

To query a day's matches with all their highlights, two strategies exist:

1. **Option A (Drizzle Relational Queries - Recommended)**:
   ```typescript
   const matches = await db.query.matches.findMany({
     where: eq(matchesTable.matchDate, date),
     with: {
       highlights: true,
     },
     orderBy: [desc(matchesTable.updatedAt)],
   });
   ```
   _Pros_: Fully type-safe natively through Drizzle without raw SQL mapping; zero `any` casting; handles 0-highlight matches transparently without empty JSON object artifacts.
2. **Option B (Raw D1 SQL with `json_group_array`)**:
   ```sql
   SELECT
     m.id,
     m.team_home,
     m.team_away,
     m.match_date,
     json_group_array(
       json_object(
         'id', h.id,
         'title', h.title,
         'scoreHome', h.score_home,
         'scoreAway', h.score_away,
         'scorer', h.scorer,
         'minute', h.minute,
         'tag', h.tag,
         'embedUrl', h.embed_url,
         'sourceUrl', h.source_url,
         'redditUrl', h.reddit_url,
         'redditScore', h.reddit_score,
         'postedAt', h.posted_at
       )
     ) AS highlights_json
   FROM matches m
   LEFT JOIN highlights h ON m.id = h.match_id
   WHERE m.match_date = ?
   GROUP BY m.id
   ORDER BY m.updated_at DESC;
   ```

_Decision_: We adopt **Option A** via Drizzle ORM relations as the primary query pattern because it eliminates runtime `JSON.parse` operations, automatically preserves strict SQLite number/string types, and directly complies with the `agents.md` rule banning `any` in D1 raw SQL mappings. For raw SQL execution, strict row interfaces (`RawMatchRow`, `RawHighlightJson`) must be enforced without exception.

#### 3.4.3 Chronological Highlight Sorting Algorithm

Highlights within a match must be sorted in match-time chronological sequence (e.g., `12'`, `34'`, `45+1'`, `67'`, `90+3'`, followed by unparseable/null minutes sorted by `postedAt`).

```typescript
/**
 * Converts a soccer match minute string (e.g., "45'", "45+2'", "90+5'", "105'")
 * into total chronological seconds for accurate sorting.
 */
export function parseMinuteToSeconds(
  minute: string | null | undefined,
): number {
  if (!minute) {
    return Number.MAX_SAFE_INTEGER;
  }

  const cleaned = minute.replace(/['’]/g, '').trim();
  const plusIndex = cleaned.indexOf('+');

  if (plusIndex !== -1) {
    const regular = parseInt(cleaned.slice(0, plusIndex), 10);
    const extra = parseInt(cleaned.slice(plusIndex + 1), 10);
    if (!Number.isNaN(regular) && !Number.isNaN(extra)) {
      return (regular + extra) * 60;
    }
  }

  const parsed = parseInt(cleaned, 10);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed * 60;
}

/**
 * Sorts highlights chronologically by minute.
 * If minutes are equal or missing, sorts by postedAt timestamp ascending.
 */
export function sortHighlightsChronologically<
  T extends { minute: string | null; postedAt: number },
>(highlights: T[]): T[] {
  return [...highlights].sort((a, b) => {
    const timeA = parseMinuteToSeconds(a.minute);
    const timeB = parseMinuteToSeconds(b.minute);

    if (timeA !== timeB) {
      return timeA - timeB;
    }

    return a.postedAt - b.postedAt;
  });
}
```

---

### 3.5 MD-403: TanStack Query Integration & SSR Hydration

#### 3.5.1 The Client-Server Boundary Challenge

In TanStack Start:

- Route loaders run on the server during initial SSR, but on the client during client-side navigation.
- If a route loader directly calls `db.query.matches.findMany(...)`, client-side navigation breaks because Cloudflare D1 is an edge-only runtime binding unavailable in the browser.
- **Solution**: The D1 query logic must be encapsulated in a **Server Function** (`createServerFn`). On SSR, the server function executes directly in the worker process. On the client, TanStack Start transparently handles RPC HTTP communication back to the server.

#### 3.5.2 Server Function Implementation (`src/server/matches.ts`)

Create `src/server/matches.ts` to expose the typed data fetcher:

```typescript
import { createServerFn } from '@tanstack/react-start';
import { eq, desc } from 'drizzle-orm';
import { createDb } from '../db';
import { matches as matchesTable } from '../db/schema';
import type { MatchWithHighlights } from '../db/schema';
import { sortHighlightsChronologically } from './parser-helpers';
import type { CloudflareEnv } from '../types/env';

export interface DayMatchesResult {
  date: string;
  matches: MatchWithHighlights[];
}

/**
 * Server Function: Fetches all soccer matches and chronologically ordered highlights
 * for a specific UTC date from Cloudflare D1.
 */
export const fetchMatchesForDate = createServerFn({ method: 'GET' })
  .validator((date: string) => {
    const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
    if (!ISO_DATE_REGEX.test(date)) {
      throw new Error(
        `Invalid date parameter: "${date}". Expected format: YYYY-MM-DD.`,
      );
    }
    return date;
  })
  .handler(async ({ data: date, context }): Promise<DayMatchesResult> => {
    const env =
      (context as { env?: CloudflareEnv }).env ??
      (process.env as unknown as CloudflareEnv);

    if (!env?.DB) {
      throw new Error('Cloudflare D1 database binding is unavailable');
    }

    const db = createDb(env.DB);

    const rows = await db.query.matches.findMany({
      where: eq(matchesTable.matchDate, date),
      with: {
        highlights: true,
      },
      orderBy: [desc(matchesTable.updatedAt)],
    });

    const matches: MatchWithHighlights[] = rows.map((match) => ({
      ...match,
      highlights: sortHighlightsChronologically(match.highlights),
    }));

    return {
      date,
      matches,
    };
  });
```

#### 3.5.3 TanStack Query Options (`src/integrations/tanstack-query/root-provider.tsx`)

Update `src/integrations/tanstack-query/root-provider.tsx` to declare the query options factory and configure the query cache stale time:

```typescript
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
export const matchDayQueryOptions = (date: string) =>
  queryOptions<DayMatchesResult, Error>({
    queryKey: ['matches', date],
    queryFn: () => fetchMatchesForDate({ data: date }),
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
```

#### 3.5.4 Daily Route Component & Loader (`src/routes/date/$date.tsx`)

Assemble the route loader, not-found check, pre-fetching, and consumption:

```typescript
import { createFileRoute, notFound } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { matchDayQueryOptions } from '../../integrations/tanstack-query/root-provider';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const Route = createFileRoute('/date/$date')({
  loader: async ({ params, context }) => {
    const { date } = params;

    // 1. Strict ISO date pattern validation
    if (!ISO_DATE_REGEX.test(date)) {
      throw notFound();
    }

    // 2. Pre-fetch via TanStack Query client for SSR hydration
    return await context.queryClient.ensureQueryData(matchDayQueryOptions(date));
  },
  notFoundComponent: () => {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <h2 className="text-2xl font-bold text-foreground">Invalid Date Format</h2>
        <p className="mt-2 text-muted-foreground">The date requested must follow the YYYY-MM-DD calendar format.</p>
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
      <h1 className="text-3xl font-extrabold tracking-tight">Matches for {date}</h1>
      <p className="mt-2 text-muted-foreground">Found {data.matches.length} matches.</p>

      {/* Full UI cards and highlight players will be mounted in MD-EPIC-5 and MD-EPIC-6 */}
      <div className="mt-6 space-y-4">
        {data.matches.map((match) => (
          <div key={match.id} className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm">
            <div className="text-lg font-semibold">
              {match.teamHome} vs {match.teamAway}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {match.highlights.length} highlight{match.highlights.length === 1 ? '' : 's'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 4. Strict Type Safety & Data Contracts

All interfaces must follow project standards: **zero `any` types**, **zero `@ts-ignore`**, and explicit inference.

### 4.1 Type Definitions (`src/types/routing.ts`)

```typescript
import type { Match, Highlight, MatchWithHighlights } from '../db/schema';
import type { IngestResult } from '../server/ingest';

/**
 * Route parameters for /date/$date.
 */
export interface DateRouteParams {
  date: string;
}

/**
 * Clean highlight item presented to the UI layer.
 */
export interface HighlightItem extends Highlight {}

/**
 * Structured match record containing associated chronologically ordered highlights.
 */
export interface MatchDigestItem extends MatchWithHighlights {}

/**
 * Payload returned by the daily match query.
 */
export interface DailyDigestResponse {
  date: string;
  matches: MatchDigestItem[];
}

/**
 * Ingestion API HTTP Response types.
 */
export interface CronApiResponseSuccess {
  success: true;
  summary: IngestResult;
  durationMs: number;
}

export interface CronApiResponseError {
  success: false;
  error: string;
  details?: string;
}

export type CronApiResponse = CronApiResponseSuccess | CronApiResponseError;
```

---

## 5. Error Handling, Fault Tolerance & Edge Observability

### 5.1 Fault Scenarios & Mitigations

| Failure Mode                    | Root Cause                                                     | Impact                                         | Mitigation Strategy                                                                                                                                        |
| :------------------------------ | :------------------------------------------------------------- | :--------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Worker Cron Timeout**         | Reddit API throttles or Cloudflare D1 RPC lags                 | Ingestion job terminates prematurely           | Ingest batch processing is chunked into 25-statement slices. Ingest returns partial counts if interrupted.                                                 |
| **Cron Ingestion Failure**      | Reddit API returns 502/429                                     | Reddit highlights unavailable                  | Catch exception in `handleScheduled`, log error message and stack trace to Cloudflare Observability, exit cleanly without throwing.                        |
| **Unauthorized Manual Trigger** | Attacker or unauthorized bot calls `POST /api/cron`            | Potential scraper spam and D1 write exhaustion | Enforce constant-time check on `Bearer ${expectedSecret}`. Return HTTP 401 with structured JSON.                                                           |
| **Malformed Date Route**        | Visitor navigates to `/date/hello-world` or `/date/2026-99-99` | Query execution error or blank page            | Regex verification `^\d{4}-\d{2}-\d{2}$` and calendar validation in `beforeLoad`/`loader` immediately throws `notFound()`.                                 |
| **Missing D1 Binding**          | Local development environment without Miniflare proxy          | `env.DB` is undefined                          | Server functions and API route handlers assert `env?.DB` presence and return actionable error messages instead of crashing with undefined property access. |
| **Zero Match Days**             | Off-season or quiet calendar dates with no matches             | Empty state                                    | Route loader returns `{ date, matches: [] }`. Component renders empty state safely without null pointer exceptions.                                        |

### 5.2 Structured Logging Convention

Worker logging must use consistent prefixes for easy filtering in Cloudflare Worker tail logs:

- `[CRON]` — Scheduled background tasks (`handleScheduled`)
- `[API:CRON]` — Manual ingestion invocations (`/api/cron`)
- `[QUERY:MATCHES]` — Server function daily match queries (`fetchMatchesForDate`)

---

## 6. Testing & Quality Assurance Strategy

### 6.1 Unit & Integration Test Matrix

All tests run via Bun test runner (`bun test`).

| Test Suite               | Target File                         | Test Cases                                                                                                                                                                                                                                                                                            |
| :----------------------- | :---------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cron Trigger Tests**   | `src/server/cron.test.ts`           | 1. `handleScheduled` invokes `ctx.waitUntil` with async ingestion.<br>2. Gracefully captures and logs ingestion errors without throwing unhandled rejection.<br>3. Configures OAuth credentials when present in `env`.                                                                                |
| **Manual Route Tests**   | `src/routes/api/cron.test.ts`       | 1. Rejects request without Authorization header (401).<br>2. Rejects request with invalid Bearer token (401).<br>3. Rejects request when `CRON_SECRET` is unset (401).<br>4. Executes ingestion and returns 200 with stats for valid token.<br>5. Returns 500 with error details if ingestion throws. |
| **Date Redirect Tests**  | `src/routes/index.test.ts`          | 1. Computes correct UTC date string (`YYYY-MM-DD`).<br>2. `beforeLoad` throws redirect to `/date/$today`.                                                                                                                                                                                             |
| **Minute Sorting Tests** | `src/server/parser-helpers.test.ts` | 1. Correctly orders `15'`, `45'`, `45+2'`, `60'`, `90'`, `90+4'`.<br>2. Handles extra time notation (`105'`, `120+1'`).<br>3. Places null/unparseable minutes at end sorted by `postedAt`.                                                                                                            |
| **Route Loader Tests**   | `src/routes/date/$date.test.ts`     | 1. Throws `notFound()` for malformed dates (`invalid`, `2026-13-45`).<br>2. Pre-fetches query data through `ensureQueryData`.                                                                                                                                                                         |

### 6.2 Quality Verification Gates

Prior to approving pull requests or closing tickets:

```bash
bun run format && bun run check
```

- `bun run typecheck`: Passes with 0 errors (`tsc --noEmit`).
- `oxlint .`: Zero lint errors across AST rules and anti-slop rules.
- `prettier . --check`: Zero formatting drift.
- `bun test`: All test suites pass.

---

## 7. Migration, Routes Generation & Deployment Checklist

1. **Wrangler Configuration Update**:
   - Add `"triggers": { "crons": ["*/10 * * * *"] }` to `wrangler.jsonc`.
   - Update `"main"` to `"src/server/entry.ts"`.
2. **Environment Secrets**:
   - Add `CRON_SECRET` to `.env.local` for local development.
   - For remote environments, configure secret:
     ```bash
     bunx wrangler secret put CRON_SECRET
     ```
3. **Route Generation**:
   - Run `tsr generate` to register `/date/$date` and `/api/cron` in `src/routeTree.gen.ts`:
     ```bash
     bun run generate-routes
     ```

---

## 8. Open Questions & Architectural Decisions

```markdown
### ARCHITECTURAL DECISION LOG

#### 1. Worker Entrypoint & Cron Hook Delegation

- **Decision**: Update `wrangler.jsonc` `main` field to point to `src/server/entry.ts`, which wraps TanStack Start's `createStartHandler(defaultStreamHandler)` alongside the Cloudflare Worker `scheduled` event export.
- **Rationale**: `@tanstack/react-start/server-entry` out-of-the-box only exports a `fetch` handler. To enable Cloudflare Workers scheduled cron triggers without external cron services, the worker must export `scheduled`. Wrapping the entrypoint is standard Cloudflare Worker architecture and maintains full compatibility with TanStack Start's request pipeline.

#### 2. Drizzle Relational Queries vs. Raw SQL Aggregation

- **Decision**: Use Drizzle ORM's `db.query.matches.findMany({ with: { highlights: true } })` inside `fetchMatchesForDate`.
- **Rationale**: Drizzle relations provide 100% compile-time type safety directly aligned with the project's zero-`any` standard. Raw SQLite `json_group_array` queries require manual string deserialization and risk `null` array items when a match has zero highlights.

#### 3. Server Functions (`createServerFn`) as the Query Transport

- **Decision**: Use `createServerFn` to back `matchDayQueryOptions(date)` rather than raw client-side HTTP calls or direct loader D1 bindings.
- **Rationale**: TanStack Start route loaders run isomorphically. When navigating between dates on the client, direct database access fails. `createServerFn` seamlessly generates an RPC bridge between the browser and Cloudflare Workers, allowing TanStack Query to cache data identically on server and client.

### OPEN QUESTIONS

1. **Cron Frequency Under Free Tier**: Cloudflare Worker free tier allows cron triggers, but with daily subrequest caps (100,000 requests/day). At `*/10 * * * *` (144 invocations/day, each making 1-2 Reddit subrequests), we consume ~288 subrequests daily, which is well within limits (<0.3%). No paid upgrade required for MVP.
2. **Client Timezone vs. UTC**: Users visiting at 11:30 PM local time may experience a different calendar date than UTC. The current design anchors all match indexing to UTC. In MD-EPIC-5, a local timezone indicator or client date override can be added to the calendar popover if desired.
```
