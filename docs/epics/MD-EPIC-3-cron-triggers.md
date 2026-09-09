# MD-EPIC-3: Scheduled Cron Triggers & Ingestion Execution

- **Key:** `MD-EPIC-3`
- **Status:** To Do
- **Target Sprint:** Sprint 2
- **Total Points:** 5 SP
- **Lead / Assignee:** TBD

---

## 🎯 Epic Overview

Automate highlight ingestion on Cloudflare Workers edge runtime by attaching scheduled cron triggers running every 10 minutes, complemented by an authenticated HTTP endpoint for manual triggers, backfills, and health checks.

---

## 🎫 User Stories

### [MD-301] Configure Cloudflare Cron Trigger in Worker Handler

- **Type:** Story
- **Estimation:** 3 SP
- **Priority:** High
- **Dependencies:** MD-204

#### User Story

> **As a** system administrator,  
> **I want** the ingestion pipeline to run automatically every 10 minutes on Cloudflare Workers,  
> **So that** fresh highlights from live soccer matches are indexed with minimal latency.

#### Technical Specifications

1. Configure cron trigger in `wrangler.jsonc`:
   ```jsonc
   {
     "triggers": {
       "crons": ["*/10 * * * *"],
     },
   }
   ```
2. Implement edge scheduled event handler in `src/server/cron.ts`:
   ```typescript
   import { ingestRedditHighlights } from './ingest';
   import type { CloudflareEnv } from '../types/env';

   export async function handleScheduled(
     event: ScheduledEvent,
     env: CloudflareEnv,
     ctx: ExecutionContext,
   ): Promise<void> {
     ctx.waitUntil(
       (async () => {
         try {
           const result = await ingestRedditHighlights(env.DB);
           console.log(`[CRON] Ingestion completed: ${JSON.stringify(result)}`);
         } catch (err) {
           console.error('[CRON] Ingestion failed:', err);
         }
       })(),
     );
   }
   ```
3. Export scheduled hook in the Cloudflare entrypoint if supported by `@tanstack/react-start/server-entry`.

#### Acceptance Criteria

- [ ] Cron schedule `*/10 * * * *` is defined in `wrangler.jsonc`.
- [ ] Invocation runs asynchronously inside `ctx.waitUntil(...)` without blocking worker execution.
- [ ] Ingestion errors are captured in worker logs without crashing the worker process.

---

### [MD-302] Secure Manual Ingestion Route (`/api/cron`)

- **Type:** Story
- **Estimation:** 2 SP
- **Priority:** High
- **Dependencies:** MD-204

#### User Story

> **As a** developer or CI pipeline,  
> **I want** an authenticated HTTP endpoint to trigger ingestion on demand,  
> **So that** I can backfill data, debug ingestion issues, or invoke scraping externally.

#### Technical Specifications

1. Create `src/routes/api/cron.ts` using TanStack Start server handler:
   ```typescript
   import { createAPIFileRoute } from '@tanstack/react-start/api';
   import { ingestRedditHighlights } from '../../server/ingest';

   export const Route = createAPIFileRoute('/api/cron')({
     POST: async ({ request, context }) => {
       const authHeader = request.headers.get('Authorization');
       const expectedSecret = context.env.CRON_SECRET;

       if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
         return new Response(JSON.stringify({ error: 'Unauthorized' }), {
           status: 401,
           headers: { 'Content-Type': 'application/json' },
         });
       }

       try {
         const summary = await ingestRedditHighlights(context.env.DB);
         return new Response(JSON.stringify({ success: true, summary }), {
           status: 200,
           headers: { 'Content-Type': 'application/json' },
         });
       } catch (err: any) {
         return new Response(
           JSON.stringify({ error: 'Ingestion failed', details: err.message }),
           { status: 500, headers: { 'Content-Type': 'application/json' } },
         );
       }
     },
   });
   ```
2. Support environment variable `CRON_SECRET` in `.env.local` and Cloudflare Worker secrets.

#### Acceptance Criteria

- [ ] Request without valid `Authorization: Bearer <secret>` returns HTTP 401 Unauthorized.
- [ ] Valid authenticated request runs ingestion and returns HTTP 200 with result statistics.
