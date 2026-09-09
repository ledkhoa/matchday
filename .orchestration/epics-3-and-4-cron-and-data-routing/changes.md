# Summary of Changes: MD-EPIC-3 & MD-EPIC-4 (Cron Ingestion & Data Routing)

- **Epics Completed:** `MD-EPIC-3` (Scheduled Cron Triggers & Ingestion Execution) & `MD-EPIC-4` (Routing, Server Functions & Data Loaders)
- **User Stories Delivered:** `MD-301`, `MD-302`, `MD-401`, `MD-402`, `MD-403`
- **Quality Gates:** 80/80 tests passing, TypeScript 0 errors, Oxlint 0 errors/warnings, Prettier 100% compliant.

---

## 1. Architectural Overview

This release connects MatchDay's SQLite persistence pipeline (`matches` and `highlights` on Cloudflare D1) with edge cron scheduling and TanStack Start route loading:

1. **Automated & Manual Ingestion Execution**:
   - Cloudflare Workers cron schedule triggers ingestion every 10 minutes (`*/10 * * * *`) via `ctx.waitUntil`.
   - Dedicated authenticated REST endpoint at `POST /api/cron` accepts `Authorization: Bearer <CRON_SECRET>` for operational health checks, manual scrapers, and backfills.
2. **Deterministic Routing & Hydration**:
   - Root navigation (`/`) issues an immediate 307 temporary redirect to `/date/$date` utilizing today's UTC ISO date (`YYYY-MM-DD`).
   - Daily route (`/date/$date`) loader validates calendar date validity, pre-fetches match data via TanStack Query's `ensureQueryData`, and streams server-rendered HTML before hydrating client-side with 5-minute cache freshness.
   - Highlights are chronologically sorted by match minute including stoppage and extra-time notations (`45+2'`, `90+4'`, `105'`, `120+1'`).

---

## 2. File-by-File Detailed Changes

### 2.1 Configuration & Entrypoints

