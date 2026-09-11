import { describe, it, expect, mock, beforeEach } from 'bun:test';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { MatchCard } from './MatchCard';
import type { MatchWithHighlights, Highlight } from '#/db/schema';
import {
  clearWatchHistory,
  markHighlightWatched,
} from '#/stores/watchHistoryStore';

function makeTestMatch(highlights: Highlight[] = []): MatchWithHighlights {
  return {
    id: 'match-1',
    matchDate: '2026-09-09',
    teamHome: 'Arsenal',
    teamAway: 'Brighton',
    externalId: null,
    competition: null,
    leagueLogo: null,
    teamHomeLogo: null,
    teamAwayLogo: null,
    kickoffTime: null,
    status: null,
    scoreHome: null,
    scoreAway: null,
    createdAt: 1694250000,
    updatedAt: 1694260000,
    highlights,
  };
}

function makeHighlight(
  id: string,
  minute: string,
  scorer: string,
  scoreHome: number,
  scoreAway: number,
): Highlight {
  return {
    id,
    matchId: 'match-1',
    title: `Arsenal [${scoreHome}] - ${scoreAway} Brighton - ${scorer} ${minute}`,
    scoreHome,
    scoreAway,
    scorer,
    minute,
    tag: null,
    embedUrl: `https://dubz.co/e/${id}`,
    sourceUrl: `https://dubz.co/c/${id}`,
    redditUrl: `/r/soccer/comments/${id}`,
    goalFingerprint: null,
    postedAt: 1694250000,
  };
}

