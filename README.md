# MatchDay ⚽

**MatchDay** is a high-performance daily soccer digest and video highlight aggregator built for the modern edge. It pairs official daily fixtures from top global football competitions with real-time crowd-sourced goal clips, presenting clean scorelines, club crests, localized kickoff times, and inline video playback in a spoiler-controlled feed.

---

## Features

- 📅 **Daily Fixture & Highlight Feed**: Browse daily fixtures by date with interactive previous/next navigation, quick "Today" jump, and a calendar date picker.
- ⏱️ **Client-Local Kickoff & Day Bucketing**: Group matches and display kickoff times in the viewer's local timezone (12-hour AM/PM format), ensuring evening games appear on the day they were played locally.
- 🏆 **14 Supported Competitions**: Premier League, UEFA Champions League, UEFA Europa League, La Liga, Serie A, Bundesliga, Ligue 1, Major League Soccer, Eredivisie, Liga Portugal, FA Cup, EFL Cup, Copa del Rey, and DFB-Pokal.
- 🛡️ **Club Crests & League Branding**: High-resolution official logos and club crests with layout-shift-free containers and fallback avatar monograms.
- 🎯 **Client-Side League Filtering**: Filter daily feeds by competition with dynamic match counts and quick toggle pills.
- 🎬 **Inline Video Highlight Player**: Expand and play goal clips directly inside match cards in responsive 16:9 containers (supporting Dubz, Streamff, Caulse, Streamin, and resilient external fallbacks).
- 🤖 **Intelligent Highlight Matching Engine**:
  - **Fuzzy Levenshtein & Alias Matching**: Resolves colloquial Reddit post titles (`"Chelsea [2] - 0 Spurs"`) to official canonical fixtures.
  - **Rival Collision Guards**: Prevents false-positive matches between local rivals (e.g. Manchester City vs. Manchester United, Real Madrid vs. Atletico Madrid).
  - **Non-Senior Squad Rejection**: Automatically excludes youth (U17–U23), reserve, and women's team clips from linking to senior first-team fixtures.
  - **Kickoff Time Window Validation**: Rejects posts submitted outside a 4-hour temporal window around the fixture kickoff time.
  - **Fingerprint Deduplication**: SHA-256 goal fingerprinting prevents duplicate submissions of the same goal.

---

## Architecture & Tech Stack

```
                               ┌─────────────────────────────────────────┐
                               │           Cloudflare Workers            │
                               │        Edge Runtime (workerd)           │
                               └────────────────────┬────────────────────┘
                                                    │
                 ┌──────────────────────────────────┼──────────────────────────────────┐
                 │                                  │                                  │
                 ▼                                  ▼                                  ▼
      ┌─────────────────────┐            ┌─────────────────────┐            ┌─────────────────────┐
      │   TanStack Start    │            │  Daily Fixture Sync │            │ 5-Min Reddit Ingest │
      │  SSR + File Router  │            │     API-Sports      │            │   r/soccer Atom RSS │
      └──────────┬──────────┘            └──────────┬──────────┘            └──────────┬──────────┘
                 │                                  │                                  │
                 ▼                                  ▼                                  ▼
      ┌───────────────────────────────────────────────────────────────────────────────────────────┐
      │                                Cloudflare D1 (SQLite)                                     │
      │                             Drizzle ORM Schema & Queries                                  │
      └───────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Framework**: [TanStack Start](https://tanstack.com/start) (`@tanstack/react-start`, `@tanstack/react-router`, `@tanstack/react-query`) with React 19.
- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com/) (Edge SSR + Scheduled Cron Triggers) configured via `@cloudflare/vite-plugin` and `wrangler`.
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

Apply local D1 migrations and seed initial data:

```bash
bun run db:migrate:local
bun run db:seed
```

### 4. Running Locally

Start the Vite development server with Cloudflare Workers emulation:

```bash
bun run dev
```

The application will be available at `http://localhost:3000`.

---

## Background Services & Ingestion

MatchDay relies on two automated ingestion pipelines running via Cloudflare Workers Cron Triggers:

1. **Daily Fixture Sync (`0 0 * * *`)**:
   - Queries API-Sports v3 for matches across the 14 supported leagues.
   - Upserts fixture metadata, club crests, competition logos, and kickoff timestamps into Cloudflare D1.
   - Manual trigger:
     ```bash
     curl -X POST http://localhost:3000/api/fixtures \
       -H "Authorization: Bearer dev_secret" \
       -H "Content-Type: application/json" \
       -d '{"date":"2026-09-10"}'
     ```

2. **5-Minute Highlight Ingestion (`*/5 * * * *`)**:
   - Polls `r/soccer` new submissions via Reddit Atom RSS.
   - Parses goal titles, match scores, scorers, and media URLs.
   - Matches submissions to active fixtures and persists new clips to D1.
   - Manual trigger:
     ```bash
     curl -X POST http://localhost:3000/api/cron \
       -H "Authorization: Bearer dev_secret"
     ```

---

## Verification & Testing

Execute test suites and static analysis checks:

```bash
# Run 270+ automated tests
bun test src

# Run typecheck, oxlint anti-slop rules, and prettier check
bun run check

# Auto-format codebase
bun run format
```

---

## License

MIT License.
