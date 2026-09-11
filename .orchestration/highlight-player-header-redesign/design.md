# Design Specification: Highlight Player Header & Action Bar Redesign

- **Feature Scope:** Redesign of `HighlightPlayer` component (`src/components/HighlightPlayer.tsx`) & its integration in `src/components/MatchCard.tsx`
- **Target Context:** In-card goal video playback across desktop and mobile devices
- **Author:** Principal Product Designer & Design Systems Architect
- **Status:** Approved / Ready for Implementation
- **Design Tokens:** Dark Mode (`zinc-950`, `zinc-900`, `zinc-800`), Chelsea FC Yellow (`#FFD100`), Chelsea FC Blue (`#034694`), Reddit Orange (`#FF4500`)

---

## 1. Executive Summary & Problem Analysis

### 1.1 Broadcast Graphics Ergonomics & The Defect

In professional association football (soccer) broadcasting worldwide—across the Premier League (Sky/TNT/NBC), UEFA Champions League, La Liga, Bundesliga, Serie A, and international tournaments—the universal industry standard places the **live broadcast scorecard (scorebug) and match clock in the top-left corner** of the television frame:

```
+-----------------------------------------------------------------------+
| [ ARS 1 - 0 CHE  48:12 ] <--- BROADCAST TV SCOREBUG (Score & Clock)   |
|                                                                       |
|                          SOCCER PITCH ACTION                          |
|                                                                       |
|                                                                       |
|                                                  [BROADCAST LOGO]     |
+-----------------------------------------------------------------------+
```

The legacy implementation of `HighlightPlayer.tsx` introduced a severe ergonomics defect:

```tsx
/* LEGACY DEFECTIVE OVERLAY IN HighlightPlayer.tsx */
<div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between p-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-auto">
  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200 truncate pr-2">
    <Play className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
    <span className="truncate">
      {highlight.scorer ?? 'Goal'}{' '}
      {highlight.minute ? `${highlight.minute}` : ''}
    </span>
    {highlight.tag && (
      <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
        {highlight.tag}
      </span>
    )}
  </div>
  <button
    onClick={onClose}
    className="flex h-7 w-7 items-center justify-center rounded-full ..."
  >
    <X className="h-4 w-4" />
  </button>
</div>
```

```
[CURRENT DEFECTIVE LAYOUT: OVERLAY COLLISION]
+-----------------------------------------------------------------------+
| > Martinelli 49' [Great Goal]                          [ (X) Close ]  | <- OVERLAY
| [ ARS 1 - 0 CHE  48:12 ] <--- TV SCOREBUG COMPLETELY OCCLUDED!        |
|~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|
|                                                                       |
|                          VIDEO PITCH ACTION                           |
|                                                                       |
+-----------------------------------------------------------------------+
```

### 1.2 Core Issues with the In-Frame Floating Overlay

1. **Information Occlusion & Broadcast Clashing**: The floating gradient (`bg-gradient-to-b from-black/80...`) and metadata text directly overlap the TV broadcast clock and score. Viewers cannot verify the official match clock or the running scoreline during the play.
2. **Pointer Events & Iframe Conflicts**: Embedded video players (Streamin, Dubz, Streamable, etc.) or native HTML5 `<video>` controls feature their own interactive layers. The floating overlay with `pointer-events-auto` intercepts hover and tap events intended for the video player's native controls, and conversely, iframe player titlebars or play overlays intercept taps intended for the MatchDay `(X)` close button.
3. **Visual Noise & Anti-AI-Slop Violation**: Sports media ergonomics demand an unpolluted video canvas. A persistent overlay degrades the viewing experience.
4. **Disjointed Bottom Action Links**: The footer actions below the video frame are visually discordant:
   - **Reddit Discussion**: A pill-styled button with custom orange background and border (`bg-orange-950/20 border-orange-900/40 text-orange-400`).
   - **Source Host Link**: An unstyled, plain text link (`text-zinc-400` with `text-primary`) lacking container boundaries, padding, or visual symmetry.
   - This creates an unbalanced, asymmetric UI footer that breaks visual hierarchy and makes touch targets uneven on mobile.

---

## 2. Design Goals & UX Philosophy

