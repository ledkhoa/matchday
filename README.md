# MatchDay ⚽

**MatchDay** is a high-performance daily soccer digest and video highlight aggregator built for the modern edge. It pairs official daily fixtures from top global football competitions with real-time crowd-sourced goal clips, presenting clean scorelines, club crests, localized kickoff times, and inline video playback in a spoiler-controlled feed.

---

## Features

- 📅 **Daily Fixture & Highlight Feed**: Browse daily fixtures by date with interactive previous/next navigation, quick "Today" jump, and a calendar date picker.
- ⏱️ **Client-Local Kickoff & Day Bucketing**: Group matches and display kickoff times in the viewer's local timezone (12-hour AM/PM format), ensuring evening games appear on the day they were played locally.
- 🏆 **15 Supported Competitions**: Premier League, EFL Championship, UEFA Champions League, UEFA Europa League, UEFA Conference League, La Liga, Serie A, Bundesliga, Ligue 1, Major League Soccer, FA Cup, League Cup, Copa del Rey, DFB-Pokal, and Coppa Italia.
- 🛡️ **Club Crests & League Branding**: High-resolution official logos and club crests with layout-shift-free containers and fallback avatar monograms.
- 🎯 **Client-Side League Filtering**: Filter daily feeds by competition with dynamic match counts and quick toggle pills.
- 🎬 **Inline Video Highlight Player**:
  - **Broadcast-Safe Layout**: Scorer, minute, tag, and close controls sit in a dedicated external header bar above the video, preventing collision with the broadcast TV scorecard bug.
  - **16:9 Responsive Player**: Seamless playback for Dubz, Streamff, Caulse, Streamin, and clean external fallback buttons for unsupported clip hosts.
  - **Unified Action Bar**: Balanced action pills linking directly to Reddit discussion threads and source media hosts.
- 👀 **Local Watch History & State Sync**:
  - Powered by **TanStack Store** (`@tanstack/react-store`).
  - Automatically records watched highlights, applies visual checkmark indicators and muted chip styling, and tracks whole-match completion.
  - Persists state to `localStorage` with Zod schema validation and synchronizes reactively across open browser tabs via storage events.
- ⚙️ **Durable Cloudflare Workflows**:
  - **Independent CPU Quotas**: Ingestion is split into discrete checkpointed steps, eliminating Cloudflare Workers `exceededCpu` limits.
  - **Active Match Window Gating**: Pre-checks match schedules to save monthly workflow execution quotas during non-game hours.
  - **Durable Retries**: Step-level exponential backoff isolates transient API or network failures without re-running completed steps.
- 🤖 **Intelligent Highlight Matching Engine**:
  - **Fuzzy Levenshtein & Alias Matching**: Resolves colloquial Reddit post titles (`"Chelsea [2] - 0 Spurs"`) to official canonical fixtures.
  - **Rival Collision Guards**: Prevents false-positive matches between local rivals (e.g. Manchester City vs. Manchester United, Real Madrid vs. Atletico Madrid).
  - **Non-Senior Squad Rejection**: Automatically excludes youth (U17–U23), reserve, and women's team clips from linking to senior first-team fixtures.
  - **Kickoff Time Window Validation**: Rejects posts submitted outside a 4-hour temporal window around fixture kickoff times.
  - **Fingerprint Deduplication**: SHA-256 goal fingerprinting prevents duplicate submissions of the same goal.

---

## Architecture & Tech Stack

