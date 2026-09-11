# MatchDay Development Guidelines & Agent Rules

This document defines the universal coding principles, quality gates, failure logs, and architectural standards for the MatchDay codebase.

---

## Global Agent Rules

1. **Git Commit Discipline**: **Never** run `git commit` automatically unless the user explicitly gives instructions to commit.
2. **Format & Static Analysis Enforcement**:
   - **Always** run Prettier formatting and the linter/typecheck after every code change before concluding a task:
     ```bash
     bun run format && bun run check
     ```
3. **Failure & Mistake Tracking**:
   - Whenever the user corrects you or points out a mistake/oversight, **immediately** log the incident in the **Mistakes & Failure Log** below (recording Date, Mistake, and Root Cause / Correct Rule).
   - Review this log before every task to ensure you never repeat past mistakes.
4. **Dead & Cold Code Elimination**:
   - **Always** delete superseded, orphaned, unused, or cold code, components, files, and types when refactoring or implementing features. Never leave lingering, unused, or commented-out code in the codebase.
5. **No `any` Types**:
   - Maintain strict TypeScript compliance at all times. Do not use `any` types for database returns, route parameters, or API payloads; declare explicit interfaces or infer them directly from Drizzle schemas and Zod validators.

---

## Mistakes & Failure Log

| Date       | Mistake / Issue                                             | Root Cause & Prevention Rule                                                                                                                                                      |
| :--------- | :---------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-15 | Used deprecated `z.string().url()` instead of `z.url()`     | Always use modern Zod top-level `z.url()` schema instead of the deprecated `z.string().url()`.                                                                                    |
| 2026-08-15 | Attempted to auto-run `git commit` without explicit request | Never run `git commit` automatically unless the user explicitly asks to commit changes.                                                                                           |
| 2026-09-09 | Relied on unconstrained media containers causing overflow   | Always wrap dynamic iframes/video tags in Tailwind `aspect-video w-full` containers to preserve 16:9 scaling across mobile displays.                                              |
| 2026-09-09 | Used `any` type in D1 raw SQL query row mappings            | Strictly declare database row interfaces or use Drizzle ORM infer types (`Match`, `Highlight`) for all query responses.                                                           |
| 2026-09-09 | Extracted comment/mirror link instead of submission URL     | Always extract the primary submission target URL (`post.url` or `<shreddit-post content-href>`) and support `streamain` / `streama.in`.                                           |
| 2026-09-10 | Misaligned menu count badges between 0 and non-zero values  | Always use consistent fixed-width bounding containers (`min-w-[20px]`) and reserved accessory slots for list item counts and checkmarks to guarantee vertical column alignment.   |
| 2026-09-10 | Over-emphasized AI generation in README / project copy      | Keep project documentation clean, professional, and focused on the product, architecture, features, and engineering quality without intrusive AI self-promotion.                  |
| 2026-09-11 | Restored an intentionally removed UI badge ('LIVE DIGEST')  | Mistakenly assumed a diff against git HEAD was an accidental regression instead of an intentional deletion. Never re-introduce removed UI elements without explicit user request. |

---

## Universal Code Standards

### Framework & Stack Architecture

- **Framework**: TanStack Start (`@tanstack/react-start`, `@tanstack/react-router`, `@tanstack/react-query`) with React 19.
- **Runtime**: Cloudflare Workers (Edge SSR + Scheduled Cron Triggers) configured via `@cloudflare/vite-plugin` and `wrangler`.
- **Database & ORM**: Cloudflare D1 (Serverless SQLite) with Drizzle ORM (`drizzle-orm`, `drizzle-kit`).
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`, `@tailwindcss/typography`, `tw-animate-css`).
- **Icons**: `lucide-react`.
- **Validation**: `zod` v4.

### UI Components & Shadcn CLI

- Use `shadcn/ui` conventions for UI primitives.
- Install new components with `bun dlx`:
  ```bash
  bun dlx shadcn@latest add <component>
  ```
- Component aliases configured in `components.json`:
  - Components: `#/components`
  - Utils: `#/lib/utils`
  - UI Primitives: `#/components/ui`
  - Lib / Helpers: `#/lib`

### Media & Video Handling

- **Responsive Container**: All embedded iframes and HTML5 `<video>` elements must be wrapped inside `aspect-video w-full` containers.
- **Graceful Fallbacks**: If an embed URL is unsupported or unavailable, render a clean fallback button linking externally to the original clip host (`target="_blank" rel="noopener noreferrer"`).
- **Inline Playback**: Highlight clips should expand and play directly inside the match card without triggering route navigation or modal disruption.