- [wrangler.jsonc](file:///Users/khoa/Documents/matchday/wrangler.jsonc):
  - Updated `"main"` to point to custom edge entrypoint `"src/server/entry.ts"`.
  - Configured `"triggers": { "crons": ["*/10 * * * *"] }`.
- [tsr.config.json](file:///Users/khoa/Documents/matchday/tsr.config.json):
  - Added `"routeFileIgnorePattern": ".*\\.test\\.(ts|tsx)$"` to prevent co-located test files in `src/routes/` from polluting the generated route tree.
- [src/routeTree.gen.ts](file:///Users/khoa/Documents/matchday/src/routeTree.gen.ts):
  - Generated route tree registering `/`, `/api/cron`, and `/date/$date`.

### 2.2 Ingestion & Worker Cron Trigger (MD-301 & MD-302)

- [src/server/cron.ts](file:///Users/khoa/Documents/matchday/src/server/cron.ts):
  - Implemented `handleScheduled` edge event handler.
  - Wrapped scraper pipeline in `ctx.waitUntil` to allow asynchronous batch persistence without blocking the isolate.
  - Added error isolation, logging warnings and exceptions with `[CRON]` prefix without uncaught promise rejections.
- [src/server/entry.ts](file:///Users/khoa/Documents/matchday/src/server/entry.ts):
  - Created unified Cloudflare Worker entrypoint exporting `fetch` (delegated to TanStack Start's `createStartHandler(defaultStreamHandler)`) and `scheduled` (delegated to `handleScheduled`).
- [src/server/cron.test.ts](file:///Users/khoa/Documents/matchday/src/server/cron.test.ts):
  - Unit tests verifying `ctx.waitUntil` registration, OAuth credential passing, and graceful error logging.
- [src/routes/api/cron.ts](file:///Users/khoa/Documents/matchday/src/routes/api/cron.ts):
  - Implemented `POST /api/cron` server file route handler.
  - Enforces constant Bearer token authentication against `CRON_SECRET`.
  - Returns structured `CronApiResponse` (`{ success: true, summary, durationMs }` or `{ success: false, error, details }`).
- [src/routes/api/cron.test.ts](file:///Users/khoa/Documents/matchday/src/routes/api/cron.test.ts):
  - 7 unit test cases verifying 401 unauthorized (missing header, bad token, unset secret), 500 server configuration error (missing D1 binding), 200 successful execution, and 500 caught ingestion errors parsed via Zod schemas.

### 2.3 Routing, Parsing & TanStack Query SSR (MD-401, MD-402, MD-403)

- [src/types/routing.ts](file:///Users/khoa/Documents/matchday/src/types/routing.ts):
  - Declared `DateRouteParams`, `HighlightItem`, `MatchDigestItem`, `DailyDigestResponse`, `CronApiResponseSuccess`, `CronApiResponseError`, and `CronApiResponse`.
- [src/server/parser-helpers.ts](file:///Users/khoa/Documents/matchday/src/server/parser-helpers.ts):
  - Implemented `parseMinuteToSeconds`: converts soccer minute strings (e.g., `45'`, `45+2'`, `90+4'`, `105'`) to chronological seconds for sorting.
  - Implemented `sortHighlightsChronologically`: orders clips by match second ascending, placing unparseable/null minutes at the end sorted by `postedAt` ascending.
- [src/server/parser-helpers.test.ts](file:///Users/khoa/Documents/matchday/src/server/parser-helpers.test.ts):
  - 10 unit tests covering regular match minutes, stoppage time, extra time, apostrophe/prime variations, and tie-breaking by `postedAt`.
- [src/server/matches.ts](file:///Users/khoa/Documents/matchday/src/server/matches.ts):
  - Created `fetchMatchesForDate` Server Function (`createServerFn({ method: 'GET' })`).
  - Added ISO date validator (`YYYY-MM-DD`).
  - Queries D1 via Drizzle relational query `db.query.matches.findMany({ with: { highlights: true } })`.
  - Sorts highlights per match chronologically using `sortHighlightsChronologically`.
- [src/integrations/tanstack-query/root-provider.tsx](file:///Users/khoa/Documents/matchday/src/integrations/tanstack-query/root-provider.tsx):
  - Declared `matchDayQueryOptions(date)` factory with 5-minute stale time (`1000 * 60 * 5`).
  - Configured `QueryClient` defaults with `MATCH_QUERY_STALE_TIME_MS`.
- [src/routes/index.tsx](file:///Users/khoa/Documents/matchday/src/routes/index.tsx):
  - Implemented `beforeLoad` auto-redirect to `/date/$date` using UTC date `getTodayUtcDate()`.
- [src/routes/index.test.ts](file:///Users/khoa/Documents/matchday/src/routes/index.test.ts):
  - Tests `getTodayUtcDate` format and verifies `handleIndexBeforeLoad` throws HTTP 307 redirect with target `/date/$date`.
- [src/routes/date/$date.tsx](file:///Users/khoa/Documents/matchday/src/routes/date/$date.tsx):
  - Implemented `isValidIsoDate` validating regex and calendar validity.
  - Route loader `loadDateRoute` pre-fetches `matchDayQueryOptions(date)` via `ensureQueryData` and calls `throw notFound()` on invalid dates.
  - Added `notFoundComponent` fallback and `DateRouteComponent` consuming data via `useSuspenseQuery`.
- [src/routes/date/$date.test.ts](file:///Users/khoa/Documents/matchday/src/routes/date/$date.test.ts):
  - Unit tests verifying valid dates, malformed strings, calendar-invalid dates (`2026-13-45`), `ensureQueryData` pre-fetching, and `notFoundComponent`.

### 2.4 Supporting Test & Module State Enhancements

- [src/server/reddit.ts](file:///Users/khoa/Documents/matchday/src/server/reddit.ts) & [src/server/reddit.test.ts](file:///Users/khoa/Documents/matchday/src/server/reddit.test.ts):
  - Exported `clearTokenCache()` to allow deterministic cache resetting between tests, avoiding test pollution when running the entire test suite in parallel.

---

## 3. Verification & Test Output

### 3.1 Unit Test Suite (`bun test src`)

```
 80 pass
 0 fail
 169 expect() calls
Ran 80 tests across 9 files. [100.00ms]
```

### 3.2 Static Analysis & Formatting Checks

- `tsc --noEmit`: 0 errors. Strict TypeScript compliance with zero `any` types.
- `oxlint .`: 0 errors, 0 warnings across all 111 rules and custom anti-slop rules.
- `prettier . --check`: All matched files use Prettier code style.
