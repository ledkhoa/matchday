# Client-Side Watch History Store & Visual Progress Tracking: Changes Summary

## Overview

Implemented a persistent, client-side **Watch History Engine** and interactive progress tracking system for MatchDay using `@tanstack/store` and `@tanstack/react-store`. The feature tracks watched goal highlight clips across browser sessions and tabs, offering clear visual triage across match cards and timeline goal chips.

---

## 1. Dependencies Added

### [`package.json`](file:///Users/khoa/Documents/matchday/package.json)

- Explicitly declared dependencies:
  - `@tanstack/store`: `^0.11.1`
  - `@tanstack/react-store`: `^0.11.1`

---

## 2. New Store & Hooks Layer

### [`src/stores/watchHistoryStore.ts`](file:///Users/khoa/Documents/matchday/src/stores/watchHistoryStore.ts)

- Built the reactive TanStack Store `watchHistoryStore` holding normalized `watchedMap: Record<string, number>` and `version: number`.
- **SSR Safety**: Initialized with empty state when running outside the DOM (guarded via `'document' in globalThis && 'localStorage' in globalThis` without runtime `typeof`).
- **Persistence & Zod Schema Validation**: Parses and decodes `localStorage` payloads safely at the I/O boundary using Zod (`watchHistoryStateSchema`). Gracefully recovers on corrupt JSON or storage errors (e.g. Safari private mode).
- **Cross-Tab Synchronization**: Subscribes to window `storage` events to synchronize state between multiple open tabs in real-time.
- **Action Helpers**:
  - `markHighlightWatched(highlightId)`: Idempotent action that records the timestamp without redundant store updates if already marked.
  - `toggleHighlightWatched(highlightId)`: Toggles watch status.
  - `clearWatchHistory()`: Resets store state.
  - `isHighlightWatched(highlightId)`: Non-reactive point-in-time check.

### [`src/stores/watchHistoryStore.test.ts`](file:///Users/khoa/Documents/matchday/src/stores/watchHistoryStore.test.ts)

- Unit tests covering:
  - Initial state and persistence to `localStorage`.
  - Idempotent marking without subscriber re-notification.
  - Toggling and clearing watch history.
  - SSR / hydration safety and corrupt JSON recovery in `loadInitialState`.
  - Cross-tab `storage` event dispatch handling.

### [`src/hooks/useWatchHistory.ts`](file:///Users/khoa/Documents/matchday/src/hooks/useWatchHistory.ts)

- `useHighlightWatchStatus(highlightId)`: Subscribes reactively to an individual clip's watch status via `useSelector`.
- `useMatchWatchStatus(highlightIds)`: Aggregates watch status for a match fixture (`total`, `watchedCount`, `hasUnwatched`, `isAllWatched`) with `shallow` equality comparison from `@tanstack/store` to prevent unnecessary component re-renders.
- Re-exports action helpers for component ergonomics.

### [`src/hooks/useWatchHistory.test.ts`](file:///Users/khoa/Documents/matchday/src/hooks/useWatchHistory.test.ts)

- Unit tests covering:
  - Reactive updates on `useHighlightWatchStatus` during mark and toggle.
  - Aggregate status tracking (`hasUnwatched`, `isAllWatched`) in `useMatchWatchStatus`.
  - Referential stability and shallow equality verification when unrelated store entries update.

---

## 3. UI Component Integrations

### [`src/components/HighlightPlayer.tsx`](file:///Users/khoa/Documents/matchday/src/components/HighlightPlayer.tsx)

- Added an immediate auto-watch trigger: `useEffect` dispatches `markHighlightWatched(highlight.id)` as soon as the player mounts or the highlight ID changes, ensuring instant tracking with zero user friction.
- Updated [`src/components/HighlightPlayer.test.ts`](file:///Users/khoa/Documents/matchday/src/components/HighlightPlayer.test.ts) to verify auto-marking behavior.

### [`src/components/MatchHeader.tsx`](file:///Users/khoa/Documents/matchday/src/components/MatchHeader.tsx)

- Extended `MatchHeaderProps` with optional `watchStatus?: MatchWatchStatus`.
- Rendered status badges alongside kickoff time:
  - **State A (Unwatched highlights present)**: Emerald pill with animated pulsing dot (`{watchedCount}/{total} watched`).
  - **State B (All highlights watched)**: Muted pill with emerald `Check` icon (`{total}/{total} watched`).
  - **State C (Zero highlights / untracked)**: Badge omitted cleanly.
- Updated [`src/components/MatchHeader.test.ts`](file:///Users/khoa/Documents/matchday/src/components/MatchHeader.test.ts) with full test coverage for all badge variations.

### [`src/components/MatchCard.tsx`](file:///Users/khoa/Documents/matchday/src/components/MatchCard.tsx)

- Integrated `useMatchWatchStatus` and passed `watchStatus` down to `MatchHeader`.
- Implemented card container visual states:
  - **State A (Unwatched)**: Subtle emerald border (`border-emerald-500/30`), ambient aura glow, and top gradient line.
  - **State B (All Watched)**: Calm muted surface (`border-zinc-800/60 bg-zinc-900/50`) with lowered contrast.
  - **State C (No highlights)**: Standard neutral fixture styling.
- Extracted and implemented `GoalChip` subcomponent:
  - Unwatched state: `Play` icon, dark surface, `(Unwatched)` in accessible ARIA label.
  - Active state: `aria-pressed="true"`, emerald ring and glow, filled `Play` icon.
  - Watched state: Calm recessed background, `Check` icon (`text-emerald-500/70`), `(Watched)` in ARIA label.
  - Adaptive tags: Vivid tag background when unwatched; subdued muted tags when watched.
- Expanded [`src/components/MatchCard.test.ts`](file:///Users/khoa/Documents/matchday/src/components/MatchCard.test.ts) to verify container states, chip accessibility labels, active styles, and tag variations.

---

## 4. Verification & Quality Gates

All checks passed cleanly:

- **Unit Tests**: `bun test src` passed 309/309 tests across 28 files with 0 failures.
- **Typecheck**: Strict TypeScript `tsc --noEmit` passed with zero errors.
- **Linting**: Oxlint `oxlint .` passed with all anti-slop rules satisfied (no `any`, no runtime `typeof`, no "shape" term in symbols, valid SAFETY justifications).
- **Code Style**: Prettier verification `prettier . --check` passed cleanly.