```
                                ┌─────────────────────────────────────────┐
                                │           Cloudflare Workers            │
                                │        Edge Runtime (workerd)           │
                                └────────────────────┬────────────────────┘
                                                     │
                 ┌───────────────────────────────────┼───────────────────────────────────┐
                 │                                   │                                   │
                 ▼                                   ▼                                   ▼
      ┌─────────────────────┐             ┌─────────────────────┐             ┌─────────────────────┐
      │   TanStack Start    │             │ FixtureSyncWorkflow │             │HighlightIngestWorkf.│
      │  SSR + File Router  │             │ Cloudflare Workflow │             │ Cloudflare Workflow │
      │   TanStack Store    │             │ 6 Resilient Steps   │             │  3 Dedicated Steps  │
      └──────────┬──────────┘             └──────────┬──────────┘             └──────────┬──────────┘
                 │                                   │                                   │
                 ▼                                   ▼                                   ▼
      ┌─────────────────────────────────────────────────────────────────────────────────────────────┐
      │                                 Cloudflare D1 (SQLite)                                      │
      │                              Drizzle ORM Schema & Queries                                   │
      └─────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Framework**: [TanStack Start](https://tanstack.com/start) (`@tanstack/react-start`, `@tanstack/react-router`, `@tanstack/react-query`) with React 19.
- **Local State Management**: [TanStack Store](https://tanstack.com/store) (`@tanstack/react-store`) for reactive, client-side watch history persistence and multi-tab synchronization.
- **Runtime & Workflows**: [Cloudflare Workers](https://workers.cloudflare.com/) (Edge SSR, Cron Triggers, and [Cloudflare Workflows](https://developers.cloudflare.com/workflows/)) configured via `@cloudflare/vite-plugin` and `wrangler`.
- **Database & ORM**: Cloudflare D1 (Serverless SQLite) with [Drizzle ORM](https://orm.drizzle.team/).
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) (`@tailwindcss/vite`).
- **Icons & UI Primitives**: `lucide-react` & [shadcn/ui](https://ui.shadcn.com/).
- **Validation**: [Zod v4](https://zod.dev/).
- **Code Quality**: Custom [Oxlint](https://oxc.rs/) AST anti-slop rules, strict TypeScript (`tsc --noEmit`), and Prettier.

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (v1.2+)
- [Cloudflare Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

### 1. Installation

```bash
git clone https://github.com/your-username/matchday.git
cd matchday
bun install
```

### 2. Environment Variables

Create `.dev.vars` for local development:

```bash
cp .dev.vars.example .dev.vars
```

Add your API credentials:

```ini
API_FOOTBALL_KEY=your_api_sports_key_here
CRON_SECRET=dev_secret
```

### 3. Database Setup

You can populate your local Cloudflare D1 SQLite database using either real production data or synthetic seed data:

#### Option A: Clone Real Data from Remote Production (Recommended)

Mirror the real matches, scores, and video clips from your hosted remote D1 database into your local environment in a single step:

```bash
bun run db:pull-remote
```

This runs `wrangler d1 export` for matches and highlights, applies all local migrations, and imports the records into your local Miniflare SQLite database.

#### Option B: Fresh Local Database & Seed Data

Initialize clean tables and load mock matches and highlights:

```bash
bun run db:migrate:local
bun run db:seed
```

#### Database Mode (Local vs. Remote)

In `wrangler.jsonc`:

- **Local Mode (Default)**: Omit `"remote": true` inside the `d1_databases` block. The local dev server (`bun run dev`) and CLI scripts connect to the local SQLite database at `.wrangler/state/v3/d1`.
- **Remote Mode**: Add `"remote": true` inside `d1_databases` to proxy local requests directly to your hosted Cloudflare D1 database.

### 4. Syncing Real Fixtures & Highlights Locally

To test real match results and score updates locally without seed data:

```bash
# Sync official fixtures and final scores for a specific date (e.g., today or yesterday)
bun run db:sync-fixtures 2026-09-10

# Ingest latest goal highlights from Reddit r/soccer
bun run db:ingest
```

### 5. Running Locally

Start the Vite development server with Cloudflare Workers emulation:

```bash
bun run dev
```

The application will be available at `http://localhost:3000`.

---

## Background Services & Durable Workflows

MatchDay leverages [Cloudflare Workflows](https://developers.cloudflare.com/workflows/) for automated background operations, providing automatic retries, independent CPU quotas per step, state checkpointing, and graceful fallbacks:

### 1. Daily Midnight Fixture Sync (`FixtureSyncWorkflow`)

- **Schedule**: Daily at midnight UTC (`0 0 * * *`).
- **Steps**:
  1. `fetch-today-fixtures`: Queries API-Sports for today's fixtures across 15 competitions.
  2. `persist-today-fixtures`: Upserts fixture records and teams in D1.
  3. `cooldown-step`: Implements a 1-second pause to respect upstream API-Sports rate limits.
  4. `fetch-yesterday-fixtures`: Queries yesterday's completed matches for final scorelines.
  5. `persist-yesterday-fixtures`: Updates final scores and statuses in D1.
  6. `reconcile-yesterday-highlights`: Identifies finished matches with goals lacking highlight clips.
- **Manual Trigger**:
  ```bash
  curl -X POST http://localhost:3000/api/fixtures \
    -H "Authorization: Bearer dev_secret" \
    -H "Content-Type: application/json" \
    -d '{"date":"2026-09-10","mode":"workflow"}'
  ```

### 2. 5-Minute Highlight Ingestion (`HighlightIngestWorkflow`)

- **Schedule**: Every 5 minutes (`*/5 * * * *`).
- **Steps**:
  1. `fetch-reddit-highlights`: Fetches and parses `r/soccer` new submissions via Reddit Atom RSS.
  2. `match-and-prepare-highlights`: Queries candidate fixtures from D1, resolves teams via fuzzy matching, and deduplicates identical clips.
  3. `persist-highlights-batch`: Persists highlight batches to D1 in chunks of 50 and updates match scorelines.
- **Quota & CPU Protection**:
  - Evaluates `hasActiveMatchWindow` before triggering to avoid redundant workflow runs during off-hours.
  - Each step runs in an isolated execution context with a dedicated 10ms CPU quota, eliminating Worker `exceededCpu` crashes.
  - Deterministic 5-minute bucketed instance IDs prevent overlapping concurrent executions.
- **Manual Trigger**:
  ```bash
  curl -X POST http://localhost:3000/api/cron \
    -H "Authorization: Bearer dev_secret" \
    -H "Content-Type: application/json" \
    -d '{"mode":"workflow","force":true}'
  ```

---

## Verification & Testing

Execute test suites and static analysis checks:

```bash
# Run 360+ automated unit & workflow tests
bun test src

# Run typecheck, oxlint anti-slop rules, and prettier check
bun run check

# Auto-format codebase
bun run format
```

---

## License

MIT License.