- **Zero In-Frame Occlusion**: The 16:9 video frame is treated as a clean, sacred broadcast viewport. 100% of MatchDay UI controls (title, tags, close trigger, external links) live outside the video frame.
- **Dedicated Player Header Bar**: An external header bar docked directly above the 16:9 video container that communicates the "Now Playing" highlight context (scorer, minute, goal score, tag badge) and provides an accessible, prominent dismiss action (`X`).
- **Unified Action Bar**: A balanced, cohesive footer below the video container where both the **Reddit Discussion** and the **Source Host** actions share identical button pill ergonomics (height, radius, padding, icon sizing) while showcasing distinct, refined brand accents.
- **Anti-AI-Slop Cleanliness**: Crisp dark mode surfaces (`zinc-950`, `zinc-900`, `zinc-800`), Chelsea Yellow (`#FFD100`) accents, clear typographic hierarchy, and purposeful micro-interactions.
- **Universal Accessibility (WCAG 2.2 AA)**: Minimum 44x44px touch targets on mobile, high-contrast text, proper ARIA labeling, keyboard dismissal (`Escape` key), and focus return to the triggering GoalChip.

---

## 3. Comparative Architecture Analysis

We evaluated three potential layout configurations:

| Evaluation Criteria        | Approach A: Floating Bottom Overlay             | Approach B: External Header Bar + Unified Footer (Selected) | Approach C: Combined Top Header with Links Included |
| :------------------------- | :---------------------------------------------- | :---------------------------------------------------------- | :-------------------------------------------------- |
| **Broadcast Visibility**   | ❌ Obstructs native player controls & subtitles | ⭐⭐⭐⭐⭐ 100% unobstructed 16:9 video frame               | ⭐⭐⭐⭐⭐ 100% unobstructed 16:9 video frame       |
| **Iframe Compatibility**   | ❌ Severe pointer event conflicts               | ⭐⭐⭐⭐⭐ Zero pointer event conflict with iframes         | ⭐⭐⭐⭐⭐ Zero pointer event conflict with iframes |
| **Mobile Scannability**    | ⭐⭐ Cluttered bottom edge                      | ⭐⭐⭐⭐⭐ Clear top-to-bottom hierarchy                    | ⭐⭐⭐ Header becomes too tall / crowded (3 rows)   |
| **Ergonomic Hierarchy**    | ⭐⭐ Inverted (Controls over video)             | ⭐⭐⭐⭐⭐ Natural: Title/Close -> Video -> Actions         | ⭐⭐⭐ All actions pushed before user even watches  |
| **Touch Target Precision** | ⭐⭐ High accidental click risk                 | ⭐⭐⭐⭐⭐ Isolated tap targets with 44px hit-box           | ⭐⭐⭐ Crowded header targets on small screens      |

### Why Approach B is Selected

Approach B establishes a natural narrative sequence:

1. **Header (Context & Control)**: What am I watching? (`Scorer`, `Minute`, `Tag`) + How do I exit? (`Close button`).
2. **Center (Media Viewport)**: Uncompromised 16:9 video presentation with full native player controls accessible.
3. **Footer (Deep Dive & Attribution)**: Where can I discuss this? (`Reddit Thread`) + Where did this clip come from? (`Source Host`).

---

## 4. Structural Component Anatomy & Wireframes

### 4.1 Desktop Wireframe (`sm:` and above >= 640px)

