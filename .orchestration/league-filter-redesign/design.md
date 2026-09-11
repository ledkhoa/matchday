# Design Specification: League Filter Bar Redesign

- **Feature Scope:** Redesign of `LeagueFilter` component (`src/components/LeagueFilter.tsx`) & its integration in `src/routes/date/$date.tsx`
- **Target Context:** Dense match-day fixtures with multiple active leagues (5+ competitions)
- **Author:** Principal Product Designer & Design Systems Architect
- **Status:** Approved / Ready for Implementation
- **Reference Issue:** Filter truncation on dense match days (`media_1789105158365.png`)

---

## 1. Executive Summary & Problem Analysis

### 1.1 Context & The Problem

On dates featuring multiple matches across various leagues (e.g., European weekends with Premier League, Bundesliga, Serie A, Ligue 1, La Liga, Championship, etc.), the current competition filter bar fails in several critical user experience dimensions:

```
[CURRENT DEFECTIVE LAYOUT]
+-----------------------------------------------------------------------------------------------+
| (All 5)  (🇩🇪 Bundesliga 1)  (🇮🇹 Serie A 1)  (🇫🇷 Ligue 1 1)  (🇪🇸 La Liga 1)  (🏆 All Compe...| <- CUT OFF!
+-----------------------------------------------------------------------------------------------+
                                                                             ^ Truncated without warning
                                                                             ^ No scrollbar / zero affordance
                                                                             ^ Dropdown inaccessible on desktop
```

As captured in user telemetry (`media_1789105158365.png`):

1. **Critical Truncation of Primary Trigger**: The "All Competitions" Popover dropdown button was placed as the _final child_ inside the same horizontally scrolling flex row (`flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-none`). When the list of daily leagues expands, the button is pushed to the far right edge and cut off abruptly (`All Compe...`).
2. **Hidden Scrollbar Affordance Deficit**: The container uses `scrollbar-none`. On desktop browsers (especially with mice rather than trackpads), there is zero visual indication that the container can scroll. Users assume the UI is broken or that options are missing.
3. **Desktop Usability Friction**: Mouse users cannot easily tilt-scroll horizontal containers without holding `Shift` or dragging, creating high task friction when exploring games from other leagues.
4. **Displaced Global Filter**: "All Competitions" is a global discovery tool (allowing users to browse all 11+ supported leagues even if they had 0 matches on that day), yet it is treated as a peer pill that drifts out of reach depending on how many leagues have matches that day.

### 1.2 Design Goals

- **Pinned Discovery Action**: The "All Competitions" dropdown must remain permanently visible, anchored, and un-truncated on all screen sizes.
- **High-Affordance Scroller**: The scrollable pill area must feature progressive edge-fade masking (`mask-image`) that indicates when content extends beyond visible boundaries.
- **Desktop Micro-Chevrons**: Interactive left and right scroll chevrons that appear on hover or when scrollable, providing one-click pagination for mouse users.
- **Compact Single-Line Profile**: Maintain a neat ~40–44px vertical profile to avoid pushing match highlight cards below the fold.
- **Club-Grade Chelsea Aesthetic**: Preserve dark mode palette (`zinc-950`, `zinc-900`, `zinc-800`) punctuated with Chelsea Royal Blue (`#034694`) and Chelsea Yellow (`#FFD100`) for active states.
- **Universal Accessibility (WCAG 2.2 AA)**: Full keyboard navigation (Tab, Arrow keys, Home/End), proper ARIA pressed/expanded semantics, and smooth focus-into-view behavior.

---

## 2. Comparative Analysis of UX Architectures

We evaluated three potential layout architectures to solve the filter overflow:

