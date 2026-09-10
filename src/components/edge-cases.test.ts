import { describe, it, expect, mock, beforeEach } from 'bun:test';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { DateNav } from './DateNav';
import { MatchCard } from './MatchCard';
import { HighlightPlayer } from './HighlightPlayer';
import { EmptyState } from './EmptyState';
import {
  computeMatchScore,
  formatGoalScore,
  getTagCategory,
  getTeamInitials,
} from '#/lib/formatters';
import type { MatchWithHighlights, Highlight } from '#/db/schema';

// Mock @tanstack/react-router
const mockNavigate = mock(() => {});
mock.module('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

function makeHighlight(partial: Partial<Highlight> = {}): Highlight {
  return {
    id: 'hl-edge-1',
    matchId: 'match-edge-1',
    title: 'Arsenal [1] - 0 Chelsea - Saka 14 (Penalty)',
    scoreHome: 1,
    scoreAway: 0,
    scorer: 'Saka',
    minute: "14'",
    tag: 'Penalty',
    embedUrl: 'https://dubz.co/e/edge1',
    sourceUrl: 'https://dubz.co/c/edge1',
    redditUrl: '/r/soccer/comments/edge1/saka_goal',
    goalFingerprint: null,
    postedAt: 1694260000,
    ...partial,
  };
}

function makeMatch(
  highlights: Highlight[] = [],
  partial: Partial<MatchWithHighlights> = {},
): MatchWithHighlights {
  return {
    id: 'match-edge-1',
    matchDate: '2026-09-09',
    teamHome: 'Arsenal',
    teamAway: 'Chelsea',
    createdAt: 1694250000,
    updatedAt: 1694260000,
    highlights,
    ...partial,
  };
}

describe('Epic 5 & 6 Edge Cases QA Suite', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  describe('1. DateNav Edge Cases', () => {
    it('handles leap year boundaries correctly when navigating previous day', () => {
      // March 1, 2024 -> leap day Feb 29, 2024
      const { getByRole } = render(
        React.createElement(DateNav, { currentDate: '2024-03-01' }),
      );
      const prevBtn = getByRole('button', {
        name: /Previous day, Thursday, February 29, 2024/i,
      });
      fireEvent.click(prevBtn);
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/date/$date',
        params: { date: '2024-02-29' },
      });
    });

    it('handles year rollover boundaries correctly when navigating previous day', () => {
      // January 1, 2026 -> December 31, 2025
      const { getByRole } = render(
        React.createElement(DateNav, { currentDate: '2026-01-01' }),
      );
      const prevBtn = getByRole('button', {
        name: /Previous day, Wednesday, December 31, 2025/i,
      });
      fireEvent.click(prevBtn);
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/date/$date',
        params: { date: '2025-12-31' },
      });
    });

    it('renders both desktop long date and mobile short date labels in calendar trigger', () => {
      const { container } = render(
        React.createElement(DateNav, { currentDate: '2026-09-09' }),
      );
      const calendarTrigger = container.querySelector(
        'button[aria-label="Select date from calendar"]',
      );
      const desktopLabel = calendarTrigger?.querySelector(
        '.hidden.sm\\:inline',
      );
      const mobileLabel = calendarTrigger?.querySelector('.inline.sm\\:hidden');

      expect(desktopLabel?.textContent).toBe('Wednesday, September 9, 2026');
      expect(mobileLabel?.textContent).toBe('Wed, Sep 9');
    });

    it('renders disabled Next button when currentDate is already in the future', () => {
      const { getByRole } = render(
        React.createElement(DateNav, { currentDate: '2099-01-01' }),
      );
      const nextBtn = getByRole('button', { name: /Next day/i });
      expect(nextBtn.hasAttribute('disabled')).toBe(true);
      fireEvent.click(nextBtn);
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('2. Formatter Edge Cases', () => {
    it('computeMatchScore handles highlights with all-null scores gracefully', () => {
      const highlights = [
        makeHighlight({ scoreHome: null, scoreAway: null }),
        makeHighlight({ scoreHome: null, scoreAway: null }),
      ];
      expect(computeMatchScore(highlights)).toBeNull();
    });

    it('computeMatchScore extracts the latest non-null score even if subsequent highlights lack scores', () => {
      const highlights = [
        makeHighlight({ scoreHome: 1, scoreAway: 0 }),
        makeHighlight({ scoreHome: 2, scoreAway: 1 }),
        makeHighlight({ scoreHome: null, scoreAway: null }),
      ];
      expect(computeMatchScore(highlights)).toEqual({ home: 2, away: 1 });
    });

    it('formatGoalScore handles complex multi-goal flow and own goals', () => {
      const h1 = makeHighlight({ scoreHome: 1, scoreAway: 0 });
      const h2 = makeHighlight({ scoreHome: 2, scoreAway: 0 });
      const h3 = makeHighlight({ scoreHome: 2, scoreAway: 1 });
      const h4 = makeHighlight({ scoreHome: 2, scoreAway: 2 });
      const h5 = makeHighlight({ scoreHome: 3, scoreAway: 2 });

      expect(formatGoalScore(h1)).toBe('[1] - 0');
      expect(formatGoalScore(h2, h1)).toBe('[2] - 0');
      expect(formatGoalScore(h3, h2)).toBe('2 - [1]');
      expect(formatGoalScore(h4, h3)).toBe('2 - [2]');
      expect(formatGoalScore(h5, h4)).toBe('[3] - 2');
    });

    it('getTagCategory handles varied casing, abbreviations, and composite tags', () => {
      expect(getTagCategory('PENALTY')).toBe('penalty');
      expect(getTagCategory('(P)')).toBe('penalty');
      expect(getTagCategory('great strike')).toBe('great_goal');
      expect(getTagCategory('Wonder goal')).toBe('great_goal');
      expect(getTagCategory('og')).toBe('own_goal');
      expect(getTagCategory('(Own Goal)')).toBe('own_goal');
      expect(getTagCategory('direct corner')).toBe('standard');
      expect(getTagCategory(null)).toBe('standard');
      expect(getTagCategory(undefined)).toBe('standard');
    });

    it('getTeamInitials derives fallback initials for single, double, and triple word names', () => {
      // Known club aliases
      expect(getTeamInitials('Arsenal')).toBe('ARS');
      expect(getTeamInitials('Borussia Dortmund')).toBe('BVB');
      expect(getTeamInitials('Paris Saint-Germain')).toBe('PSG');
      expect(getTeamInitials('Juventus')).toBe('JUV');

      // Derived 2-word teams
      expect(getTeamInitials('Aston Lions')).toBe('AL');
      expect(getTeamInitials('Inter Miami')).toBe('IM');

      // Derived 3-word teams
      expect(getTeamInitials('Red Star Belgrade')).toBe('RSB');

      // Derived single-word teams
      expect(getTeamInitials('Valencia')).toBe('VAL');
      expect(getTeamInitials('Ajax')).toBe('AJA');
      expect(getTeamInitials('Bo')).toBe('BO');
    });
  });

  describe('3. MatchCard Edge Cases', () => {
    it('renders "VS" scoreline when match has zero highlights', () => {
      const match = makeMatch([]);
      const { getByText } = render(
        React.createElement(MatchCard, {
          match,
          activeHighlightId: null,
          onSelectHighlight: () => {},
          onCloseHighlight: () => {},
        }),
      );
      expect(getByText('VS')).toBeDefined();
    });

    it('renders highlight chips with null scorer or minute gracefully', () => {
      const hl = makeHighlight({
        scorer: null,
        minute: null,
        tag: null,
        goalFingerprint: null,
      });
      const match = makeMatch([hl]);
      const { getByRole } = render(
        React.createElement(MatchCard, {
          match,
          activeHighlightId: null,
          onSelectHighlight: () => {},
          onCloseHighlight: () => {},
        }),
      );
      const chip = getByRole('button');
      expect(chip.textContent).toContain('Goal');
    });

    it('renders goal tags with appropriate category badges', () => {
      const hl1 = makeHighlight({ id: 'h1', tag: 'Penalty' });
      const hl2 = makeHighlight({ id: 'h2', tag: 'Great Goal' });
      const hl3 = makeHighlight({ id: 'h3', tag: 'OG' });
      const hl4 = makeHighlight({ id: 'h4', tag: 'Volley' });
      const match = makeMatch([hl1, hl2, hl3, hl4]);

      const { getByText } = render(
        React.createElement(MatchCard, {
          match,
          activeHighlightId: null,
          onSelectHighlight: () => {},
          onCloseHighlight: () => {},
        }),
      );

      expect(getByText('Penalty')).toBeDefined();
      expect(getByText('Great Goal')).toBeDefined();
      expect(getByText('OG')).toBeDefined();
      expect(getByText('Volley')).toBeDefined();
    });

    it('toggles playback off when active highlight is clicked again', () => {
      const selectSpy = mock(() => {});
      const closeSpy = mock(() => {});
      const hl = makeHighlight({ id: 'hl-toggle' });
      const match = makeMatch([hl]);

      const { getByRole } = render(
        React.createElement(MatchCard, {
          match,
          activeHighlightId: 'hl-toggle',
          onSelectHighlight: selectSpy,
          onCloseHighlight: closeSpy,
        }),
      );

      const activeChip = getByRole('button', { name: /Saka/i });
      expect(activeChip.getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(activeChip);

      expect(closeSpy).toHaveBeenCalledTimes(1);
      expect(selectSpy).not.toHaveBeenCalled();
    });
  });

  describe('4. HighlightPlayer Multi-Engine & Fallback Edge Cases', () => {
    it('guarantees 16:9 aspect ratio container across all media engines and fallback UI', () => {
      const engines = [
        {
          name: 'direct video',
          hl: makeHighlight({
            sourceUrl: 'https://v.redd.it/123',
            embedUrl: null,
          }),
        },
        {
          name: 'iframe embed',
          hl: makeHighlight({
            sourceUrl: 'https://streamin.one/v/abc',
            embedUrl: 'https://streamin.one/e/abc',
          }),
        },
        {
          name: 'fallback ui',
          hl: makeHighlight({
            sourceUrl: 'https://tiktok.com/@clip',
            embedUrl: null,
          }),
        },
      ];

      for (const engine of engines) {
        const { container, unmount } = render(
          React.createElement(HighlightPlayer, {
            highlight: engine.hl,
            onClose: () => {},
          }),
        );
        const box = container.querySelector('.aspect-video');
        expect(box).not.toBeNull();
        expect(box?.className).toContain('aspect-video');
        expect(box?.className).toContain('w-full');
        unmount();
      }
    });

    it('resolves streamff.com and caulse.com to responsive iframes', () => {
      const streamffHl = makeHighlight({
        sourceUrl: 'https://streamff.com/v/test123',
        embedUrl: null,
      });
      const { container: c1, unmount: u1 } = render(
        React.createElement(HighlightPlayer, {
          highlight: streamffHl,
          onClose: () => {},
        }),
      );
      const iframe1 = c1.querySelector('iframe');
      expect(iframe1).not.toBeNull();
      expect(iframe1?.getAttribute('src')).toBe(
        'https://streamff.com/e/test123',
      );
      u1();

      const caulseHl = makeHighlight({
        sourceUrl: 'https://caulse.com/v/clip99',
        embedUrl: null,
      });
      const { container: c2, unmount: u2 } = render(
        React.createElement(HighlightPlayer, {
          highlight: caulseHl,
          onClose: () => {},
        }),
      );
      const iframe2 = c2.querySelector('iframe');
      expect(iframe2).not.toBeNull();
      expect(iframe2?.getAttribute('src')).toBe('https://caulse.com/e/clip99');
      u2();
    });

    it('renders fallback card with both CTAs for blocked or unsupported hosts', () => {
      const unsupportedHl = makeHighlight({
        sourceUrl: 'https://streamja.com/xyz',
        embedUrl: null,
        redditUrl: '/r/soccer/comments/xyz/goal',
      });

      const { getByText, getByRole } = render(
        React.createElement(HighlightPlayer, {
          highlight: unsupportedHl,
          onClose: () => {},
        }),
      );

      expect(getByText('Direct Playback Unavailable')).toBeDefined();
      expect(
        getByText(
          'This hosting service does not support inline playback. You can watch the clip directly on the source host.',
        ),
      ).toBeDefined();

      const watchBtn = getByRole('link', { name: /Watch on Source Host/i });
      expect(watchBtn.getAttribute('href')).toBe('https://streamja.com/xyz');

      const redditBtn = getByRole('link', { name: /Reddit Thread/i });
      expect(redditBtn.getAttribute('href')).toBe(
        'https://reddit.com/r/soccer/comments/xyz/goal',
      );
    });

    it('normalizes relative redditUrl with leading slash to https://reddit.com', () => {
      const hl = makeHighlight({
        redditUrl: '/r/soccer/comments/abc123/goal_thread',
      });
      const { getByRole } = render(
        React.createElement(HighlightPlayer, {
          highlight: hl,
          onClose: () => {},
        }),
      );

      const link = getByRole('link', { name: /Reddit Discussion/i });
      expect(link.getAttribute('href')).toBe(
        'https://reddit.com/r/soccer/comments/abc123/goal_thread',
      );
    });

    it('preserves already fully qualified redditUrl starting with https://', () => {
      const hl = makeHighlight({
        redditUrl:
          'https://www.reddit.com/r/soccer/comments/abc123/goal_thread',
      });
      const { getByRole } = render(
        React.createElement(HighlightPlayer, {
          highlight: hl,
          onClose: () => {},
        }),
      );

      const link = getByRole('link', { name: /Reddit Discussion/i });
      expect(link.getAttribute('href')).toBe(
        'https://www.reddit.com/r/soccer/comments/abc123/goal_thread',
      );
    });

    it('extracts clean source host name for the footer bar', () => {
      const hl = makeHighlight({
        sourceUrl: 'https://www.dubz.co/c/special_goal_123',
        embedUrl: 'https://dubz.co/e/special_goal_123',
      });
      const { getByText } = render(
        React.createElement(HighlightPlayer, {
          highlight: hl,
          onClose: () => {},
        }),
      );
      expect(getByText('Source: dubz.co')).toBeDefined();
    });
  });

  describe('5. EmptyState Edge Cases', () => {
    it('has accessible region role and label', () => {
      const { getByRole } = render(
        React.createElement(EmptyState, { date: '2026-09-09' }),
      );
      const region = getByRole('region', { name: 'No matches found' });
      expect(region).toBeDefined();
    });

    it('provides external link to r/soccer with security attributes', () => {
      const { getByRole } = render(
        React.createElement(EmptyState, { date: '2026-09-09' }),
      );
      const redditLink = getByRole('link', { name: /Visit r\/soccer/i });
      expect(redditLink.getAttribute('href')).toBe(
        'https://reddit.com/r/soccer',
      );
      expect(redditLink.getAttribute('target')).toBe('_blank');
      expect(redditLink.getAttribute('rel')).toContain('noopener');
      expect(redditLink.getAttribute('rel')).toContain('noreferrer');
    });

    it('calls custom onJumpToToday callback if provided', () => {
      const customJump = mock(() => {});
      const { getByRole } = render(
        React.createElement(EmptyState, {
          date: '2026-09-09',
          onJumpToToday: customJump,
        }),
      );
      const jumpBtn = getByRole('button', { name: /Jump to Today/i });
      fireEvent.click(jumpBtn);
      expect(customJump).toHaveBeenCalledTimes(1);
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