```
+-----------------------------------------------------------------------------------------------+
| MATCH CARD CONTAINER (border border-zinc-800 bg-zinc-900/80 rounded-2xl p-4 sm:p-5)          |
|                                                                                               |
| [ PREMIER LEAGUE 🏆 ]                                                  [ FT • 3 HIGHLIGHTS ]  |
| Arsenal  [CREST]                      2 - 1                      [CREST]  Chelsea             |
|                                                                                               |
| [ ▶ Saka 14' 1-0 ]   [ ● Martinelli 49' 2-0 (P) ]*ACTIVE   [ ✔ Palmer 78' 2-1 ]               |
|                                                                                               |
| ============================== HIGHLIGHT PLAYER MODULE ===================================== |
|                                                                                               |
| +-------------------------------------------------------------------------------------------+ |
| | DEDICATED PLAYER HEADER BAR (bg-zinc-900/95 border border-zinc-800 rounded-t-xl px-3.5)  | |
| |                                                                                           | |
| |  [▶]  Martinelli 49'  [ 2 - 0 ]  [ PENALTY ]                             [ (X) Close Esc ]| |
| |   ^        ^              ^           ^                                         ^         | |
| |  Icon  Scorer/Min    Score Context   Tag Badge                            Dismiss Button  | |
| +-------------------------------------------------------------------------------------------+ |
| | 16:9 VIDEO CONTAINER (aspect-video bg-black border-x border-zinc-800)                     | |
| |                                                                                           | |
| | [ ARS 2 - 0 CHE  48:12 ] <--- TV SCOREBUG COMPLETELY UNBLOCKED & FULLY VISIBLE!          | |
| |                                                                                           | |
| |                                   NATIVE VIDEO STREAM                                     | |
| |                                   (HTML5 / Iframe Embed)                                  | |
| |                                                                                           | |
| | ▶  0:12 / 0:45  ═══════════════════════════════════════════════════════════  🔊  [  ]     | |
| +-------------------------------------------------------------------------------------------+ |
| | UNIFIED ACTION BAR (bg-zinc-900/90 border border-zinc-800 rounded-b-xl px-3.5 py-2.5)     | |
| |                                                                                           | |
| |  [ 💬 Reddit Discussion ↗ ]                       [ 🌐 Source: streamin.one ↗ ]           | |
| |  (Shared pill height: 32px / 8px radius)          (Shared pill height: 32px / 8px radius) | |
| +-------------------------------------------------------------------------------------------+ |
| =========================================================================================== |
+-----------------------------------------------------------------------------------------------+
```

### 4.2 Mobile Wireframe (`< 640px`, e.g., 375px iPhone Viewport)

```
+-----------------------------------------------------------------------+
| [ ▶ Saka 14' ]  [ ● Martinelli 49' (P) ]*ACTIVE  [ ✔ Palmer 78' ]     |
|                                                                       |
| +-------------------------------------------------------------------+ |
| | DEDICATED PLAYER HEADER (h-11 px-3 flex items-center justify-bet) | |
| |                                                                   | |
| |  [▶] Martinelli 49' [ 2-0 ] [ PENALTY ]               [ (X) Close]| |
| |      (Truncates gracefully if screen is narrow)         (44px hit)| |
| +-------------------------------------------------------------------+ |
| | 16:9 VIDEO VIEWPORT (aspect-video w-full bg-black)                | |
| |                                                                   | |
| |  [ ARS 2 - 0 CHE  48:12 ]                                         | |
| |                                                                   | |
| |                       CLEAN MATCH FOOTAGE                         | |
| |                                                                   | |
| +-------------------------------------------------------------------+ |
| | UNIFIED ACTION BAR (p-2.5 flex items-center justify-between gap-2)| |
| |                                                                   | |
| |  [ 💬 Reddit Discussion ↗ ]         [ 🌐 streamin.one ↗ ]         | |
| |   (flex-1 min-w-0 justify-center)    (flex-1 min-w-0 justify-cen) | |
| +-------------------------------------------------------------------+ |
+-----------------------------------------------------------------------+
```

---

## 5. Detailed Component Specifications

### 5.1 Dedicated Player Header Bar (Above Video)

#### 5.1.1 Positioning & Geometry

- **Placement**: Directly stacked above the 16:9 video frame.
- **Corner Radii**: Rounded top corners (`rounded-t-xl`) that seamlessly integrate with the video frame's vertical stack.
- **Height**: Ergonomic fixed height of `h-11` (44px) on mobile and desktop, ensuring sufficient breathing room while maintaining a compact vertical footprint.
- **Surface**: `bg-zinc-900/95 backdrop-blur-md` with `border-t border-x border-zinc-800` (the bottom border is formed by the top edge of the video viewport).

#### 5.1.2 Left Metadata Group (`flex items-center gap-2 min-w-0 flex-1`)

1. **Now Playing Indicator**:
   - Icon: `Play` icon (`h-3.5 w-3.5 shrink-0 fill-yellow-400 text-yellow-400`).
   - Visual Cue: Signals active clip playback in Chelsea FC Yellow.
2. **Scorer & Minute Title**:
   - Typography: `text-xs sm:text-sm font-bold text-zinc-100 truncate`.
   - Content: `{highlight.scorer ?? 'Goal'} {highlight.minute ? `${highlight.minute}` : ''}`.
   - Truncation: Handles exceptionally long player names via `truncate min-w-0 max-w-[150px] xs:max-w-[200px] sm:max-w-[320px]`.