| Metric / Criteria             | Approach A: Pinned Dropdown + Edge-Masked Scroller (Recommended) | Approach B: Responsive Wrapping Pill Grid       | Approach C: Segmented Bar + Top 4 + "+N More"     |
| :---------------------------- | :--------------------------------------------------------------- | :---------------------------------------------- | :------------------------------------------------ |
| **Desktop Usability**         | ⭐⭐⭐⭐⭐ (Pinned action + hover chevrons)                      | ⭐⭐⭐ (Pills wrap to 2–3 rows, visual noise)   | ⭐⭐⭐⭐ (Clean, but hides leagues behind clicks) |
| **Mobile UX**                 | ⭐⭐⭐⭐⭐ (Natural touch swipe + edge fades)                    | ⭐⭐⭐ (Horizontal swipe on mobile)             | ⭐⭐⭐⭐ (Very compact, requires extra modal tap) |
| **Layout Stability**          | ⭐⭐⭐⭐⭐ (Constant 42px height, zero layout shift)             | ⭐⭐ (Height varies 42px -> 120px by date)      | ⭐⭐⭐⭐⭐ (Constant height)                      |
| **Discoverability**           | ⭐⭐⭐⭐⭐ (All daily leagues 1 swipe away; dropdown pinned)     | ⭐⭐⭐⭐⭐ (All visible immediately on desktop) | ⭐⭐⭐ (Leagues 5+ hidden under "+N More")        |
| **Implementation Complexity** | Medium (Scroll state + CSS mask + Chevrons)                      | Low (Just `flex-wrap`)                          | Medium (Ranking/slicing leagues + Popover)        |

### Why Approach A is the Winner

Approach B causes severe vertical layout shifts between dates (e.g., a quiet Tuesday with 1 league vs. a Saturday with 9 leagues triples the filter bar height, shifting all match cards down). Approach C prematurely hides leagues behind an extra click even on wide desktop screens.

**Approach A** provides the optimal balance: predictable vertical height, prominent and permanently accessible "All Competitions" dropdown, fluid touch scrolling on mobile with edge-fade affordances, and zero-friction desktop mouse scrolling via micro-chevrons.

---

## 3. Recommended Architecture: Pinned Action + Dynamic Edge-Masked Scroller

### 3.1 Structural Blueprint

```
+---------------------------------------------------------------------------------------------------------+
|                                    OUTER CONTAINER (w-full flex items-center)                           |
+---------------------------------------------------------------------------------------------------------+
| [ < ]  | (All 5)  (🇩🇪 Bundesliga 1)  (🇮🇹 Serie A 1)  (🇫🇷 Ligue 1 1)  (🇪🇸 La Liga 1) |  [ > ] | | 🏆 Competitions ▾ |
| (Prev) |                 <--- SCROLLABLE PILL TRACK (Masked Edges) --->             | (Next)| | (Pinned Right)     |
+---------------------------------------------------------------------------------------------------------+
    ^                                                                              ^       ^       ^
  Scroll Left                                                                  Scroll     Divider  Always Visible
  Button (Auto-hide)                                                           Right      (1px)    Anchor
```

### 3.2 Component Composition

1. **Outer Flex Shell (`w-full flex items-center gap-2 relative`)**:
   - Holds the scrollable viewport on the left and the pinned actions on the right.
2. **Scrollable Viewport Wrapper (`relative flex-1 min-w-0 flex items-center group`)**:
   - `min-w-0` is strictly required to allow flex-shrink in CSS flexbox.
   - Houses the horizontal scroll track and the floating desktop chevron buttons.
3. **Dynamic Edge-Fade Masks (`mask-image`)**:
   - Uses CSS linear gradients to fade out pills at the overflow boundaries:
     - Scrolled to Start (`scrollLeft === 0`): Fade right edge only.
     - Scrolled in Middle: Fade both left and right edges.
     - Scrolled to End: Fade left edge only.
     - No overflow: No fade mask applied.
4. **Hover / Auto-Hiding Scroll Chevrons**:
   - Left chevron button floats on the left edge with a backdrop blur; visible only when `canScrollLeft` is true.
   - Right chevron button floats on the right edge; visible only when `canScrollRight` is true.
   - On desktop, they fade in on container hover (`opacity-0 group-hover:opacity-100 transition-opacity`). On touch devices, native momentum swipe is naturally prioritized.
