# MD-EPIC-4: Routing, Server Functions & Data Loaders

- **Key:** `MD-EPIC-4`
- **Status:** To Do
- **Target Sprint:** Sprint 2
- **Total Points:** 8 SP
- **Lead / Assignee:** TBD

---

## 🎯 Epic Overview

Deliver the core TanStack Start routing and data loading architecture. Includes root index redirect to today's date (`/date/$date`), type-safe route loaders querying Cloudflare D1 with JSON aggregation, and TanStack Query SSR integration.

---

## 🎫 User Stories

### [MD-401] Implement Root Route (`/`) Auto-Redirect to Today's Date

- **Type:** Story
- **Estimation:** 2 SP
- **Priority:** Critical
- **Dependencies:** None

#### User Story

> **As a** visitor navigating to the base domain,  
> **I want** to be instantly redirected to today's date route (`/date/YYYY-MM-DD`),  
> **So that** I immediately see today's soccer digest without additional clicks.

#### Technical Specifications

1. Modify `src/routes/index.tsx`:
   ```typescript
   import { createFileRoute, redirect } from '@tanstack/react-router';

   export const Route = createFileRoute('/')({
     beforeLoad: () => {
       const today = new Date().toISOString().split('T')[0];
       throw redirect({
         to: '/date/$date',
         params: { date: today },
       });
     },
   });
   ```
2. Ensure redirect runs on both SSR and client-side transitions.
3. Use UTC date string format (`YYYY-MM-DD`) to align with Cloudflare D1 indices.

#### Acceptance Criteria

- [ ] Direct navigation to `/` triggers a 302/307 redirect to `/date/YYYY-MM-DD`.
- [ ] No blank flashes or hydration errors during redirection.

---

### [MD-402] Daily Match Route Loader & D1 Query (`/date/$date`)

- **Type:** Story
- **Estimation:** 3 SP
- **Priority:** Critical
- **Dependencies:** MD-102

#### User Story

> **As a** user viewing a specific day,  
> **I want** the route loader to efficiently fetch matches and chronologically ordered highlights,  
> **So that** the page renders completely with server-side data.

#### Technical Specifications

1. Create `src/routes/date/$date.tsx`:
   - Validate `$date` parameter with regex format: `^\d{4}-\d{2}-\d{2}$`.
   - Implement route loader with Cloudflare D1 binding:
     ```typescript
     import { createFileRoute, notFound } from '@tanstack/react-router';

     export interface HighlightItem {
       id: string;
       title: string;
       scoreHome: number | null;
       scoreAway: number | null;
       scorer: string | null;
       minute: string | null;
       tag: string | null;
       embedUrl: string | null;
       sourceUrl: string;
       redditUrl: string;
       upvotes: number;
     }

     export interface MatchWithHighlights {
       id: string;
       match_date: string;
       team_home: string;
       team_away: string;
       highlights: HighlightItem[];
     }

     export const Route = createFileRoute('/date/$date')({
       loader: async ({
         params,
         context,
       }): Promise<{ date: string; matches: MatchWithHighlights[] }> => {
         const { date } = params;
         const db = (context as any).env?.DB;

         const query = `
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
                 'upvotes', h.reddit_score
               )
             ) AS highlights_json
           FROM matches m
           LEFT JOIN highlights h ON m.id = h.match_id
           WHERE m.match_date = ?
           GROUP BY m.id
           ORDER BY m.updated_at DESC;
         `;

         const { results } = await db.prepare(query).bind(date).all();

         const matches: MatchWithHighlights[] = (results || []).map(
           (row: any) => {
             const parsedHighlights: HighlightItem[] = JSON.parse(
               row.highlights_json,
             )
               .filter((h: any) => h.id !== null)
               .sort((a: HighlightItem, b: HighlightItem) =>
                 (a.minute || '').localeCompare(b.minute || '', undefined, {
                   numeric: true,
                 }),
               );

             return {
               id: row.id,
               match_date: row.match_date,
               team_home: row.team_home,
               team_away: row.team_away,
               highlights: parsedHighlights,
             };
           },
         );

         return { date, matches };
       },
     });
     ```
2. Handle invalid date formats gracefully by throwing `notFound()`.

#### Acceptance Criteria

- [ ] Route loader executes query against D1 using indexed `match_date`.
- [ ] Returns strictly typed data object with grouped, chronologically sorted highlights.
- [ ] Handles zero-match days gracefully by returning `{ date, matches: [] }`.

---

### [MD-403] TanStack Query Integration & SSR Hydration

- **Type:** Story
- **Estimation:** 3 SP
- **Priority:** High
- **Dependencies:** MD-402

#### User Story

> **As a** user navigating between consecutive days,  
> **I want** cached data to load instantly,  
> **So that** browsing through days feels instantaneous and responsive.

#### Technical Specifications

1. Update `src/integrations/tanstack-query/root-provider.tsx` to handle route query options:
   ```typescript
   export const matchDayQueryOptions = (date: string) =>
     queryOptions({
       queryKey: ['matches', date],
       queryFn: () => fetchMatchesForDate(date),
       staleTime: 1000 * 60 * 5, // 5 minutes
     });
   ```
2. Utilize `setupRouterSsrQueryIntegration` configured in `src/router.tsx`.
3. Pre-fetch queries in route `loader` or `beforeLoad`.

#### Acceptance Criteria

- [ ] Page renders full HTML on initial server-side load.
- [ ] Client-side navigation between previously viewed dates loads instantaneously from Query Cache.
- [ ] TanStack Query Devtools shows query states and cache invalidation.