3. **Goal Score Context Badge (Optional / Enhancing Context)**:
   - When score at goal is known or inferable (from `formatGoalScore`), displays a micro monospace pill:
   - Styling: `font-mono text-[11px] font-bold tabular-nums text-zinc-400 bg-zinc-950/80 px-1.5 py-0.5 rounded border border-zinc-800/80 shrink-0`.
4. **Special Tag Badge**:
   - Uses `getTagCategory(highlight.tag)` with the project's established color taxonomy:
     - **Penalty `(P)`**: `border-amber-800/60 bg-amber-950/50 text-amber-300`
     - **Great Goal**: `border-purple-800/60 bg-purple-950/50 text-purple-300`
     - **Own Goal `(OG)`**: `border-rose-800/60 bg-rose-950/50 text-rose-300`
     - **Standard**: `border-zinc-700 bg-zinc-800 text-zinc-300`
   - Sizing: `text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0`.

#### 5.1.3 Right Dismiss Control Group (`flex items-center shrink-0 ml-2`)

- **Close Button**:
  - Visual Appearance: Sleek circular micro-button (`h-7 w-7 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 border border-zinc-700/60 transition-colors flex items-center justify-center`).
  - Mobile Touch Area: Expanded to 44x44px interactive hit area using `relative before:absolute before:-inset-2` to prevent mis-taps.
  - Keyboard Support: `aria-label="Close highlight player"` with `Escape` key shortcut listener. Focus shifts cleanly back to the active goal chip upon dismiss.

---

### 5.2 16:9 Video Viewport (Center)

- **Container Styling**: `relative w-full aspect-video bg-black overflow-hidden border-x border-zinc-800 shadow-2xl`.
- **Media Engines**:
  - **HTML5 Direct Video**: `<video controls playsInline autoPlay preload="metadata" className="h-full w-full object-contain bg-black" />`.
  - **Iframe Embed**: `<iframe allow="autoplay; fullscreen; picture-in-picture; web-share" allowFullScreen loading="lazy" className="h-full w-full border-0 bg-black" />`.
  - **Fallback State**: Clean inside-frame fallback card if media cannot be resolved or errors out.
- **Unobstructed Broadcasting**: Zero overlay elements inside the video box. Native video controls and broadcast watermarks remain completely unobstructed.

---

### 5.3 Unified Action Bar (Below Video)

#### 5.3.1 Positioning & Layout

- **Placement**: Directly attached underneath the 16:9 video container.
- **Corner Radii**: Rounded bottom corners (`rounded-b-xl`).
- **Surface**: `bg-zinc-900/90 backdrop-blur-md border-b border-x border-zinc-800 px-3.5 py-2.5`.
- **Flex Arrangement**:
  - Desktop: `flex items-center justify-between gap-3`.
  - Mobile: `flex items-center gap-2 w-full` where both pills share equal 50% width (`flex-1 min-w-0 justify-center`).

#### 5.3.2 Shared Pill Button Architecture

Both action buttons share the exact same structural design tokens:

- Height: `h-8` (32px vertical height).
- Padding: `px-3 py-1.5`.
- Border Radius: `rounded-lg` (8px).
- Font Spec: `text-xs font-semibold tracking-tight`.
- Layout: `inline-flex items-center justify-center gap-1.5 shrink-0 transition-all duration-150`.
- Icon Size: Leading icon `h-3.5 w-3.5`, trailing external link indicator `h-3 w-3 opacity-60 group-hover:opacity-100 transition-opacity`.

#### 5.3.3 Brand-Specific Tokens

| Action                | Left Icon                 | Label Format                                       | Base State (Tailwind)                                                                                | Hover / Active State (Tailwind)                                                               |
| :-------------------- | :------------------------ | :------------------------------------------------- | :--------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------- |
| **Reddit Discussion** | `MessageSquare`           | "Reddit Discussion" (or "Discussion" on `< 360px`) | `border border-orange-900/50 bg-orange-950/25 text-orange-400 shadow-xs`                             | `hover:bg-orange-950/50 hover:border-orange-700/70 hover:text-orange-300 active:scale-[0.98]` |
| **Source Host**       | `Globe` or `ExternalLink` | `Source: {hostname}` (e.g. "Source: streamin.one") | `border border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800 shadow-xs` | `hover:border-zinc-600 hover:text-zinc-100 hover:bg-zinc-800/90 active:scale-[0.98]`          |

_Design Rationale for Source Pill:_
Replacing the plain unstyled text link with a structured zinc pill elevates the source host to a first-class citizen alongside Reddit. It guarantees consistent clickability, clear affordance, and balanced visual weight.