5. **Pinned Divider**:
   - A subtle `h-5 w-px bg-zinc-800 shrink-0` visually separates the daily league pills from the global competition picker.
6. **Pinned "All Competitions" Popover Trigger**:
   - Stays permanently outside the scrolling track.
   - Responsive label: Shows `Trophy` icon + "All Competitions" + `ChevronDown` on `sm:` screens; compact `Trophy` + `ChevronDown` on mobile (`< sm`).
   - If an off-calendar / zero-match competition is currently selected from the popover, the button highlights in Chelsea Yellow/Blue with an active badge indicator.

---

## 4. Visual Design Tokens & States

### 4.1 Color Palette & Tokens (Tailwind CSS v4)

| Element              | State                  | Tailwind CSS v4 Classes                                                                                                                  | Visual Effect                                                    |
| :------------------- | :--------------------- | :--------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------- |
| **Pill (Standard)**  | Default / Inactive     | `border-zinc-800 bg-zinc-900/70 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 hover:bg-zinc-800/60`                            | Subtle, clean surface; doesn't compete with match cards          |
| **Pill (Active)**    | Selected               | `border-yellow-500 bg-blue-950/80 text-yellow-200 ring-1 ring-yellow-500 shadow-[0_0_12px_rgba(255,209,0,0.22)]`                         | High-contrast Chelsea Yellow/Blue; unmistakable active indicator |
| **Pill Match Count** | Inactive               | `bg-zinc-800 text-zinc-400 font-bold tabular-nums`                                                                                       | Monospace digits prevent alignment jitter                        |
| **Pill Match Count** | Active                 | `bg-yellow-500/25 text-yellow-300 font-extrabold tabular-nums`                                                                           | Luminous badge accentuating fixture count                        |
| **Scroll Chevrons**  | Resting / Hover        | `h-7 w-7 rounded-full bg-zinc-900/90 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white shadow-md backdrop-blur-sm` | Floating circular micro-control                                  |
| **Pinned Action**    | Default                | `border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:border-zinc-700 hover:text-white`                                                    | Reliable secondary action                                        |
| **Pinned Action**    | Active (Custom Filter) | `border-yellow-500 bg-blue-950/80 text-yellow-200 ring-1 ring-yellow-500 shadow-[0_0_12px_rgba(255,209,0,0.22)]`                         | Signals that a dropdown-selected filter is currently applied     |

### 4.2 Dynamic Fade Mask Specifications

To indicate content overflow smoothly without harsh clipping, apply CSS mask styles to the scroll track:

```css
/* Both edges overflowing */
.mask-edges-both {
  mask-image: linear-gradient(
    to right,
    transparent,
    black 28px,
    black calc(100% - 28px),
    transparent
  );
  -webkit-mask-image: linear-gradient(
    to right,
    transparent,
    black 28px,
    black calc(100% - 28px),
    transparent
  );
}

/* Only right edge overflowing (at start) */
.mask-edges-right {
  mask-image: linear-gradient(to right, black calc(100% - 28px), transparent);
  -webkit-mask-image: linear-gradient(
    to right,
    black calc(100% - 28px),
    transparent
  );
}

/* Only left edge overflowing (at end) */
.mask-edges-left {
  mask-image: linear-gradient(to right, transparent, black 28px);
  -webkit-mask-image: linear-gradient(to right, transparent, black 28px);
}
```

---

## 5. Detailed Component Specification & Code Blueprint

### 5.1 Scroll Hook / Observer Pattern

The scroller tracks its position and dimensions via a dedicated `useHorizontalScroll` pattern or inline state:

