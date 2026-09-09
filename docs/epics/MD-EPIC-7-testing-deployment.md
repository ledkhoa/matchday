# MD-EPIC-7: Quality Assurance, Testing & Deployment

- **Key:** `MD-EPIC-7`
- **Status:** To Do
- **Target Sprint:** Sprint 4
- **Total Points:** 5 SP
- **Lead / Assignee:** TBD

---

## 🎯 Epic Overview

Establish thorough automated test suites for the parser, deterministic Match ID generator, and video embed resolvers. Verify production build artifacts on Cloudflare Workers edge environment and configure deployment pipelines via Wrangler.

---

## 🎫 User Stories

### [MD-701] Comprehensive Unit Tests for Parsers & Resolvers

- **Type:** Story
- **Estimation:** 3 SP
- **Priority:** High
- **Dependencies:** MD-201, MD-202

#### User Story

> **As a** developer,  
> **I want** unit tests covering all title variations and video host domains,  
> **So that** parser regressions or breaking changes to Reddit formats are caught immediately.

#### Technical Specifications

1. Create `tests/parser.test.ts`:
   - Test standard goal titles:
     - `Arsenal [1] - 0 Chelsea - Bukayo Saka 14'`
     - `Manchester City 2 - [2] Real Madrid - Fede Valverde 79' (Great Goal)`
     - `Bayern Munich [3] - 1 Dortmund - Harry Kane 45+2' (Penalty)`
     - `Liverpool 0 - [1] Everton - Dwight McNeil 88'`
   - Test non-goal post filtering:
     - Ensure post-match threads, discussion topics, and transfers return `null`.
   - Test `generateMatchId`:
     - Test symmetry: `generateMatchId("2026-09-09", "Arsenal", "Chelsea") === generateMatchId("2026-09-09", "Chelsea", "Arsenal")`.
     - Test special characters, accents, and punctuation stripping.
2. Create `tests/video.test.ts`:
   - Test domain conversions for Dubz, Streamin, Streamff, Caulse.
   - Test fallback behavior for unknown domains.

#### Acceptance Criteria

- [ ] 100% of title parser edge cases pass unit test assertions.
- [ ] Running `bun test` or `npm test` completes with 0 failures.

---

### [MD-702] Production Build Verification & Cloudflare Deployment Pipeline

- **Type:** Story
- **Estimation:** 2 SP
- **Priority:** Critical
- **Dependencies:** All previous Epics

#### User Story

> **As a** DevOps / Tech Lead,  
> **I want** the production build verified and deployable to Cloudflare Workers via Wrangler,  
> **So that** the application runs reliably on edge infrastructure.

#### Technical Specifications

1. Verify package build scripts in `package.json`:
   - `"build": "vite build"`
   - `"deploy": "bun run build && wrangler deploy"`
2. Verify Cloudflare compatibility:
   - Check `wrangler.jsonc` compatibility date and `nodejs_compat` flag.
   - Run dry-run build: `bun run build`.
   - Check bundle size to ensure it complies with Cloudflare Workers bundle limits.
3. Validate remote D1 migration execution:
   - `wrangler d1 migrations apply DB --remote`
4. Verify cron triggers activation in Cloudflare dashboard.

#### Acceptance Criteria

- [ ] TypeScript compilation (`tsc --noEmit`) passes with zero errors under `strict: true`.
- [ ] Vite production build produces valid worker server assets.
- [ ] Deployment to Cloudflare Workers succeeds and live site serves SSR content with active cron schedule.