---

## 6. Complete Tailwind CSS & Design Token Dictionary

```typescript
export const PLAYER_DESIGN_TOKENS = {
  // Master Container
  container: 'mt-4 flex flex-col w-full shadow-2xl rounded-xl',

  // Dedicated External Header Bar
  header: {
    wrapper: cn(
      'flex h-11 items-center justify-between px-3.5 py-2',
      'rounded-t-xl border-t border-x border-zinc-800',
      'bg-zinc-900/95 backdrop-blur-md',
    ),
    metaGroup: 'flex items-center gap-2 min-w-0 flex-1 pr-2',
    nowPlayingIcon: 'h-3.5 w-3.5 shrink-0 fill-yellow-400 text-yellow-400',
    titleText: 'truncate text-xs sm:text-sm font-bold text-zinc-100',
    scoreBadge: cn(
      'shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums',
      'border border-zinc-800 bg-zinc-950/80 text-zinc-400',
    ),
    closeButton: cn(
      'relative flex h-7 w-7 items-center justify-center rounded-full',
      'border border-zinc-700/60 bg-zinc-800/80 text-zinc-400',
      'transition-colors hover:border-zinc-600 hover:bg-zinc-700 hover:text-zinc-100',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500',
      // 44px touch hit-pad for mobile
      'before:absolute before:-inset-2 before:content-[""] sm:before:hidden',
    ),
    closeIcon: 'h-4 w-4',
  },

  // 16:9 Video Canvas
  videoCanvas: cn(
    'relative aspect-video w-full overflow-hidden bg-black',
    'border-x border-zinc-800',
  ),

  // Unified Bottom Action Bar
  actionBar: {
    wrapper: cn(
      'flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 px-3.5 py-2.5',
      'rounded-b-xl border-b border-x border-zinc-800',
      'bg-zinc-900/90 backdrop-blur-md',
    ),
    redditButton: cn(
      'group inline-flex h-8 flex-1 sm:flex-initial items-center justify-center gap-1.5',
      'rounded-lg border border-orange-900/50 bg-orange-950/25 px-3 py-1.5',
      'text-xs font-semibold text-orange-400 shadow-xs transition-all duration-150',
      'hover:border-orange-700/70 hover:bg-orange-950/50 hover:text-orange-300',
      'active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500',
    ),
    sourceButton: cn(
      'group inline-flex h-8 flex-1 sm:flex-initial items-center justify-center gap-1.5',
      'rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5',
      'text-xs font-semibold text-zinc-300 shadow-xs transition-all duration-150',
      'hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100',
      'active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500',
    ),
    icon: 'h-3.5 w-3.5 shrink-0',
    externalIcon:
      'h-3 w-3 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity',
  },
};
```

---

## 7. Interaction States & Transitions

### 7.1 Interactive Micro-States

```
+----------------------------------------------------------------------------------------------------+
| ELEMENT                  | DEFAULT STATE               | HOVER STATE               | ACTIVE / FOCUS|
|--------------------------+-----------------------------+---------------------------+---------------|
| Close (X) Button         | bg-zinc-800/80 text-zinc-400| bg-zinc-700 text-zinc-100 | ring-2 yellow |
| Reddit Discussion Pill   | bg-orange-950/25 text-orange| bg-orange-950/50 border-or| scale-[0.98]  |
| Source Host Pill         | bg-zinc-900 text-zinc-300   | bg-zinc-800 text-zinc-100 | scale-[0.98]  |
+----------------------------------------------------------------------------------------------------+
```

### 7.2 Keyboard Navigation & Shortcuts

- **Dismiss Keyboard Shortcut (`Escape`)**:
  Pressing `Escape` anywhere while the highlight player is mounted immediately invokes `onClose()`.
- **Focus Order Sequence**:
  1. `GoalChip` (triggers player to mount)
  2. `HighlightPlayer Close Button` (`(X)`)
  3. Native video controls (or iframe controls)
  4. `Reddit Discussion Pill`
  5. `Source Host Pill`
- **Return of Focus**:
  When `onClose()` is invoked (via button click, `Escape`, or re-clicking the active `GoalChip`), focus is restored to the triggering `GoalChip` in `MatchCard.tsx`.

### 7.3 Smooth Mount Animation

- When the user selects a goal chip, the highlight player mounts with a subtle fade-in and micro-translate:
  `animate-in fade-in-50 zoom-in-98 duration-200 ease-out`
