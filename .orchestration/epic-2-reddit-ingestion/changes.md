# Epic 2: Reddit Ingestion Engine - Summary of Changes

## 1. Overview

Implemented the complete Reddit soccer highlights ingestion pipeline for MatchDay according to the technical specification in [spec.md](file:///Users/khoa/Documents/matchday/.orchestration/epic-2-reddit-ingestion/spec.md).

The pipeline extracts structured match events and scores from `r/soccer` posts, normalizes media URLs to embeddable formats, authenticates with Reddit via OAuth with fallback to public JSON, and idempotently persists data into Cloudflare D1 via Drizzle ORM.

---

## 2. User Stories Implemented

### [MD-201] Reddit Title Regex Parser & Deterministic Match ID

- **File**: [`src/lib/parser.ts`](file:///Users/khoa/Documents/matchday/src/lib/parser.ts)
- **Unit Tests**: [`src/lib/parser.test.ts`](file:///Users/khoa/Documents/matchday/src/lib/parser.test.ts)
- **Key Features**:
  - `parseRedditTitle`: Parses standard score lines, home/away brackets (`[1] - 0`, `1 - [1]`, `[2] - [1]`), and unbracketed scores (`1 - 0`).
  - Extracts stoppage time minutes (`45+1'`, `90+4'`) and parenthesized tags both trailing (`(Great Goal)`, `(Penalty)`) and preceding the minute (`Saka (P) 22'`).
  - Discards non-goal submissions (`Match Thread`, `Post Match Thread`, transfer news, journalist quotes) returning `null`.
  - `generateMatchId`: Produces deterministic, collision-free match IDs (`YYYY-MM-DD_hometeam_awayteam`) that are invariant to the argument order of `teamA` and `teamB`.

### [MD-202] Supported Video Domain Embed Resolver

- **File**: [`src/lib/video.ts`](file:///Users/khoa/Documents/matchday/src/lib/video.ts)
- **Unit Tests**: [`src/lib/video.test.ts`](file:///Users/khoa/Documents/matchday/src/lib/video.test.ts)
- **Key Features**:
  - `resolveVideoEmbed`: Transforms clip links into 16:9 iframe embeds or direct video players:
    - `dubz.co` / `dubz.link` -> `https://dubz.co/e/{id}` (`isIframe: true`)
    - `streamin.one` / `streamin.me` -> `https://streamin.one/e/{id}` (`isIframe: true`)
    - `streamff.com` -> `https://streamff.com/e/{id}` (`isIframe: true`)
    - `caulse.com` -> `https://caulse.com/e/{id}` (`isIframe: true`)
    - `v.redd.it` -> `https://v.redd.it/{id}/DASH_720.mp4` (`isIframe: false`, direct video)
  - Returns graceful fallback with `embedUrl: null` for unsupported hosts (e.g. Twitter/X) or empty strings.

### [MD-203] Dual-Mode Reddit Client with Rate Limiting

- **File**: [`src/server/reddit.ts`](file:///Users/khoa/Documents/matchday/src/server/reddit.ts)
- **Unit Tests**: [`src/server/reddit.test.ts`](file:///Users/khoa/Documents/matchday/src/server/reddit.test.ts)
- **Key Features**:
  - Dual-mode operation:
    - OAuth mode when `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` are provided (endpoint: `https://oauth.reddit.com/r/soccer/new?limit=100`).
    - In-memory access token cache (`inMemoryTokenCache`) with automatic expiration tracking.
    - Graceful fallback to public feed `https://www.reddit.com/r/soccer/new.json?limit=100` with customizable `User-Agent`.
  - Rate limiting handling: Returns empty array and logs backoff warning upon receiving HTTP 429.
  - Zod v4 validation using `z.url()` on `RedditPostDataSchema` and `RedditListingResponseSchema`.
  - Post filtering: Filters out self-posts, stickied threads, and non-highlight/non-goal posts.

### [MD-204] Scraper Persistence Service & Conflict Deduplication

- **File**: [`src/server/ingest.ts`](file:///Users/khoa/Documents/matchday/src/server/ingest.ts)
- **Unit Tests**: [`src/server/ingest.test.ts`](file:///Users/khoa/Documents/matchday/src/server/ingest.test.ts)
- **Typings**: [`src/types/env.d.ts`](file:///Users/khoa/Documents/matchday/src/types/env.d.ts)
- **Key Features**:
  - `ingestRedditHighlights`: End-to-end orchestration of fetching, parsing, media resolution, and persistence.
  - Match upsert: `INSERT OR IGNORE` preserving initial creation metadata.
  - Highlight upsert: `ON CONFLICT(id) DO UPDATE SET reddit_score = excluded.reddit_score, embed_url = coalesce(excluded.embed_url, highlights.embed_url)`.
  - Touches `updatedAt` on all affected matches.
  - Batched statement execution in chunks of 30 statements to respect Cloudflare D1 RPC payload thresholds.
  - Added optional `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` to ambient `CloudflareEnv` and `NodeJS.ProcessEnv`.

---

## 3. Configuration & Package Changes

- **[`package.json`](file:///Users/khoa/Documents/matchday/package.json)**: Added `"test": "bun test src"` script and `@types/bun` dev dependency.
- **[`tsconfig.json`](file:///Users/khoa/Documents/matchday/tsconfig.json)**: Added `"bun"` to the `types` array for strict type-checking of `bun:test` imports.

---

## 4. Verification & Quality Gates

All checks succeeded cleanly:

- `bun test src`: 32 pass across 4 test suites (parser, video, reddit, ingest).
- `bun run typecheck`: 0 TypeScript compiler errors (`tsc --noEmit`).
- `bun run lint`: 0 Oxlint anti-slop violations.
- `bun run format`: All files conform to Prettier formatting rules.
- Strict adherence to `agents.md`: Zero `any` types, no git commits executed.