### Comments Philosophy (Explain the WHY, Not the WHAT or HOW)

- Code must be clean, idiomatic, and self-documenting. Never write comments that merely restate what the adjacent line of code does.
- Reserve comments exclusively for the **WHY**: non-obvious business rationale, Reddit API quirks, regex capture edge cases, or edge runtime constraints.

### Type Safety & Native Inference

- Rely on TypeScript's native return type inference from async callbacks, loaders, and database helpers.
- Avoid redundant manual type casting (`as SomeType`) when types are already preserved.
- Never use `@ts-ignore`; resolve the underlying typing issue or use `@ts-expect-error` with an explanatory comment if dealing with an external library limitation.

### Quality Assurance & Automated Verification

Before marking any task as complete, always execute:

```bash
bun run format && bun run check
```

- `bun run typecheck`: Runs `tsc --noEmit` to guarantee strict type compliance.
- `bun run lint`: Runs `oxlint .` using anti-slop rules to reject low-signal patterns.
- `bun run format`: Runs `prettier . --write` to maintain consistent code formatting.
- `bun run check`: Executes typecheck, oxlint, and prettier verification in sequence.

---

## Directory Structure (`/matchday`)

```
matchday/
├── docs/                               # Epics, user stories, architecture roadmaps
│   ├── README.md                       # Master backlog overview & dependency chart
│   └── epics/                          # Individual epic specs (MD-EPIC-1 through MD-EPIC-7)
├── migrations/                         # D1 SQLite migration files (generated via drizzle-kit)
├── public/                             # Static assets, favicons, logos
├── src/
│   ├── components/                     # Reusable UI components & match cards
│   │   ├── ui/                         # Shadcn UI primitives (button, badge, dialog, etc.)
│   │   ├── DateNav.tsx                 # Prev/Next date controls & calendar popover
│   │   ├── MatchCard.tsx               # Match container with scoreline & goal chips
│   │   ├── HighlightPlayer.tsx         # Inline 16:9 iframe/video player & fallbacks
│   │   └── EmptyState.tsx              # Empty state for non-match days
│   ├── db/                             # Database layer
│   │   ├── index.ts                    # Drizzle D1 client initialization
│   │   ├── schema.ts                   # Drizzle schema (matches, highlights, relations)
│   │   └── seed.ts                     # Local database seeder script
│   ├── integrations/                   # Provider integrations
│   │   └── tanstack-query/             # React Query client, devtools & SSR setup
│   ├── lib/                            # Shared utilities
│   │   ├── parser.ts                   # Reddit soccer title regex parser & match ID generator
│   │   ├── video.ts                    # Video domain resolver & embed URL generator
│   │   └── utils.ts                    # Class name merger (cn) & formatting helpers
│   ├── routes/                         # TanStack Start file-based routing
│   │   ├── __root.tsx                  # App shell, global header & theme wrapper
│   │   ├── index.tsx                   # Auto-redirects to /date/$today
│   │   ├── date/
│   │   │   └── $date.tsx               # Daily digest view with SSR loader & match list
│   │   └── api/
│   │       └── cron.ts                 # Authenticated manual ingestion trigger
│   ├── server/                         # Backend & worker services
│   │   ├── cron.ts                     # Cloudflare Worker scheduled event handler
│   │   ├── ingest.ts                   # Highlight scraper & D1 persistence pipeline
│   │   └── reddit.ts                   # Reddit JSON feed client with rate limiting
│   ├── types/                          # Global ambient typings (env bindings, Cloudflare Env)
│   ├── router.tsx                      # TanStack Router instance & context definition
│   └── styles.css                      # Tailwind CSS v4 root stylesheet
├── tools/
│   └── oxlint/                         # Oxlint anti-slop plugin and AST lint rules
├── .prettierrc                         # Prettier code formatting rules
├── .prettierignore                     # Files excluded from Prettier checks
├── agents.md                           # Global development guidelines & agent failure log
├── components.json                     # Shadcn UI configuration
├── drizzle.config.ts                   # Drizzle Kit configuration for D1 SQLite
├── oxlint.config.ts                    # Oxlint configuration & anti-slop rules
├── package.json                        # Scripts, dependencies, and project metadata
├── tsconfig.json                       # Strict TypeScript compiler options
└── wrangler.jsonc                      # Cloudflare Workers configuration (D1, Cron triggers)
```
