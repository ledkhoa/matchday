import { describe, it, expect, mock } from 'bun:test';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { MatchCard } from './MatchCard';
import type { MatchWithHighlights, Highlight } from '#/db/schema';

function makeTestMatch(highlights: Highlight[] = []): MatchWithHighlights {
  return {
    id: 'match-1',
    matchDate: '2026-09-09',
    teamHome: 'Arsenal',
    teamAway: 'Brighton',
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
});