describe('MatchCard component', () => {
  beforeEach(() => {
    clearWatchHistory();
  });

  it('renders team names, initials badges, and computed scoreline', () => {
    const highlights = [
      makeHighlight('hl-1', "14'", 'Saka', 1, 0),
      makeHighlight('hl-2', "38'", 'Mitoma', 1, 1),
      makeHighlight('hl-3', "68'", 'Havertz', 2, 1),
    ];
    const match = makeTestMatch(highlights);

    const { getByText } = render(
      React.createElement(MatchCard, {
        match,
        activeHighlightId: null,
        onSelectHighlight: () => {},
        onCloseHighlight: () => {},
      }),
    );

    expect(getByText('Arsenal')).toBeDefined();
    expect(getByText('Brighton')).toBeDefined();
    expect(getByText('ARS')).toBeDefined();
    expect(getByText('BHA')).toBeDefined();
    expect(getByText('2 - 1')).toBeDefined();
  });

  it('renders official scoreline (e.g. 0 - 0) when match has official scores and no highlights', () => {
    const match = {
      ...makeTestMatch([]),
      scoreHome: 0,
      scoreAway: 0,
      status: 'FT',
    };

    const { getByText } = render(
      React.createElement(MatchCard, {
        match,
        activeHighlightId: null,
        onSelectHighlight: () => {},
        onCloseHighlight: () => {},
      }),
    );

    expect(getByText('0 - 0')).toBeDefined();
  });

  it('renders goal chips in chronological order', () => {
    // Unsorted inputs
    const highlights = [
      makeHighlight('hl-3', "68'", 'Havertz', 2, 1),
      makeHighlight('hl-1', "14'", 'Saka', 1, 0),
      makeHighlight('hl-2', "38'", 'Mitoma', 1, 1),
    ];
    const match = makeTestMatch(highlights);

    const { container } = render(
      React.createElement(MatchCard, {
        match,
        activeHighlightId: null,
        onSelectHighlight: () => {},
        onCloseHighlight: () => {},
      }),
    );

    const chips = container.querySelectorAll('button[role="button"]');
    expect(chips.length).toBe(3);
    expect(chips[0].textContent).toContain('Saka');
    expect(chips[1].textContent).toContain('Mitoma');
    expect(chips[2].textContent).toContain('Havertz');
  });

  it('triggers onSelectHighlight when inactive chip is clicked', () => {
    const selectSpy = mock(() => {});
    const hl = makeHighlight('hl-1', "14'", 'Saka', 1, 0);
    const match = makeTestMatch([hl]);

    const { getByRole } = render(
      React.createElement(MatchCard, {
        match,
        activeHighlightId: null,
        onSelectHighlight: selectSpy,
        onCloseHighlight: () => {},
      }),
    );

    const chip = getByRole('button', { name: /Saka/i });
    fireEvent.click(chip);
    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(selectSpy).toHaveBeenCalledWith(hl);
  });

  it('triggers onCloseHighlight when active chip is clicked', () => {
    const closeSpy = mock(() => {});
    const hl = makeHighlight('hl-1', "14'", 'Saka', 1, 0);
    const match = makeTestMatch([hl]);

    const { getByRole } = render(
      React.createElement(MatchCard, {
        match,
        activeHighlightId: 'hl-1',
        onSelectHighlight: () => {},
        onCloseHighlight: closeSpy,
      }),
    );

    const chip = getByRole('button', { name: /Saka/i });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chip);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('renders HighlightPlayer when activeHighlightId matches a highlight in the match', () => {
    const hl = makeHighlight('hl-1', "14'", 'Saka', 1, 0);
    const match = makeTestMatch([hl]);

    const { container, getByRole } = render(
      React.createElement(MatchCard, {
        match,
        activeHighlightId: 'hl-1',
        onSelectHighlight: () => {},
        onCloseHighlight: () => {},
      }),
    );

    // Verify HighlightPlayer's aspect-video container is present
    const player = container.querySelector('.aspect-video');
    expect(player).not.toBeNull();
    expect(getByRole('button', { name: 'Close player' })).toBeDefined();
  });

  it('does not render HighlightPlayer when activeHighlightId is for another match', () => {
    const hl = makeHighlight('hl-1', "14'", 'Saka', 1, 0);
    const match = makeTestMatch([hl]);

    const { container } = render(
      React.createElement(MatchCard, {
        match,
        activeHighlightId: 'hl-other',
        onSelectHighlight: () => {},
        onCloseHighlight: () => {},
      }),
    );

    const player = container.querySelector('.aspect-video');
    expect(player).toBeNull();
  });

  describe('Competition branding, crests, and kickoff badges', () => {
    it('renders competition logo, name, club crests, and kickoff time badge', () => {
      const kickoffTime = Date.UTC(2026, 8, 10, 20, 0);
      const match: MatchWithHighlights = {
        ...makeTestMatch(),
        competition: 'Premier League',
        leagueLogo: 'https://example.com/epl.png',
        teamHomeLogo: 'https://example.com/ars.png',
        teamAwayLogo: 'https://example.com/bha.png',
        kickoffTime,
      };

      const { getByText, getByAltText, container } = render(
        React.createElement(MatchCard, {
          match,
          activeHighlightId: null,
          onSelectHighlight: () => {},
          onCloseHighlight: () => {},
        }),
      );

      // Competition
      expect(getByText('Premier League')).toBeDefined();
      const leagueImg = container.querySelector(
        'img[src="https://example.com/epl.png"]',
      );
      expect(leagueImg).not.toBeNull();
      expect(leagueImg?.getAttribute('alt')).toBe('');

      // Team crests
      const homeImg = getByAltText('Arsenal crest');
      expect(homeImg).toBeDefined();
      expect(homeImg.getAttribute('src')).toBe('https://example.com/ars.png');

      const awayImg = getByAltText('Brighton crest');
      expect(awayImg).toBeDefined();
      expect(awayImg.getAttribute('src')).toBe('https://example.com/bha.png');

      // Kickoff Badge
      expect(getByText(/Kickoff: \d{1,2}:\d{2} [AP]M/)).toBeDefined();
      expect(container.querySelector('svg')).not.toBeNull();
    });

    it('renders kickoff time badge with clock icon and formatted time', () => {
      const kickoffTime = Date.UTC(2026, 8, 10, 19, 45);
      const match: MatchWithHighlights = {
        ...makeTestMatch(),
        competition: 'Bundesliga',
        kickoffTime,
      };

      const { getByText, container } = render(
        React.createElement(MatchCard, {
          match,
          activeHighlightId: null,
          onSelectHighlight: () => {},
          onCloseHighlight: () => {},
        }),
      );

      expect(getByText(/Kickoff: \d{1,2}:\d{2} [AP]M/)).toBeDefined();
      expect(container.querySelector('svg')).not.toBeNull();
    });

    it('falls back to initials when logo URLs are null or empty string', () => {
      const match: MatchWithHighlights = {
        ...makeTestMatch(),
        teamHomeLogo: null,
        teamAwayLogo: '',
      };

      const { getByText, queryByAltText } = render(
        React.createElement(MatchCard, {
          match,
          activeHighlightId: null,
          onSelectHighlight: () => {},
          onCloseHighlight: () => {},
        }),
      );

      expect(getByText('ARS')).toBeDefined();
      expect(getByText('BHA')).toBeDefined();
      expect(queryByAltText('Arsenal crest')).toBeNull();
      expect(queryByAltText('Brighton crest')).toBeNull();
    });

    it('falls back to initials when club crest image triggers onError', () => {
      const match: MatchWithHighlights = {
        ...makeTestMatch(),
        teamHomeLogo: 'https://broken.link/ars.png',
        teamAwayLogo: 'https://example.com/bha.png',
      };

      const { getByAltText, getByText, queryByAltText } = render(
        React.createElement(MatchCard, {
          match,
          activeHighlightId: null,
          onSelectHighlight: () => {},
          onCloseHighlight: () => {},
        }),
      );

      const homeImg = getByAltText('Arsenal crest');
      expect(homeImg).toBeDefined();

      fireEvent.error(homeImg);

      expect(getByText('ARS')).toBeDefined();
      expect(queryByAltText('Arsenal crest')).toBeNull();
      // Away crest should remain unaffected
      expect(getByAltText('Brighton crest')).toBeDefined();
    });

    it('collapses MatchHeader completely when all header metadata is null', () => {
      const match: MatchWithHighlights = {
        ...makeTestMatch(),
        competition: null,
        leagueLogo: null,
        status: null,
        kickoffTime: null,
      };

      const { container } = render(
        React.createElement(MatchCard, {
          match,
          activeHighlightId: null,
          onSelectHighlight: () => {},
          onCloseHighlight: () => {},
        }),
      );

      // Scoreboard is the first child of article when MatchHeader collapses
      const article = container.querySelector('article');
      expect(article?.firstElementChild?.textContent).toContain('Arsenal');
    });

    it('renders competition only without kickoff badge when kickoffTime is absent', () => {
      const compOnlyMatch: MatchWithHighlights = {
        ...makeTestMatch(),
        competition: 'Champions League',
        kickoffTime: null,
      };

      const { getByText, container } = render(
        React.createElement(MatchCard, {
          match: compOnlyMatch,
          activeHighlightId: null,
          onSelectHighlight: () => {},
          onCloseHighlight: () => {},
        }),
      );

      expect(getByText('Champions League')).toBeDefined();
      expect(container.querySelector('svg')).toBeNull();
    });

    it('renders kickoff badge only when competition is absent', () => {
      const kickoffTime = Date.UTC(2026, 8, 10, 15, 0);
      const kickoffOnlyMatch: MatchWithHighlights = {
        ...makeTestMatch(),
        competition: null,
        kickoffTime,
      };

      const { getByText, queryByText } = render(
        React.createElement(MatchCard, {
          match: kickoffOnlyMatch,
          activeHighlightId: null,
          onSelectHighlight: () => {},
          onCloseHighlight: () => {},
        }),
      );

      expect(getByText(/Kickoff: \d{1,2}:\d{2} [AP]M/)).toBeDefined();
      expect(queryByText('Champions League')).toBeNull();
    });
  });

  describe('Watch History and GoalChip states', () => {
    it('applies State A container styling when unwatched highlights exist', () => {
      const highlights = [makeHighlight('hl-1', "14'", 'Saka', 1, 0)];
      const match = makeTestMatch(highlights);

      const { container } = render(
        React.createElement(MatchCard, {
          match,
          activeHighlightId: null,
          onSelectHighlight: () => {},
          onCloseHighlight: () => {},
        }),
      );

      const article = container.querySelector('article');
      expect(article?.className).toContain('border-yellow-500/30');
      expect(article?.className).toContain('bg-zinc-900/85');
    });

    it('applies State B container styling when all highlights are watched', () => {
      markHighlightWatched('hl-1');
      markHighlightWatched('hl-2');

      const highlights = [
        makeHighlight('hl-1', "14'", 'Saka', 1, 0),
        makeHighlight('hl-2', "38'", 'Mitoma', 1, 1),
      ];
      const match = makeTestMatch(highlights);

      const { container } = render(
        React.createElement(MatchCard, {
          match,
          activeHighlightId: null,
          onSelectHighlight: () => {},
          onCloseHighlight: () => {},
        }),
      );

      const article = container.querySelector('article');
      expect(article?.className).toContain('border-zinc-800/60');
      expect(article?.className).toContain('bg-zinc-900/50');
    });

    it('applies State C container styling when match has 0 highlights', () => {
      const match = makeTestMatch([]);

      const { container } = render(
        React.createElement(MatchCard, {
          match,
          activeHighlightId: null,
          onSelectHighlight: () => {},
          onCloseHighlight: () => {},
        }),
      );

      const article = container.querySelector('article');
      expect(article?.className).toContain('border-zinc-800');
      expect(article?.className).toContain('bg-zinc-900/80');
      expect(article?.className).not.toContain('border-yellow-500/30');
    });

    it('renders GoalChip in unwatched, active, and watched states with correct accessibility labels', () => {
      markHighlightWatched('hl-watched');

      const hlUnwatched = makeHighlight('hl-unwatched', "14'", 'Saka', 1, 0);
      const hlActive = makeHighlight('hl-active', "38'", 'Mitoma', 1, 1);
      const hlWatched = makeHighlight('hl-watched', "68'", 'Havertz', 2, 1);

      const match = makeTestMatch([hlUnwatched, hlActive, hlWatched]);

      const { getByRole } = render(
        React.createElement(MatchCard, {
          match,
          activeHighlightId: 'hl-active',
          onSelectHighlight: () => {},
          onCloseHighlight: () => {},
        }),
      );

      // Unwatched chip
      const unwatchedBtn = getByRole('button', { name: /Saka.*Unwatched/i });
      expect(unwatchedBtn.getAttribute('aria-pressed')).toBe('false');
      expect(unwatchedBtn.getAttribute('aria-label')).toContain('Unwatched');
      expect(unwatchedBtn.className).toContain('border-zinc-700/80');

      // Active chip
      const activeBtn = getByRole('button', {
        name: /Currently playing goal: Mitoma 38'/i,
      });
      expect(activeBtn.getAttribute('aria-pressed')).toBe('true');
      expect(activeBtn.className).toContain('border-yellow-500');
      expect(activeBtn.className).toContain('bg-blue-950/70');

      // Watched chip
      const watchedBtn = getByRole('button', { name: /Havertz.*Watched/i });
      expect(watchedBtn.getAttribute('aria-pressed')).toBe('false');
      expect(watchedBtn.getAttribute('aria-label')).toContain('Watched');
      expect(watchedBtn.className).toContain('border-zinc-800/80');
      expect(watchedBtn.className).toContain('bg-zinc-950/50');
    });

    it('renders vivid tags when unwatched and subdued tags when watched', () => {
      const penaltyUnwatched = {
        ...makeHighlight('hl-pen-unwatched', "10'", 'Salah', 1, 0),
        tag: 'Penalty',
      };
      const greatGoalWatched = {
        ...makeHighlight('hl-gg-watched', "45'", 'Son', 1, 1),
        tag: 'Great Goal',
      };

      markHighlightWatched('hl-gg-watched');

      const match = makeTestMatch([penaltyUnwatched, greatGoalWatched]);

      const { getByText } = render(
        React.createElement(MatchCard, {
          match,
          activeHighlightId: null,
          onSelectHighlight: () => {},
          onCloseHighlight: () => {},
        }),
      );

      const unwatchedTag = getByText('Penalty');
      expect(unwatchedTag.className).toContain('border-amber-800/60');
      expect(unwatchedTag.className).toContain('bg-amber-950/50');

      const watchedTag = getByText('Great Goal');
      expect(watchedTag.className).toContain('border-purple-900/40');
      expect(watchedTag.className).toContain('bg-purple-950/20');
    });
  });
});
