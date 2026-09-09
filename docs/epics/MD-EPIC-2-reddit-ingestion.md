# MD-EPIC-2: Reddit Ingestion Pipeline & Parsing Engine

- **Key:** `MD-EPIC-2`
- **Status:** To Do
- **Target Sprint:** Sprint 1
- **Total Points:** 13 SP
- **Lead / Assignee:** TBD

---

## 🎯 Epic Overview

Build the ingestion engine that scrapes `r/soccer` via Reddit's JSON feed, parses unstructured goal post titles into structured match data, resolves video embedding URLs from popular clip hosts, and commits records idempotently to Cloudflare D1.

---

## 🎫 User Stories

### [MD-201] Implement Regex Parser for Goal Titles & Deterministic Match ID

- **Type:** Story
- **Estimation:** 3 SP
- **Priority:** Critical
- **Dependencies:** None

#### User Story

> **As a** system,  
> **I want** to parse Reddit soccer post titles into structured teams, scores, scorers, minutes, and tags,  
> **So that** unstructured thread titles are cleanly indexed into matches and goals.

#### Technical Specifications

1. Implement `src/lib/parser.ts`:
   ```typescript
   export interface ParsedTitle {
     teamHome: string;
     teamAway: string;
     scoreHome: number | null;
     scoreAway: number | null;
     scorer: string | null;
     minute: string | null;
     tag: string | null;
   }

   export function parseRedditTitle(title: string): ParsedTitle | null {
     const cleanTitle = title.trim();
     const matchRegex =
       /^(.+?)\s*\[?(\d+)\]?\s*-\s*\[?(\d+)\]?\s*(.+?)(?:\s*-\s*(.*))?$/i;
     const match = cleanTitle.match(matchRegex);

     if (!match) return null;

     const teamHome = match[1].trim();
     const scoreHome = parseInt(match[2], 10);
     const scoreAway = parseInt(match[3], 10);

     const remainder = match[4].trim();
     let details = match[5]?.trim() || '';

     const teamAway = remainder;
     let scorer: string | null = null;
     let minute: string | null = null;
     let tag: string | null = null;

     const tagMatch = details.match(/\((.*?)\)$/);
     if (tagMatch) {
       tag = tagMatch[1];
       details = details.replace(/\s*\(.*?\)$/, '').trim();
     }

     const minuteMatch = details.match(/(\d+['\+]*)$/);
     if (minuteMatch) {
       minute = minuteMatch[1];
       scorer = details.replace(/(\d+['\+]*)$/, '').trim() || null;
     } else if (details) {
       scorer = details;
     }

     return { teamHome, teamAway, scoreHome, scoreAway, scorer, minute, tag };
   }

   export function generateMatchId(
     dateStr: string,
     home: string,
     away: string,
   ): string {
     const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
     const sortedTeams = [norm(home), norm(away)].sort().join('_');
     return `${dateStr}_${sortedTeams}`;
   }
   ```
2. Handle edge cases:
   - Stoppage time minutes: `45+2'`, `90+6'`
   - Parenthesized tags: `(Great Goal)`, `(Penalty)`, `(P)`
   - Bracket variations: `Arsenal [1] - 0 Chelsea`, `Arsenal 1 - [1] Chelsea`

#### Acceptance Criteria

- [ ] Returns structured object with all fields parsed for valid highlight titles.
- [ ] Returns `null` when a title does not match score/goal syntax (e.g., quotes, news, post-match threads).
- [ ] `generateMatchId` produces identical hash regardless of team order (`home` vs `away`).

---

### [MD-202] Supported Video Domain Embed Resolver

- **Type:** Story
- **Estimation:** 3 SP
- **Priority:** High
- **Dependencies:** None

#### User Story

> **As a** system,  
> **I want** to resolve raw video URLs from Reddit posts into embeddable iframe or video streams,  
> **So that** users can watch highlights directly in the app without being redirected.

#### Technical Specifications