```typescript
const scrollContainerRef = useRef<HTMLDivElement>(null);
const [canScrollLeft, setCanScrollLeft] = useState(false);
const [canScrollRight, setCanScrollRight] = useState(false);

const updateScrollState = useCallback(() => {
  const el = scrollContainerRef.current;
  if (!el) return;
  const { scrollLeft, scrollWidth, clientWidth } = el;
  // Use a 2px tolerance for fractional subpixel scaling
  setCanScrollLeft(scrollLeft > 2);
  setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2);
}, []);

useEffect(() => {
  const el = scrollContainerRef.current;
  if (!el) return;
  updateScrollState();

  const handleScroll = () => updateScrollState();
  el.addEventListener('scroll', handleScroll, { passive: true });

  const resizeObserver = new ResizeObserver(() => updateScrollState());
  resizeObserver.observe(el);

  return () => {
    el.removeEventListener('scroll', handleScroll);
    resizeObserver.disconnect();
  };
}, [updateScrollState]);
```

### 5.2 Smooth Scroll Action

Clicking the chevrons advances the scroll container smoothly by an ergonomic increment (e.g., 220px, equivalent to ~2 pill widths):

```typescript
const scroll = (direction: 'left' | 'right') => {
  const el = scrollContainerRef.current;
  if (!el) return;
  const offset = direction === 'left' ? -220 : 220;
  el.scrollBy({ left: offset, behavior: 'smooth' });
};
```

### 5.3 Active League Auto-Scroll into View

When the user selects a league (or loads a page with `?league=...`), the active pill should automatically center or scroll into view smoothly:

```typescript
useEffect(() => {
  const el = scrollContainerRef.current;
  if (!el) return;
  const activePill = el.querySelector(
    '[data-active="true"]',
  ) as HTMLElement | null;
  if (activePill) {
    activePill.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }
}, [activeLeague]);
```

### 5.4 JSX Layout Hierarchy

