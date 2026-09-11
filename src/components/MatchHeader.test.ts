import { describe, it, expect } from 'bun:test';
import React from 'react';
import { render } from '@testing-library/react';
import { MatchHeader } from './MatchHeader';

describe('MatchHeader component', () => {
  it('renders competition logo, competition name, and kickoff time badge', () => {
    const kickoffTime = Date.UTC(2026, 8, 10, 20, 0);
    const { getByText, container } = render(
      React.createElement(MatchHeader, {
        competition: 'UEFA Champions League',
        leagueLogo: 'https://example.com/ucl.png',
        kickoffTime,
      }),
    );

    expect(getByText('UEFA Champions League')).toBeDefined();
    expect(getByText(/Kickoff: \d{1,2}:\d{2} [AP]M/)).toBeDefined();

    const logo = container.querySelector('img');
    expect(logo).not.toBeNull();
    expect(logo?.getAttribute('src')).toBe('https://example.com/ucl.png');
    expect(logo?.getAttribute('alt')).toBe('');
    expect(logo?.getAttribute('aria-hidden')).toBe('true');

    const clockIcon = container.querySelector('svg');
    expect(clockIcon).not.toBeNull();
  });

  it('renders kickoff time badge with clock icon and formatted local kickoff time', () => {
    const kickoffTime = Date.UTC(2026, 8, 10, 19, 45);
    const { getByText, container } = render(
      React.createElement(MatchHeader, {
        competition: 'Premier League',
        kickoffTime,
      }),
    );

    expect(getByText(/Kickoff: \d{1,2}:\d{2} [AP]M/)).toBeDefined();
    const clockIcon = container.querySelector('svg');
    expect(clockIcon).not.toBeNull();
  });

  it('formats kickoff time using explicit timeZone prop', () => {
    // 19:00 UTC = 12:00 PM PDT in America/Los_Angeles
    const kickoffTime = Date.UTC(2026, 8, 10, 19, 0);
    const { getByText } = render(
      React.createElement(MatchHeader, {
        competition: 'UEFA Champions League',
        kickoffTime,
        timeZone: 'America/Los_Angeles',
      }),
    );

    expect(getByText('Kickoff: 12:00 PM')).toBeDefined();
  });

  it('collapses cleanly to null when neither competition nor kickoff time is available', () => {
    const { container } = render(
      React.createElement(MatchHeader, {
        competition: null,
        leagueLogo: null,
        kickoffTime: null,
      }),
    );

    expect(container.firstChild).toBeNull();
  });

  it('collapses cleanly to null when strings are empty or whitespace only and kickoffTime is absent', () => {
    const { container } = render(
      React.createElement(MatchHeader, {
        competition: '   ',
        leagueLogo: '',
        kickoffTime: null,
      }),
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders competition only without kickoff badge when kickoffTime is absent', () => {
    const { getByText, container } = render(
      React.createElement(MatchHeader, {
        competition: 'Eredivisie',
        kickoffTime: null,
      }),
    );

    expect(getByText('Eredivisie')).toBeDefined();
    const clockIcon = container.querySelector('svg');
    expect(clockIcon).toBeNull();
  });

  it('renders kickoff badge only when competition is absent', () => {
    const kickoffTime = Date.UTC(2026, 8, 10, 15, 30);
    const { getByText, container } = render(
      React.createElement(MatchHeader, {
        competition: null,
        kickoffTime,
      }),
    );

    expect(getByText(/Kickoff: \d{1,2}:\d{2} [AP]M/)).toBeDefined();
    const img = container.querySelector('img');
    expect(img).toBeNull();
  });

  it('applies custom className to the container', () => {
    const { container } = render(
      React.createElement(MatchHeader, {
        competition: 'FA Cup',
        className: 'custom-header-class',
      }),
    );

    expect(
      container.firstElementChild?.classList.contains('custom-header-class'),
    ).toBe(true);
  });

  describe('Watch status badges', () => {
    it('renders unwatched badge with pulsing dot when unwatched highlights exist', () => {
      const { getByTestId, getByText } = render(
        React.createElement(MatchHeader, {
          competition: 'Premier League',
          watchStatus: {
            total: 3,
            watchedCount: 1,
            hasUnwatched: true,
            isAllWatched: false,
          },
        }),
      );

      const badge = getByTestId('watch-badge-unwatched');
      expect(badge).toBeDefined();
      expect(getByText('1/3 watched')).toBeDefined();

      const pulsingDot = badge.querySelector('.animate-pulse');
      expect(pulsingDot).not.toBeNull();
    });

    it('renders all-watched badge with checkmark icon when all highlights are watched', () => {
      const { getByTestId, getByText, container } = render(
        React.createElement(MatchHeader, {
          competition: 'La Liga',
          watchStatus: {
            total: 2,
            watchedCount: 2,
            hasUnwatched: false,
            isAllWatched: true,
          },
        }),
      );

      const badge = getByTestId('watch-badge-all-watched');
      expect(badge).toBeDefined();
      expect(getByText('2/2 watched')).toBeDefined();

      // Checkmark icon rendered inside badge
      const icon = badge.querySelector('svg');
      expect(icon).not.toBeNull();
      expect(
        container.querySelector('[data-testid="watch-badge-unwatched"]'),
      ).toBeNull();
    });

    it('omits watch badge completely when total highlights is 0', () => {
      const { queryByTestId } = render(
        React.createElement(MatchHeader, {
          competition: 'Serie A',
          watchStatus: {
            total: 0,
            watchedCount: 0,
            hasUnwatched: false,
            isAllWatched: false,
          },
        }),
      );

      expect(queryByTestId('watch-badge-unwatched')).toBeNull();
      expect(queryByTestId('watch-badge-all-watched')).toBeNull();
    });

    it('renders watch badge even when competition and kickoff are null', () => {
      const { getByTestId } = render(
        React.createElement(MatchHeader, {
          competition: null,
          kickoffTime: null,
          watchStatus: {
            total: 1,
            watchedCount: 0,
            hasUnwatched: true,
            isAllWatched: false,
          },
        }),
      );

      expect(getByTestId('watch-badge-unwatched')).toBeDefined();
    });
  });

  describe('Match status vs kickoff precedence', () => {
    it('renders Full Time badge with emerald indicator when status is FT', () => {
      const { getByTestId, getByText, queryByTestId } = render(
        React.createElement(MatchHeader, {
          competition: 'Premier League',
          status: 'FT',
          kickoffTime: Date.UTC(2026, 8, 10, 19, 0),
        }),
      );

      const ftBadge = getByTestId('match-status-full-time');
      expect(ftBadge).toBeDefined();
      expect(getByText('Full Time')).toBeDefined();
      expect(queryByTestId('match-kickoff-time')).toBeNull();
    });

    it('renders Full Time (ET) badge when status is AET', () => {
      const { getByTestId, getByText } = render(
        React.createElement(MatchHeader, {
          competition: 'UEFA Champions League',
          status: 'AET',
        }),
      );

      expect(getByTestId('match-status-full-time')).toBeDefined();
      expect(getByText('Full Time (ET)')).toBeDefined();
    });

    it('renders Full Time (PEN) badge when status is PEN', () => {
      const { getByTestId, getByText } = render(
        React.createElement(MatchHeader, {
          competition: 'FA Cup',
          status: 'PEN',
        }),
      );

      expect(getByTestId('match-status-full-time')).toBeDefined();
      expect(getByText('Full Time (PEN)')).toBeDefined();
    });

    it('renders Kickoff badge when status is not full-time (e.g. NS)', () => {
      const { getByTestId, getByText, queryByTestId } = render(
        React.createElement(MatchHeader, {
          competition: 'La Liga',
          status: 'NS',
          kickoffTime: Date.UTC(2026, 8, 10, 19, 0),
        }),
      );

      expect(queryByTestId('match-status-full-time')).toBeNull();
      expect(getByTestId('match-kickoff-time')).toBeDefined();
      expect(getByText(/Kickoff: \d{1,2}:\d{2} [AP]M/)).toBeDefined();
    });
  });
});