1. Implement `src/lib/video.ts`:
   - Supported domains:
     - `dubz.co` / `dubz.link` -> `https://dubz.co/e/<id>`
     - `streamin.one` / `streamin.me` -> `https://streamin.one/e/<id>`
     - `streamff.com` -> `https://streamff.com/e/<id>`
     - `caulse.com` -> `https://caulse.com/e/<id>`
     - `v.redd.it` -> Reddit DASH/HLS or direct video link fallback
   - Output interface:
     ```typescript
     export interface ResolvedMedia {
       embedUrl: string | null;
       isIframe: boolean;
       directVideoUrl: string | null;
       fallbackUrl: string;
     }
     ```
2. For unapproved/unsupported domains, safely return `embedUrl: null` and provide `fallbackUrl: sourceUrl`.

#### Acceptance Criteria

- [ ] Dubz, Streamin, Streamff, and Caulse links resolve to their responsive embed targets.
- [ ] Unsupported third-party domains cleanly flag `embedUrl: null` without throwing runtime errors.

---

### [MD-203] Reddit JSON Feed Fetcher with Rate Limiting & User-Agent

- **Type:** Story
- **Estimation:** 3 SP
- **Priority:** High
- **Dependencies:** MD-201, MD-202

#### User Story

> **As a** scraper service,  
> **I want** to fetch new submissions from `r/soccer` with appropriate headers and filtering,  
> **So that** only relevant highlight clips are retrieved without violating Reddit API policies.

#### Technical Specifications

1. Implement `src/server/reddit.ts`:
   - Endpoint: `https://www.reddit.com/r/soccer/new.json?limit=100`
   - Request Headers:
     ```typescript
     headers: {
       'User-Agent': process.env.REDDIT_USER_AGENT || 'web:matchday-bot:v1.0.0 (by /u/matchday_app)'
     }
     ```
2. Zod schema validation for Reddit listing response:
   - Validate post ID (`t3_...`), title, permalink, domain, score, url, `created_utc`, `link_flair_text`.
3. Filter pipeline:
   - Skip self posts (`is_self: true` without media).
   - Require flair matching `Media` or `Highlight`, OR title matching score regex from `MD-201`.
   - Ensure external URL belongs to allowed video hosts or media domains.

#### Acceptance Criteria

- [ ] Reddit submissions are validated against strict Zod types.
- [ ] Handles HTTP 429 rate limit responses gracefully with logging and backoff.
- [ ] Returns a sanitized array of highlight candidate posts.

---

### [MD-204] Scraper Persistence Service with Conflict Deduplication

- **Type:** Story
- **Estimation:** 4 SP
- **Priority:** Critical
- **Dependencies:** MD-102, MD-201, MD-202, MD-203

#### User Story

> **As a** database service,  
> **I want** to persist parsed matches and highlights into Cloudflare D1 with conflict resolution,  
> **So that** new goals are added, existing posts update their upvote scores, and duplicate posts don't crash the ingestion.

#### Technical Specifications

1. Implement `src/server/ingest.ts`:
   - Function: `export async function ingestRedditHighlights(db: D1Database): Promise<IngestResult>`
2. Match insertion:
   - Calculate UTC match date (`YYYY-MM-DD`) from Reddit `created_utc`.
   - Calculate deterministic Match ID via `generateMatchId(dateStr, parsed.teamHome, parsed.teamAway)`.
   - SQLite execution:
     ```sql
     INSERT OR IGNORE INTO matches (id, match_date, team_home, team_away, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?);
     ```
3. Highlight insertion:
   - SQLite execution:
     ```sql
     INSERT INTO highlights (
       id, match_id, title, score_home, score_away, scorer, minute, tag,
       embed_url, source_url, reddit_url, reddit_score, posted_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       reddit_score = excluded.reddit_score,
       embed_url = coalesce(excluded.embed_url, highlights.embed_url);
     ```
4. Touch match `updated_at` whenever a new highlight is attached.
5. Return execution summary: `{ totalFetched: number, newHighlights: number, updatedHighlights: number }`.

#### Acceptance Criteria

- [ ] Multiple submissions for the same match map to the same `match_id`.
- [ ] Re-scraping the same post updates the `reddit_score` without error.
- [ ] Batch execution finishes within Cloudflare Worker memory and CPU limits.