```tsx
<div
  aria-label="Filter matches by competition"
  className="relative flex items-center gap-2 w-full"
>
  {/* Left & Center: Scrollable Track Container */}
  <div className="relative flex-1 min-w-0 flex items-center group">
    {/* Left Scroll Chevron (Desktop / Mouse) */}
    {canScrollLeft && (
      <button
        type="button"
        aria-label="Scroll leagues left"
        onClick={() => scroll('left')}
        className="absolute left-0 z-10 hidden sm:flex h-7 w-7 -translate-x-1 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900/90 text-zinc-300 shadow-lg backdrop-blur-xs transition hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
    )}

    {/* Scrollable Track */}
    <div
      ref={scrollContainerRef}
      className={cn(
        'flex items-center gap-2 overflow-x-auto py-1 scroll-smooth scrollbar-none',
        canScrollLeft && canScrollRight && 'mask-edges-both',
        canScrollLeft && !canScrollRight && 'mask-edges-left',
        !canScrollLeft && canScrollRight && 'mask-edges-right',
      )}
    >
      {/* 1. "All" Pill */}
      <button
        type="button"
        data-active={isAllActive}
        aria-pressed={isAllActive}
        onClick={() => onSelectLeague(undefined)}
        className={cn(
          'flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500',
          isAllActive
            ? 'border border-yellow-500 bg-blue-950/80 text-yellow-200 ring-1 ring-yellow-500 shadow-[0_0_12px_rgba(255,209,0,0.22)]'
            : 'border border-zinc-800 bg-zinc-900/70 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 hover:bg-zinc-800/60',
        )}
      >
        <span>All</span>
        <span
          className={cn(
            'flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums',
            isAllActive
              ? 'bg-yellow-500/25 text-yellow-300'
              : 'bg-zinc-800 text-zinc-400',
          )}
        >
          {totalMatches}
        </span>
      </button>

      {/* 2. Active Day Leagues */}
      {availableLeagues.map((league) => {
        const isSelected = activeLeague === league.name;
        return (
          <button
            key={league.name}
            type="button"
            data-active={isSelected}
            aria-pressed={isSelected}
            onClick={() => onSelectLeague(isSelected ? undefined : league.name)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500',
              isSelected
                ? 'border border-yellow-500 bg-blue-950/80 text-yellow-200 ring-1 ring-yellow-500 shadow-[0_0_12px_rgba(255,209,0,0.22)]'
                : 'border border-zinc-800 bg-zinc-900/70 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 hover:bg-zinc-800/60',
            )}
          >
            {league.logo ? (
              <div className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded bg-white p-0.5 shadow-xs">
                <img
                  src={league.logo}
                  alt=""
                  aria-hidden="true"
                  className="h-full w-full object-contain"
                />
              </div>
            ) : (
              <Trophy className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            )}
            <span className="truncate max-w-[130px] sm:max-w-[180px]">
              {league.name}
            </span>
            <span
              className={cn(
                'flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums',
                isSelected
                  ? 'bg-yellow-500/25 text-yellow-300'
                  : 'bg-zinc-800 text-zinc-400',
              )}
            >
              {league.count}
            </span>
          </button>
        );
      })}

      {/* 3. Scoped Active League with 0 matches (if chosen via Popover) */}
      {isCustomActive && (
        <button
          type="button"
          data-active={true}
          aria-pressed={true}
          onClick={() => onSelectLeague(undefined)}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-yellow-500 bg-blue-950/80 px-3 py-1.5 text-xs font-semibold text-yellow-200 ring-1 ring-yellow-500 shadow-[0_0_12px_rgba(255,209,0,0.22)]"
        >
          <Trophy className="h-3.5 w-3.5 shrink-0 text-yellow-400" />
          <span className="truncate max-w-[130px]">{activeLeague}</span>
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow-500/25 px-1 text-[10px] font-bold text-yellow-300 tabular-nums">
            0
          </span>
          <X className="h-3.5 w-3.5 ml-0.5 text-yellow-400 hover:text-yellow-200" />
        </button>
      )}
    </div>

    {/* Right Scroll Chevron (Desktop / Mouse) */}
    {canScrollRight && (
      <button
        type="button"
        aria-label="Scroll leagues right"
        onClick={() => scroll('right')}
        className="absolute right-0 z-10 hidden sm:flex h-7 w-7 translate-x-1 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900/90 text-zinc-300 shadow-lg backdrop-blur-xs transition hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    )}
  </div>

  {/* Visual Separator */}
  <div className="h-5 w-px bg-zinc-800/80 shrink-0" aria-hidden="true" />

  {/* Pinned Right: "All Competitions" Popover Trigger */}
  <div className="shrink-0">
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="View all supported competitions"
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500',
            open
              ? 'border-zinc-700 bg-zinc-800 text-zinc-200'
              : isCustomActive
                ? 'border-yellow-500/70 bg-blue-950/60 text-yellow-300'
                : 'border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
          )}
        >
          <Trophy
            className={cn(
              'h-3.5 w-3.5 shrink-0',
              isCustomActive ? 'text-yellow-400' : 'text-zinc-400',
            )}
          />
          <span className="hidden sm:inline">All Competitions</span>
          <span className="sm:hidden text-xs">More</span>
          <ChevronDown className="h-3 w-3 shrink-0 text-zinc-500" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-72 max-h-80 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-2 text-zinc-100 shadow-2xl"
      >
        {/* Popover content remains responsive and rich */}
        <div className="px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-zinc-400 border-b border-zinc-800/80 mb-1 flex items-center justify-between">
          <span>Supported Competitions</span>
          <span className="text-[10px] text-zinc-500 font-normal">
            ({SUPPORTED_LEAGUES_LIST.length})
          </span>
        </div>
        {/* League items with match counts and selection ticks */}
      </PopoverContent>
    </Popover>
  </div>
</div>
```

---

## 6. Interaction & Micro-Interactions

### 6.1 Hover & Transitions