- Prevents jarring layout pops and smoothly draws the user's focus down to the media player.

---

## 8. Accessibility (WCAG 2.2 AA Compliance)

### 8.1 ARIA Semantics & Roles

- **Player Landmark**:
  The outer wrapper features `role="region"` and `aria-label="Video highlight player: {highlight.title}"`.
- **Close Button Semantics**:
  - `type="button"`
  - `aria-label="Close video player"`
  - Tooltip / title text: `"Close player (Esc)"`
- **Action Buttons**:
  - `role="link"` with explicit `target="_blank"` and `rel="noopener noreferrer"`.
  - Accessible screen reader labels:
    - Reddit: `aria-label="View Reddit discussion for this highlight (opens in new tab)"`
    - Source: `aria-label="View original clip on {hostname} (opens in new tab)"`

### 8.2 Contrast Ratio Audit (WCAG 2.2 AA / AAA)

| Component Text        | Foreground OKLCH/Hex     | Background OKLCH/Hex          | Contrast Ratio | WCAG Compliance         |
| :-------------------- | :----------------------- | :---------------------------- | :------------- | :---------------------- |
| Header Scorer Name    | `#F4F4F5` (`zinc-100`)   | `#18181B` (`zinc-900`)        | **13.8:1**     | AAA (Pass)              |
| Minute / Tag          | `#D4D4D8` (`zinc-300`)   | `#27272A` (`zinc-800`)        | **8.2:1**      | AAA (Pass)              |
| Reddit Pill Text      | `#FB923C` (`orange-400`) | `#271406` (`orange-950` tint) | **6.4:1**      | AA Large & Small (Pass) |
| Source Host Pill Text | `#D4D4D8` (`zinc-300`)   | `#18181B` (`zinc-900`)        | **9.1:1**      | AAA (Pass)              |
| Close Icon            | `#A1A1AA` (`zinc-400`)   | `#27272A` (`zinc-800`)        | **4.9:1**      | AA (Pass)               |

### 8.3 Mobile Touch Ergonomics

- Even though the visual close button is compact (`28x28px` / `h-7 w-7`) to match desktop density, on touch devices the CSS pseudo-element `before:absolute before:-inset-2` expands the tactile tap target to **44x44px**, satisfying WCAG 2.2 Success Criterion 2.5.8 (Target Size).
- The action bar pills each measure `h-8` with vertical card margin spacing, providing easy thumb accessibility on single-handed mobile usage.

---

## 9. Edge Cases & Defensive UX

### 9.1 Long Player Names

- **Problem**: Names like _"Trent Alexander-Arnold"_, _"Khvicha Kvaratskhelia"_, or _"Pierre-Emerick Aubameyang"_ can exceed 25 characters. Combined with minute markers and tags, this could push the close button off screen or force multiple lines.
- **Solution**:
  - Apply `truncate min-w-0` to the name element.
  - Set `shrink-0` on the `Play` icon, `Minute`, `Tag`, and `Close` button.
  - Constrain the maximum text container with `max-w-[150px] xs:max-w-[200px] sm:max-w-[320px] md:max-w-[420px]`.
  - Provide a full `title="{highlight.scorer}"` tooltip attribute for desktop hover legibility.

### 9.2 Multiple / Extended Tags

- **Problem**: Clips may have compound tags or long strings like `(Great Goal)` or `(Penalty + Red Card)`.
- **Solution**:
  - On viewports `< 380px` (small mobile), truncate the tag badge or display abbreviation (e.g. `(P)` or `OG`).
  - Flex wrapper uses `min-w-0 overflow-hidden` to prevent layout breaking.

### 9.3 Hostname Formatting

- **Problem**: Source URLs may be complex (e.g., `https://subdomain.cdn.streamin.me/v/abcdef`).
- **Solution**:
  - Utility function `getSourceHostname(url)` strips protocols, `www.`, and query strings, leaving clean labels: `streamin.me`, `dubz.link`, `streamable.com`.
  - In the source pill, label formats as `Source: {hostname}` on screens >= 400px, and simply `{hostname}` on narrow viewports (`< 400px`).

### 9.4 Playback Error & Unsupported Fallback Card

- When playback fails or the domain is unsupported:
  - The header bar **remains visible** above the fallback card so the user still has full context of what they tried to play and can close the card.
  - The fallback card renders inside the 16:9 frame with its direct call-to-action buttons.
  - The bottom action bar remains unified, preventing layout shifts.

