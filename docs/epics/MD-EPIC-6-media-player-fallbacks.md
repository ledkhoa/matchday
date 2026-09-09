# MD-EPIC-6: Inline Media Player & Domain Fallbacks

- **Key:** `MD-EPIC-6`
- **Status:** To Do
- **Target Sprint:** Sprint 3
- **Total Points:** 8 SP
- **Lead / Assignee:** TBD

---

## 🎯 Epic Overview

Deliver the core video consumption experience: an inline media player embedded directly within match cards with responsive aspect ratios, smooth transitions, external fallback links for unsupported domains, and direct shortcuts to the original Reddit discussion threads.

---

## 🎫 User Stories

### [MD-601] Inline HighlightPlayer Component with Responsive Aspect Ratio

- **Type:** Story
- **Estimation:** 3 SP
- **Priority:** Critical
- **Dependencies:** MD-503

#### User Story

> **As a** user,  
> **I want** to watch highlights inline inside the match card with responsive 16:9 scaling,  
> **So that** I don't get kicked out to third-party ad-heavy websites or lose my browsing position.

#### Technical Specifications

1. Implement `src/components/HighlightPlayer.tsx`:
   - Props:
     ```typescript
     interface HighlightPlayerProps {
       highlight: HighlightItem;
       onClose: () => void;
     }
     ```
   - Container layout:
     ```tsx
     <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black shadow-2xl border border-zinc-800 my-4">
       {/* Embed or Direct Video */}
     </div>
     ```
   - Dynamic render logic:
     - If `highlight.embedUrl`: render `<iframe>` with `allow="autoplay; fullscreen; picture-in-picture"` and `allowFullScreen`.
     - Direct video stream fallback: render `<video src={...} controls playsInline autoPlay className="w-full h-full object-contain" />`.
   - Top action bar:
     - Current goal title & minute.
     - Close button (`X` icon from `lucide-react`) to collapse player.

#### Acceptance Criteria

- [ ] Maintains strict 16:9 aspect ratio across mobile, tablet, and desktop without layout distortion.
- [ ] Video autoplays or is ready to play inline.
- [ ] Close button collapses player smoothly.

---

### [MD-602] Graceful Fallback for Unsupported Domains & Error States

- **Type:** Story
- **Estimation:** 2 SP
- **Priority:** High
- **Dependencies:** MD-601

#### User Story

> **As a** user,  
> **I want** a clean fallback button when an embed URL is unavailable or blocked,  
> **So that** I can still access the video clip on the source platform without encountering a broken UI.

#### Technical Specifications

1. Within `HighlightPlayer.tsx`:
   - If `!highlight.embedUrl`:
     - Display an informative fallback card inside the 16:9 container.
     - Centered CTA button: `Watch on Source Host (dubz / streamin) ↗` linking to `highlight.sourceUrl`.
     - Open in a new tab with `target="_blank" rel="noopener noreferrer"`.
   - Add iframe error handling or timeout indicator if the embed refuses connection.

#### Acceptance Criteria

- [ ] Broken or unsupported media embeds never display a white box or empty iframe.
- [ ] Direct source link opens properly in a new secure tab.

---

### [MD-603] MatchCard Media Controls & Reddit Discussion Link

- **Type:** Story
- **Estimation:** 3 SP
- **Priority:** Medium
- **Dependencies:** MD-503, MD-601

#### User Story

> **As a** user,  
> **I want** to see Reddit upvotes and have a one-click link to the `/r/soccer` thread,  
> **So that** I can read fan reactions, memes, and tactical analysis for any goal.

#### Technical Specifications

1. In `MatchCard.tsx` and `HighlightPlayer.tsx`:
   - Display Reddit upvote count formatted cleanly (e.g. `1240` -> `1.2k`, `14500` -> `14.5k`).
   - Add "Reddit Thread" button with external link icon (`MessageSquare` or `ExternalLink` from `lucide-react`).
   - Link opens `highlight.redditUrl` (`https://reddit.com` + permalink) in a new tab.

#### Acceptance Criteria

- [ ] Formatted upvote numbers match user expectations.
- [ ] Clicking the Reddit button navigates to the exact Reddit comments thread in a new tab.