- **Pills**: `transition-all duration-150 ease-out`. Inactive pills gently elevate contrast on hover (`hover:border-zinc-700 hover:bg-zinc-800/60 hover:text-zinc-200`).
- **Chevrons**: Float with subtle shadows (`shadow-lg backdrop-blur-xs`). Chevrons feature a hover bounce effect (`scale-105 active:scale-95`).
- **Active Pill Aura**: Styled with `shadow-[0_0_12px_rgba(255,209,0,0.22)]` to match the brand's Chelsea glow signature without distracting from video play buttons.

### 6.2 Mobile Touch & Inertia

- Horizontal swipe utilizes iOS-grade hardware-accelerated momentum scrolling (`-webkit-overflow-scrolling: touch`).
- The edge-mask provides real-time visual feedback: as the user swipes to the end of the track, the right mask disappears seamlessly, indicating the end of available leagues.

### 6.3 Popover Alignment

- Changed from `align="start"` to `align="end"`.
- Because the "All Competitions" button is anchored to the right boundary of the page container, aligning `end` prevents the popover dropdown from overflowing outside the viewport on the right edge.

---

## 7. Accessibility (A11y) & Keyboard Navigation Specification

### 7.1 ARIA Attributes

- Outer wrapper: `role="region"` with `aria-label="Filter matches by competition"`.
- League buttons: `role="button"`, `aria-pressed={isSelected}` to communicate toggle states to screen readers.
- Count badges: Included within the button text or accompanied by `aria-label="{league.name}, {league.count} matches available"`.
- Popover Trigger: Native `aria-haspopup="dialog"`, `aria-expanded={open}`, `aria-controls="supported-leagues-list"`.

### 7.2 Keyboard Navigation Sequence

1. **Tab Key**: Enters the pill track. Focuses the active pill or "All".
2. **Arrow Keys (`ArrowRight` / `ArrowLeft`)**:
   - Focus moves cleanly between adjacent league pills and calls `scrollIntoView({ inline: 'nearest' })`.
3. **Space / Enter**: Activates the focused filter and updates URL search parameters via TanStack Router.
4. **Tab to Dropdown**: Continuing to Tab moves focus out of the pill track directly into the pinned "All Competitions" button.

---

## 8. Breakpoint Matrix

| Screen Size                   | Pill Track Width            | Chevrons                    | "All Competitions" Label    | Popover Width       |
| :---------------------------- | :-------------------------- | :-------------------------- | :-------------------------- | :------------------ |
| **Mobile (`< 640px`)**        | Flexible (`flex-1 min-w-0`) | Hidden (touch-first)        | Compact (`More ▾`)          | `w-64 max-w-[90vw]` |
| **Tablet (`640px - 1024px`)** | Flexible (`flex-1 min-w-0`) | Visible on hover/scrollable | Full (`All Competitions ▾`) | `w-72`              |
| **Desktop (`> 1024px`)**      | Flexible (`flex-1 min-w-0`) | Visible on hover/scrollable | Full (`All Competitions ▾`) | `w-72`              |

---

## 9. Verification & Acceptance Criteria

1. **Zero Cut-Offs**: On dates with 6+ active competitions (such as Bundesliga, Serie A, Ligue 1, La Liga, Championship, Eredivisie, etc.), the "All Competitions" button is 100% visible, fully legible, and pinned to the right.
2. **Edge-Fade Indicator**: When daily leagues exceed the width of the scroll container, a subtle ~28px gradient fade indicates horizontal continuation.
3. **Interactive Pagination**: Desktop users can click the left and right chevron buttons to slide through leagues smoothly.
4. **No Unwanted Horizontal Page Scroll**: The global window `overflow-x` remains locked at 0; only the interior pill track scrolls.
5. **Clean Toggle & Reset**: Clicking an active league deselects it and reverts back to "All".
6. **URL State Synchronization**: Selecting any league immediately updates TanStack Router search state (`?league=La+Liga`), persisting across refreshes.
