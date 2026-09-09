# Code Review: Epic 2 — Reddit Ingestion Pipeline & Parsing Engine

- **Epic Key:** `MD-EPIC-2`
- **Reviewer:** Principal Software Architect & Senior Code Reviewer
- **Date:** 2026-09-09
- **Target File:** `.orchestration/epic-2-reddit-ingestion/review.md`
- **Verdict:** **APPROVED (Production Ready)**

---

## 1. Executive Summary & Final Verdict

A rigorous code review was performed on the deliverables for **MD-EPIC-2 (Reddit Ingestion Pipeline & Parsing Engine)**, evaluating all changes across `src/lib/`, `src/server/`, `src/types/`, `package.json`, and `tsconfig.json` against technical specification [spec.md](file:///Users/khoa/Documents/matchday/.orchestration/epic-2-reddit-ingestion/spec.md) and global development guidelines [agents.md](file:///Users/khoa/Documents/matchday/agents.md).

### Verdict: **APPROVED**

The implementation is **clean, robust, idiomatic, and strictly typed**. All acceptance criteria across user stories MD-201, MD-202, MD-203, and MD-204 are 100% satisfied. Static analysis, strict TypeScript compilation, formatting verification, and Bun test execution pass with zero errors, zero warnings, and zero `any` types.

---

## 2. Review Scope & Changed Files

| File Path                                                                                      | Type       | Responsibility                                                                                                 |
| :--------------------------------------------------------------------------------------------- | :--------- | :------------------------------------------------------------------------------------------------------------- |
| [`src/lib/parser.ts`](file:///Users/khoa/Documents/matchday/src/lib/parser.ts)                 | New Source | Title regex parsing, goal metadata extraction, deterministic match ID synthesis                                |
| [`src/lib/parser.test.ts`](file:///Users/khoa/Documents/matchday/src/lib/parser.test.ts)       | New Test   | 20 unit tests covering syntax varieties, stoppage time, tags, rejection rules, and match ID invariance         |
| [`src/lib/video.ts`](file:///Users/khoa/Documents/matchday/src/lib/video.ts)                   | New Source | Media domain resolution table for 5 clip hosts and direct video player                                         |
| [`src/lib/video.test.ts`](file:///Users/khoa/Documents/matchday/src/lib/video.test.ts)         | New Test   | 13 unit tests verifying embed transformations, query/hash preservation, and fallbacks                          |
| [`src/server/reddit.ts`](file:///Users/khoa/Documents/matchday/src/server/reddit.ts)           | New Source | Dual-mode Reddit client (OAuth 2.0 Client Credentials with public JSON fallback), token caching, rate limiting |
| [`src/server/reddit.test.ts`](file:///Users/khoa/Documents/matchday/src/server/reddit.test.ts) | New Test   | 11 unit tests for Zod v4 schemas, HTTP 429 backoff, OAuth token requests, and post filtering                   |
| [`src/server/ingest.ts`](file:///Users/khoa/Documents/matchday/src/server/ingest.ts)           | New Source | Ingestion orchestration, deduplication, D1 batch upserts (`CHUNK_SIZE = 30`), match touch updates              |
| [`src/server/ingest.test.ts`](file:///Users/khoa/Documents/matchday/src/server/ingest.test.ts) | New Test   | 6 unit tests with mock D1 database validating batch execution, chunking, deduplication, and error recovery     |
| [`src/types/env.d.ts`](file:///Users/khoa/Documents/matchday/src/types/env.d.ts)               | Modified   | Ambient environment typings for `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, and `REDDIT_USER_AGENT`            |
| [`package.json`](file:///Users/khoa/Documents/matchday/package.json)                           | Modified   | Added `"test": "bun test src"` script and `@types/bun` dev dependency                                          |
| [`tsconfig.json`](file:///Users/khoa/Documents/matchday/tsconfig.json)                         | Modified   | Added `"bun"` to compiler options `types` array                                                                |

---

## 3. Specification & Architectural Compliance Matrix

### 3.1 MD-201: Title Regex Parser & Deterministic Match ID (`src/lib/parser.ts`)

- [x] **Title Grammar Coverage**: Correctly captures:
  - Home bracket: `Arsenal [1] - 0 Chelsea`
  - Away bracket: `Arsenal 1 - [1] Chelsea`
  - Both brackets: `Arsenal [2] - [1] Chelsea`
  - Unbracketed: `Arsenal 1 - 0 Chelsea`
  - En-dash (`–`) and em-dash (`—`) separators
- [x] **Minute Parsing**: Extracts standard minutes (`45'`), stoppage time (`45+1'`, `90+4'`), extra time (`120+1'`), unquoted numbers (`45+2`, `45`), and unicode prime characters (`90′`).
- [x] **Tag Extraction**: Accurately extracts trailing tags like `(Great Goal)`, `(Penalty)`, `(OG)`, and inline tags positioned before the minute (e.g., `Saka (P) 22'`).
- [x] **Non-Goal Discarding**: `META_THREAD_PREFIX_REGEX` proactively rejects `Match Thread:`, `Post Match Thread:`, `[Post-Match Thread]`, `Pre-Match Thread`, `Daily Discussion`, and transfer/journalist updates (`[Fabrizio Romano] ...`), returning `null`.
- [x] **Deterministic Match ID**: `generateMatchId(dateStr, teamA, teamB)` strips special characters, normalizes to lowercase alphanumeric slugs, and sorts teams alphabetically. Guarantees symmetry:
      `generateMatchId(d, "Arsenal", "Chelsea") === generateMatchId(d, "Chelsea", "Arsenal")`.

### 3.2 MD-202: Supported Video Domain Embed Resolver (`src/lib/video.ts`)

- [x] **Extensible Resolver Table**: Uses a structured `HOST_RESOLVERS` table enabling zero-touch extensibility for future host migrations.
- [x] **Domain Mappings**:
  - `dubz.co` / `dubz.link` (`/c/`, `/v/`, `/e/`) $\rightarrow$ `https://dubz.co/e/{id}` (`isIframe: true`)
  - `streamin.one` / `streamin.me` (`/v/`, `/e/`) $\rightarrow$ `https://streamin.one/e/{id}` (`isIframe: true`)
  - `streamff.com` (`/v/`, `/e/`) $\rightarrow$ `https://streamff.com/e/{id}` (`isIframe: true`)
  - `caulse.com` (`/v/`, `/e/`) $\rightarrow$ `https://caulse.com/e/{id}` (`isIframe: true`)
  - `v.redd.it` $\rightarrow$ `https://v.redd.it/{id}/DASH_720.mp4` (`isIframe: false`, direct video)
- [x] **Graceful Degradation**: Unsupported hosts (Twitter/X, Streamable, YouTube) return `embedUrl: null` with `fallbackUrl` pointing to the original clip, ensuring the UI can render external fallback buttons without crash.

### 3.3 MD-203: Dual-Mode Reddit Client with Rate Limiting (`src/server/reddit.ts`)

- [x] **Dual-Mode Operation**:
  - Automatically switches between authenticated OAuth mode (`https://oauth.reddit.com/r/soccer/new?limit=100`) and unauthenticated public JSON mode (`https://www.reddit.com/r/soccer/new.json?limit=100`) based on the presence of `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET`.
- [x] **In-Memory Token Cache**: Caches OAuth access tokens with expiration checking (`expiresAt > now + 60_000`), maintaining a 60-second safety window before requesting token refresh.
- [x] **Rate Limit Backoff**: Handles HTTP 429 status codes by reading `x-ratelimit-reset`, issuing structured warning logs, and returning an empty list (`[]`) without crashing the Worker runtime.
- [x] **Zod v4 Validation**: Validates payloads with `RedditListingResponseSchema` and `RedditPostDataSchema` using modern top-level `z.url()` schema.
- [x] **Filtering Pipeline**: Filters out `is_self: true` and `stickied: true` posts. Retains candidate posts if they possess "Media" / "Highlight" link flair OR if their title satisfies `parseRedditTitle()`.

### 3.4 MD-204: Scraper Persistence Service & Conflict Deduplication (`src/server/ingest.ts`)

- [x] **Idempotent Ingestion**:
  - Matches persisted via `INSERT OR IGNORE` (`onConflictDoNothing()`), preserving original creation timestamps.
  - Highlights upserted via `ON CONFLICT(id) DO UPDATE SET reddit_score = excluded.reddit_score, embed_url = coalesce(excluded.embed_url, highlights.embed_url)`.
  - Affected matches receive `updated_at = Date.now()`.
- [x] **Cloudflare D1 Batch RPC Chunking**: Groups all SQL operations and executes them in chunks of 30 statements (`CHUNK_SIZE = 30`), respecting Cloudflare D1 RPC payload ceilings and avoiding request timeouts.
- [x] **Epoch Milliseconds**: Timestamp alignment ensures `posted_at` stores millisecond precision (`Math.floor(post.createdUtc * 1000)`).
- [x] **Telemetry & Error Containment**: Returns comprehensive `IngestResult` metrics (`totalFetched`, `parsedCount`, `persistedCount`, `skippedCount`, `errors`).

---

## 4. Code Quality & Architectural Standards Audit

### 4.1 Strict TypeScript & Zero `any` Types

- **Zero `any` Types**: Audited across all new files. Inferred Drizzle schema types (`schema.NewMatch`, `schema.NewHighlight`), Zod inferred types (`RawRedditPost`), and explicitly declared interfaces (`ParsedTitle`, `ResolvedMedia`, `IngestResult`, `RedditClientConfig`) are used exclusively.
- **Zero `@ts-ignore` Directives**: Audited codebase for suppression comments; none exist in source code.
- **Type Assertion Safety**: The single type assertion in `src/server/ingest.ts` for non-empty tuple batch statements includes the required anti-slop comment:
  ```typescript
  // SAFETY: chunk length is verified > 0 so non-empty tuple assertion satisfies D1 batch contract
  await db.batch(chunk as [SQLiteBatchItem, ...SQLiteBatchItem[]]);
  ```

### 4.2 Oxlint Anti-Slop Rule Compliance

- `anti-slop/no-module-mocking`: Tests avoid runtime module mocking libraries (`mock.module`). Dependency injection and clean mock class implementations (`TestD1Database implements D1Database`, `createMockFetch`) are used.
- `anti-slop/no-object-parameters`: All function signatures accept named, structured interfaces (`RedditClientConfig`, `D1Database`).
- `anti-slop/no-chained-type-assertions`: No multi-level casts (`as unknown as ...`).
- Modern Zod schema: Complies strictly with the `agents.md` rule: `z.url()` is used instead of deprecated `z.string().url()`.

### 4.3 Clean Code & Dead Code Inspection

- No orphaned files, unused variables, or leftover debug `console.log` statements.
- Comment philosophy strictly adheres to explaining the **WHY** (e.g. D1 batch limits, token cache safety windows, regex capture mechanics) rather than the obvious WHAT or HOW.
- Git commit discipline: Zero automated commits performed.

---

## 5. Quality Gates & Test Execution Summary

Automated test execution and static analysis results:

```bash
$ bun run check && bun test src
$ tsc --noEmit && oxlint . && prettier . --check
Checking formatting...
All matched files use Prettier code style!
bun test v1.3.9 (cf6cdbbb)

src/server/ingest.test.ts:
(pass) ingestRedditHighlights > orchestrates ingestion, parsing, batching, and persistence
(pass) ingestRedditHighlights > splits statements into chunks of 30 for D1 batch execution
(pass) ingestRedditHighlights > handles D1 batch errors gracefully without throwing
(pass) ingestRedditHighlights > returns early when all posts fail regex parsing
(pass) ingestRedditHighlights > returns early when no highlights are fetched
(pass) ingestRedditHighlights > captures fetch errors gracefully

src/server/reddit.test.ts:
(pass) Reddit Schemas > validates a valid Reddit post item with z.url()
(pass) Reddit Schemas > rejects invalid URL structures
(pass) Reddit Schemas > validates a complete Reddit Listing response payload
(pass) fetchRedditPosts > returns empty array when rate limited (429)
(pass) fetchRedditPosts > filters out self-posts, stickied posts, and non-goal/non-media posts
(pass) fetchRedditPosts > authenticates via OAuth when client credentials are provided
(pass) fetchRedditPosts > uses custom user agent when configured
(pass) fetchRedditPosts > handles 429 rate limit without x-ratelimit-reset header
(pass) fetchRedditPosts > handles HTTP error responses (500, 503) gracefully
(pass) fetchRedditPosts > handles malformed JSON or schema mismatches gracefully
(pass) fetchRedditPosts > includes posts with Highlight flair even if title is non-standard

src/lib/video.test.ts:
(pass) resolveVideoEmbed > resolves dubz.co clip to iframe embed
(pass) resolveVideoEmbed > resolves dubz.link clip to dubz.co iframe embed
(pass) resolveVideoEmbed > resolves streamin.one clip to iframe embed
(pass) resolveVideoEmbed > resolves streamin.me clip to streamin.one iframe embed
(pass) resolveVideoEmbed > resolves streamff.com clip to iframe embed
(pass) resolveVideoEmbed > resolves caulse.com clip to iframe embed
(pass) resolveVideoEmbed > resolves v.redd.it clip to direct video player format
(pass) resolveVideoEmbed > falls back cleanly for unsupported domains
(pass) resolveVideoEmbed > handles empty or whitespace-only strings gracefully
(pass) resolveVideoEmbed > handles query parameters and hash fragments on supported hosts
(pass) resolveVideoEmbed > handles case-insensitive domains
(pass) resolveVideoEmbed > falls back cleanly when domain matches but ID is missing
(pass) resolveVideoEmbed > handles additional unsupported video hosting domains

src/lib/parser.test.ts:
(pass) parseRedditTitle > parses standard title with home score bracket
(pass) parseRedditTitle > parses away bracketed score and stoppage time minute
(pass) parseRedditTitle > parses both brackets on scores
(pass) parseRedditTitle > parses unbracketed scores
(pass) parseRedditTitle > parses stoppage time minutes like 90+4'
(pass) parseRedditTitle > extracts trailing parenthesized tag like (Great Goal)
(pass) parseRedditTitle > extracts trailing penalty tag
(pass) parseRedditTitle > extracts tag positioned before minute like Saka (P) 22'
(pass) parseRedditTitle > handles en-dash and em-dash separators
(pass) parseRedditTitle > rejects match threads
(pass) parseRedditTitle > rejects post-match threads
(pass) parseRedditTitle > rejects journalist quotes and transfer news
(pass) parseRedditTitle > handles unicode prime in minute
(pass) parseRedditTitle > handles stoppage time and minutes without quotes
(pass) parseRedditTitle > handles team names with numbers and hyphenated player names
(pass) parseRedditTitle > extracts own goal tags (OG)
(pass) parseRedditTitle > rejects malformed scores and non-numeric score patterns
(pass) generateMatchId > produces identical match ID regardless of team argument order
(pass) generateMatchId > normalizes special characters and accents
(pass) generateMatchId > normalizes hyphens, ampersands, and extra spaces in team names

50 pass, 0 fail, 99 expect() calls [60.00ms]
```

---

## 6. Recommendations for Downstream Epics

1. **MD-EPIC-3 (Scheduled Cron Ingestion & Worker Integration)**:
   - Wire `ingestRedditHighlights` directly into the Cloudflare Worker `scheduled(event, env, ctx)` handler and `/api/cron` route.
   - Pass `env.DB` and `{ clientId: env.REDDIT_CLIENT_ID, clientSecret: env.REDDIT_CLIENT_SECRET, userAgent: env.REDDIT_USER_AGENT }` as configuration.
2. **MD-EPIC-5 & MD-EPIC-6 (Highlight Display & Video Player UI)**:
   - When rendering the video player, leverage `highlight.embedUrl`. If `embedUrl` is null, use `highlight.sourceUrl` or `highlight.redditUrl` to render an external link button with `target="_blank" rel="noopener noreferrer"`.
   - Wrap player elements in Tailwind `aspect-video w-full` containers to preserve 16:9 responsive scaling.

---

## 7. Sign-off

- **Architecture Review:** APPROVED
- **Type Safety & Static Analysis:** APPROVED
- **Unit Test Coverage & Quality:** APPROVED
- **Readiness for Next Sprint / Epic 3:** READY
