# MD-EPIC-1: Database Layer & Cloudflare D1 Architecture

- **Key:** `MD-EPIC-1`
- **Status:** To Do
- **Target Sprint:** Sprint 1
- **Total Points:** 8 SP
- **Lead / Assignee:** TBD

---

## 🎯 Epic Overview

Establish the persistence foundation for MatchDay using Cloudflare D1 (Serverless SQLite) and Drizzle ORM. This involves configuring D1 bindings in `wrangler.jsonc`, implementing the Drizzle schema with typed entities, creating automated migration scripts, and providing mock seed data for development.

---

## 🎫 User Stories

### [MD-101] Configure Cloudflare D1 Database Binding & Wrangler Configuration

- **Type:** Story
- **Estimation:** 2 SP
- **Priority:** Critical
- **Dependencies:** None

#### User Story

> **As a** developer,  
> **I want** Cloudflare D1 configured in `wrangler.jsonc` and exposed to the TanStack Start runtime,  
> **So that** server functions and edge loaders can interact with the SQLite database.

#### Technical Specifications

1. Edit `wrangler.jsonc`:
   - Declare the D1 database binding `DB`:
     ```jsonc
     {
       "$schema": "node_modules/wrangler/config-schema.json",
       "name": "matchday",
       "compatibility_date": "2025-09-02",
       "compatibility_flags": ["nodejs_compat"],
       "main": "@tanstack/react-start/server-entry",
       "d1_databases": [
         {
           "binding": "DB",
           "database_name": "matchday-db",
           "database_id": "local-matchday-db",
         },
       ],
     }
     ```
2. Define TypeScript environment bindings in `src/types/env.d.ts`:
   ```typescript
   export interface CloudflareEnv {
     DB: D1Database;
     CRON_SECRET?: string;
   }
   ```
3. Ensure `@cloudflare/vite-plugin` and Wrangler expose `DB` in local development via `miniflare` / Wrangler proxy.

#### Acceptance Criteria

- [ ] `wrangler.jsonc` contains the valid `d1_databases` binding for `DB`.
- [ ] Running `bun run dev` boots the dev server without configuration errors.
- [ ] TypeScript types cleanly resolve `D1Database` without requiring `any`.

---

### [MD-102] Define Drizzle Schema & Strict TypeScript Types for Matches and Highlights

- **Type:** Story
- **Estimation:** 3 SP
- **Priority:** Critical
- **Dependencies:** MD-101

#### User Story

> **As a** developer,  
> **I want** strongly-typed Drizzle ORM schemas representing matches and highlights,  
> **So that** all database queries are type-safe and adhere to the normalization spec.

#### Technical Specifications

1. Replace contents of `src/db/schema.ts` with:
   - `matches` table:
     - `id`: `text('id').primaryKey()` (Format: `YYYY-MM-DD_teama_teamb`)
     - `matchDate`: `text('match_date').notNull()` (Indexed)
     - `teamHome`: `text('team_home').notNull()`
     - `teamAway`: `text('team_away').notNull()`
     - `createdAt`: `integer('created_at', { mode: 'number' }).notNull()`
     - `updatedAt`: `integer('updated_at', { mode: 'number' }).notNull()`
   - `highlights` table:
     - `id`: `text('id').primaryKey()` (Reddit post ID, e.g. `t3_xxxx`)
     - `matchId`: `text('match_id').references(() => matches.id, { onDelete: 'cascade' })` (Indexed)
     - `title`: `text('title').notNull()`
     - `scoreHome`: `integer('score_home')`
     - `scoreAway`: `integer('score_away')`
     - `scorer`: `text('scorer')`
     - `minute`: `text('minute')` (e.g. `45+2'`)
     - `tag`: `text('tag')` (e.g. `Great Goal`, `Penalty`)
     - `embedUrl`: `text('embed_url')`
     - `sourceUrl`: `text('source_url').notNull()`
     - `redditUrl`: `text('reddit_url').notNull()`
     - `redditScore`: `integer('reddit_score').default(0)`
     - `postedAt`: `integer('posted_at', { mode: 'number' }).notNull()`
2. Add table indexes on `matches.matchDate` and `highlights.matchId`.
3. Configure `relations()` between `matches` and `highlights`.
4. Export infer types:
   ```typescript
   export type Match = typeof matches.$inferSelect;
   export type NewMatch = typeof matches.$inferInsert;
   export type Highlight = typeof highlights.$inferSelect;
   export type NewHighlight = typeof highlights.$inferInsert;
   ```

#### Acceptance Criteria

- [ ] `src/db/schema.ts` exports `matches`, `highlights`, relations, and TypeScript interfaces.
- [ ] Schema passes `tsc --noEmit` with `strict: true`.
- [ ] Delete cascade is properly configured for foreign key `matchId`.

---

### [MD-103] Drizzle Migrations & D1 Seeding Scripts

- **Type:** Story
- **Estimation:** 3 SP
- **Priority:** High
- **Dependencies:** MD-102

#### User Story

> **As a** developer,  
> **I want** automated migration generation and mock database seeding,  
> **So that** I can spin up an populated local database instantly for UI development.

#### Technical Specifications

1. Configure `drizzle.config.ts`:
   ```typescript
   import { defineConfig } from 'drizzle-kit';

   export default defineConfig({
     out: './migrations',
     schema: './src/db/schema.ts',
     dialect: 'sqlite',
   });
   ```
2. Run `bun run db:generate` to produce `migrations/0001_init.sql`.
3. Create `src/db/seed.ts` utilizing `@faker-js/faker`:
   - Seeds 3 match dates (e.g., today, yesterday, 2 days ago).
   - Seeds 3–5 matches per date with realistic names (e.g. "Arsenal vs Chelsea", "Real Madrid vs Barcelona").
   - Seeds 1–3 highlights per match with valid sample media URLs (`dubz.co`, `streamin.one`, `v.redd.it`).
4. Add npm script to `package.json`: `"db:seed": "tsx src/db/seed.ts"`.

#### Acceptance Criteria

- [ ] Initial migration SQL matches the database schema in Section 3 of the Tech Spec.
- [ ] Seed script executes idempotently (`INSERT OR REPLACE` / `ON CONFLICT`).
- [ ] Seeded data includes realistic minutes (`14'`, `45+1'`, `88'`), tags (`Great Goal`), and scores.
