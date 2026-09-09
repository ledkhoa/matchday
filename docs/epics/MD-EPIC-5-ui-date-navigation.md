# MD-EPIC-5: Core UI Shell, Date Navigation & Match Feed

- **Key:** `MD-EPIC-5`
- **Status:** To Do
- **Target Sprint:** Sprint 3
- **Total Points:** 11 SP
- **Lead / Assignee:** TBD

---

## 🎯 Epic Overview

Craft an intuitive, clean, mobile-first dark UI using Tailwind CSS v4 and Lucide icons. Deliver the responsive app shell, seamless calendar date picker / navigation, compact match cards with live scorelines, and an empty state for non-match days.

---

## 🎫 User Stories

### [MD-501] Global App Shell, Header & Theme Configuration

- **Type:** Story
- **Estimation:** 2 SP
- **Priority:** High
- **Dependencies:** None

#### User Story

> **As a** soccer fan,  
> **I want** a modern, dark-themed responsive app shell,  
> **So that** I have a distraction-free experience optimized for reading scores and watching clips.

#### Technical Specifications

1. Update `src/routes/__root.tsx`:
   - Header with MatchDay branding, soccer ball icon from `lucide-react`, and a live digest badge.
   - External links to `r/soccer` and project GitHub repository.
   - Max width container (`max-w-4xl mx-auto px-4 py-6`) for centered, readable layout.
2. Styling in `src/styles.css` using Tailwind CSS v4:
   - Deep zinc/neutral dark theme backgrounds (`bg-zinc-950 text-zinc-100`).
   - Emerald/green accents for scores and goals.
   - Mobile responsive meta tags and font declarations.

#### Acceptance Criteria

- [ ] Responsive navigation bar renders cleanly on mobile (360px) up to 4K displays.
- [ ] No flash of unstyled content (FOUC) on SSR hydration.

---

### [MD-502] DateNav Component (Previous, Next, Calendar Picker & Today)

- **Type:** Story
- **Estimation:** 3 SP
- **Priority:** Critical
- **Dependencies:** MD-402, MD-501

#### User Story

> **As a** user,  
> **I want** to easily navigate backwards and forwards across dates or pick an exact day from a calendar,  
> **So that** I can catch up on yesterday's or last weekend's action effortlessly.

#### Technical Specifications

1. Implement `src/components/DateNav.tsx`:
   - Props: `{ currentDate: string }`.
   - Previous Day button: decrements date by 1 day and navigates to `/date/<prev>`.
   - Next Day button: increments date by 1 day (disabled if date >= today's UTC date).
   - Formatted Date Display: e.g. `Saturday, September 9, 2026`.
   - "Today" quick button (highlighted or hidden if already viewing today).
   - Date input popover/modal to pick any arbitrary past date.
2. Smooth client-side navigation using `useNavigate` from `@tanstack/react-router`.

#### Acceptance Criteria

- [ ] Clicking Previous/Next updates the URL to `/date/YYYY-MM-DD` and loads the data.
- [ ] Future dates cannot be navigated to (Next button disabled).
- [ ] "Today" button immediately jumps back to the current day.

---

### [MD-503] MatchCard Component & Highlight Chips

- **Type:** Story
- **Estimation:** 4 SP
- **Priority:** Critical
- **Dependencies:** MD-402, MD-501

#### User Story

> **As a** user,  
> **I want** each match grouped into a card with current scores and clickable highlight chips,  
> **So that** I can scan match results quickly and select specific goals to watch.

#### Technical Specifications

1. Implement `src/components/MatchCard.tsx`:
   - Props:
     ```typescript
     interface MatchCardProps {
       match: MatchWithHighlights;
       activeHighlightId: string | null;
       onSelectHighlight: (highlight: HighlightItem) => void;
     }
     ```
   - Header displaying Home Team vs Away Team with team logos/placeholders and final score badge.
   - Highlights row/wrap containing interactive goal chips:
     - Scorer and minute: e.g. `Saka 14'`
     - Score state at goal: `[1] - 0`
     - Badges for special tags: `(Great Goal)`, `(Penalty)` with custom colors (e.g. amber for penalties, purple for great goals).
     - Reddit upvotes: `▲ 1.4k`.
   - Visual active state for selected goal chip (border glow, accent color).
2. Embed the `HighlightPlayer` directly below the chips when a highlight is active.

#### Acceptance Criteria

- [ ] Match cards display teams, scores, and sorted goal chips cleanly.
- [ ] Clicking a goal chip triggers selection and highlights the active state.
- [ ] No page navigation occurs when toggling highlight chips.

---

### [MD-504] EmptyState Component

- **Type:** Story
- **Estimation:** 2 SP
- **Priority:** Medium
- **Dependencies:** MD-501

#### User Story

> **As a** user visiting a day with no matches,  
> **I want** a clear and helpful empty state,  
> **So that** I understand no highlights were recorded and can easily navigate to active days.

#### Technical Specifications

1. Implement `src/components/EmptyState.tsx`:
   - Icon: `CalendarOff` or `Trophy` from `lucide-react`.
   - Heading: "No highlights recorded for this day".
   - Helper text: "No matches were found or the scraper is still compiling posts for this date."
   - Action buttons: "Jump to Today" and "Visit r/soccer".
2. Render in `src/routes/date/$date.tsx` when `matches.length === 0`.

#### Acceptance Criteria

- [ ] Displays centered, stylish empty state when no matches exist.
- [ ] Action buttons are fully interactive and functional.