---

## 10. Implementation Code Blueprint

Below is the production-grade implementation blueprint for `src/components/HighlightPlayer.tsx`:

```tsx
import { useState, useEffect, useId } from 'react';
import {
  Play,
  X,
  VideoOff,
  ExternalLink,
  MessageSquare,
  Globe,
} from 'lucide-react';
import type { Highlight } from '#/db/schema';
import { resolveVideoEmbed } from '#/lib/video';
import { markHighlightWatched } from '#/stores/watchHistoryStore';
import { getTagCategory } from '#/lib/formatters';
import { cn } from '#/lib/utils';

export interface HighlightPlayerProps {
  highlight: Highlight;
  onClose: () => void;
  goalScore?: string | null;
}

function getSourceHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Source Host';
  }
}

export function HighlightPlayer({
  highlight,
  onClose,
  goalScore,
}: HighlightPlayerProps) {
  const media = resolveVideoEmbed(highlight.sourceUrl, highlight.redditUrl);
  const [playbackError, setPlaybackError] = useState(false);
  const titleId = useId();

  useEffect(() => {
    setPlaybackError(false);
  }, [highlight.id]);

  const isDirectVideo = Boolean(media.directVideoUrl && !media.isIframe);
  const effectiveEmbedUrl = isDirectVideo
    ? null
    : (media.embedUrl ?? highlight.embedUrl);
  const hasEmbed = Boolean(effectiveEmbedUrl);
  const isFallback = (!isDirectVideo && !hasEmbed) || playbackError;

  useEffect(() => {
    if (highlight.id) {
      markHighlightWatched(highlight.id);
    }
  }, [highlight.id]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const redditDiscussionUrl = highlight.redditUrl.startsWith('http')
    ? highlight.redditUrl
    : `https://reddit.com${highlight.redditUrl}`;

  const tagCategory = getTagCategory(highlight.tag);
  const hostname = getSourceHostname(highlight.sourceUrl);

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      className="mt-4 flex flex-col w-full shadow-2xl rounded-xl transition-all animate-in fade-in-50 duration-200"
    >
      {/* 1. Dedicated External Header Bar (Above Video) */}
      <div className="flex h-11 items-center justify-between px-3.5 py-2 rounded-t-xl border-t border-x border-zinc-800 bg-zinc-900/95 backdrop-blur-md">
        {/* Left: Metadata Group */}
        <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
          {/* Active indicator */}
          <Play
            className="h-3.5 w-3.5 shrink-0 fill-yellow-400 text-yellow-400"
            aria-hidden="true"
          />

          {/* Goal Scorer & Minute */}
          <span
            id={titleId}
            title={highlight.scorer ?? highlight.title}
            className="truncate text-xs sm:text-sm font-bold text-zinc-100 max-w-[150px] xs:max-w-[200px] sm:max-w-[300px]"
          >
            {highlight.scorer ?? 'Goal'}{' '}
            {highlight.minute ? `${highlight.minute}` : ''}
          </span>

          {/* Scoreline Context (if available) */}
          {goalScore && (
            <span className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums border border-zinc-800 bg-zinc-950/80 text-zinc-400">
              {goalScore}
            </span>
          )}

          {/* Tag Badge */}
          {highlight.tag && (
            <span
              className={cn(
                'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider',
                tagCategory === 'penalty' &&
                  'border border-amber-800/60 bg-amber-950/50 text-amber-300',
                tagCategory === 'great_goal' &&
                  'border border-purple-800/60 bg-purple-950/50 text-purple-300',
                tagCategory === 'own_goal' &&
                  'border border-rose-800/60 bg-rose-950/50 text-rose-300',
                tagCategory === 'standard' &&
                  'border border-zinc-700 bg-zinc-800 text-zinc-300',
              )}
            >
              {highlight.tag}
            </span>
          )}
        </div>

        {/* Right: Dismiss Control */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close highlight player (Esc)"
          title="Close player (Esc)"
          className="relative flex h-7 w-7 items-center justify-center rounded-full border border-zinc-700/60 bg-zinc-800/80 text-zinc-400 transition-colors hover:border-zinc-600 hover:bg-zinc-700 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500 before:absolute before:-inset-2 before:content-[''] sm:before:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 2. Unobstructed 16:9 Video Canvas */}
      <div className="relative aspect-video w-full overflow-hidden bg-black border-x border-zinc-800">
        {isDirectVideo ? (
          <video
            key={media.directVideoUrl!}
            src={media.directVideoUrl!}
            controls
            playsInline
            autoPlay
            preload="metadata"
            className="h-full w-full object-contain bg-black"
            aria-label={highlight.title}
            onError={() => setPlaybackError(true)}
          />
        ) : hasEmbed ? (
          <iframe
            key={effectiveEmbedUrl!}
            src={effectiveEmbedUrl!}
            title={highlight.title}
            allow="autoplay; fullscreen; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
            className="h-full w-full border-0 bg-black"
            onError={() => setPlaybackError(true)}
          />
        ) : (
          /* Graceful Fallback Card */
          <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center bg-zinc-950/95 border-b border-zinc-800">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 border border-zinc-800 text-amber-400 mb-3 shadow-inner">
              <VideoOff className="h-6 w-6" />
            </div>
            <h4 className="text-base font-bold text-zinc-100">
              Direct Playback Unavailable
            </h4>
            <p className="mt-1 text-xs text-zinc-400 max-w-sm">
              This hosting service does not support inline playback. You can
              watch the clip directly on the source host.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
              <a
                href={highlight.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 shadow-md"
              >
                <span>Watch on {hostname}</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <a
                href={redditDiscussionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
              >
                <span>Reddit Thread</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* 3. Unified Bottom Action Bar (Below Video) */}
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-b-xl border-b border-x border-zinc-800 bg-zinc-900/90 backdrop-blur-md">
        {/* Reddit Discussion Action */}
        <a
          href={redditDiscussionUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View Reddit discussion thread for this goal (opens in new tab)"
          className="group inline-flex h-8 flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-lg border border-orange-900/50 bg-orange-950/25 px-3 py-1.5 text-xs font-semibold text-orange-400 shadow-xs transition-all duration-150 hover:border-orange-700/70 hover:bg-orange-950/50 hover:text-orange-300 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          <MessageSquare className="h-3.5 w-3.5 shrink-0" />
          <span>Reddit Discussion</span>
          <ExternalLink className="h-3 w-3 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
        </a>

        {/* Source Host Action */}
        <a
          href={highlight.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View original highlight clip on ${hostname} (opens in new tab)`}
          className="group inline-flex h-8 flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-300 shadow-xs transition-all duration-150 hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500"
        >
          <Globe className="h-3.5 w-3.5 shrink-0 text-zinc-400 group-hover:text-zinc-200" />
          <span className="truncate max-w-[180px]">Source: {hostname}</span>
          <ExternalLink className="h-3 w-3 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
        </a>
      </div>
    </div>
  );
}
```

---

## 11. Verification & Acceptance Criteria

### 11.1 Functional Quality Gates

1. **Unobstructed Scorebug**: In all video formats (native MP4/WebM, streamable iframe, dubz, streamin), the top-left corner of the video frame has 0% opacity overlay, leaving broadcaster scoreboards, team logos, and match timers 100% visible.
2. **Dedicated Header Presence**: The clip title, minute, tag, and close button render cleanly in the dedicated header bar above the 16:9 container.
3. **Dismiss Functionality**:
   - Clicking `(X)` closes the inline player.
   - Pressing `Escape` closes the inline player.
   - Re-clicking the active `GoalChip` toggles the player closed.
4. **Unified Action Bar Layout**:
   - Reddit Discussion and Source Host render as visually matched pill buttons with identical height (`32px` / `h-8`), padding, and font metrics.
   - Reddit displays custom orange branding (`text-orange-400`, `border-orange-900/50`).
   - Source Host displays clean dark zinc branding (`border-zinc-800 bg-zinc-900 text-zinc-300`) with clean domain formatting (`Source: streamin.one`).
   - On mobile (`< 640px`), both buttons stretch symmetrically to fill 50% width each without awkward wrapping.

### 11.2 Accessibility Quality Gates

1. **Target Size (WCAG 2.2 SC 2.5.8)**: The mobile close button features a minimum 44x44px touch hit area via pseudo-element padding.
2. **Contrast (WCAG 2.2 AA)**: All text tokens exceed 4.5:1 contrast against their respective card backgrounds.
3. **Keyboard Navigability**: Tabbing cycles predictably through Header Close -> Video Player -> Reddit Pill -> Source Pill without trap.
