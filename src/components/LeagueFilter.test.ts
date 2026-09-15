import { describe, it, expect, mock } from 'bun:test';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { LeagueFilter, type LeagueCount } from './LeagueFilter';

describe('LeagueFilter', () => {
  const mockAvailableLeagues: LeagueCount[] = [
    {
      name: 'UEFA Champions League',
      logo: 'https://example.com/ucl.png',
      count: 6,
    },
    {
      name: 'Major League Soccer',
      logo: 'https://example.com/mls.png',
      count: 9,
    },
  ];

  it('renders "All" button with total match count', () => {
    const onSelect = mock();
    const { getByRole } = render(
      React.createElement(LeagueFilter, {
        totalMatches: 15,
        availableLeagues: mockAvailableLeagues,
        onSelectLeague: onSelect,
      }),
    );

    const allButton = getByRole('button', { name: /all 15/i });
    expect(allButton).toBeDefined();
    expect(allButton.getAttribute('aria-pressed')).toBe('true');
  });

  it('renders available league chips with counts and logos', () => {
    const onSelect = mock();
    const { getByRole } = render(
      React.createElement(LeagueFilter, {
        totalMatches: 15,
        availableLeagues: mockAvailableLeagues,
        onSelectLeague: onSelect,
      }),
    );

    const uclButton = getByRole('button', {
      name: /uefa champions league 6/i,
    });
    const mlsButton = getByRole('button', {
      name: /major league soccer 9/i,
    });

    expect(uclButton).toBeDefined();
    expect(mlsButton).toBeDefined();
    expect(uclButton.getAttribute('aria-pressed')).toBe('false');
  });

  it('calls onSelectLeague with league name when a league chip is clicked', () => {
    const onSelect = mock();
    const { getByRole } = render(
      React.createElement(LeagueFilter, {
        totalMatches: 15,
        availableLeagues: mockAvailableLeagues,
        onSelectLeague: onSelect,
      }),
    );

    const uclButton = getByRole('button', {
      name: /uefa champions league 6/i,
    });
    fireEvent.click(uclButton);

    expect(onSelect).toHaveBeenCalledWith('UEFA Champions League');
  });

  it('calls onSelectLeague with undefined when clicking the currently active league chip (toggle off)', () => {
    const onSelect = mock();
    const { getByRole } = render(
      React.createElement(LeagueFilter, {
        activeLeague: 'UEFA Champions League',
        totalMatches: 15,
        availableLeagues: mockAvailableLeagues,
        onSelectLeague: onSelect,
      }),
    );

    const uclButton = getByRole('button', {
      name: /uefa champions league 6/i,
    });
    expect(uclButton.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(uclButton);
    expect(onSelect).toHaveBeenCalledWith(undefined);
  });

  it('calls onSelectLeague with undefined when clicking "All"', () => {
    const onSelect = mock();
    const { getByRole } = render(
      React.createElement(LeagueFilter, {
        activeLeague: 'Major League Soccer',
        totalMatches: 15,
        availableLeagues: mockAvailableLeagues,
        onSelectLeague: onSelect,
      }),
    );

    const allButton = getByRole('button', { name: /all 15/i });
    expect(allButton.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(allButton);
    expect(onSelect).toHaveBeenCalledWith(undefined);
  });

  it('renders custom active pill when filtered to a league with 0 matches on this date', () => {
    const onSelect = mock();
    const { getByRole } = render(
      React.createElement(LeagueFilter, {
        activeLeague: 'Premier League',
        totalMatches: 15,
        availableLeagues: mockAvailableLeagues,
        onSelectLeague: onSelect,
      }),
    );

    const customPill = getByRole('button', {
      name: /premier league 0/i,
    });
    expect(customPill).toBeDefined();
    expect(customPill.getAttribute('aria-pressed')).toBe('true');

    // Clicking it clears the filter
    fireEvent.click(customPill);
    expect(onSelect).toHaveBeenCalledWith(undefined);
  });

  it('opens popover with all 15 supported leagues and allows selection', () => {
    const onSelect = mock();
    const { getByLabelText, getByText } = render(
      React.createElement(LeagueFilter, {
        totalMatches: 15,
        availableLeagues: mockAvailableLeagues,
        onSelectLeague: onSelect,
      }),
    );

    const trigger = getByLabelText('View all supported competitions');
    expect(getByText('All Competitions')).toBeDefined();
    fireEvent.click(trigger);

    expect(getByText('Supported Competitions')).toBeDefined();
    expect(getByText('Premier League')).toBeDefined();
    expect(getByText('Championship')).toBeDefined();
    expect(getByText('Bundesliga')).toBeDefined();
    expect(getByText('La Liga')).toBeDefined();
    expect(getByText('Serie A')).toBeDefined();

    const plOption = getByText('Premier League');
    fireEvent.click(plOption);

    expect(onSelect).toHaveBeenCalledWith('Premier League');
  });

  it('displays correct count for League Cup in supported competitions dropdown', () => {
    const onSelect = mock();
    const { getByLabelText, getAllByText } = render(
      React.createElement(LeagueFilter, {
        totalMatches: 5,
        availableLeagues: [
          {
            name: 'League Cup',
            logo: 'https://example.com/leaguecup.png',
            count: 5,
          },
        ],
        onSelectLeague: onSelect,
      }),
    );

    const trigger = getByLabelText('View all supported competitions');
    fireEvent.click(trigger);

    const leagueCupElements = getAllByText('League Cup');
    expect(leagueCupElements.length).toBeGreaterThanOrEqual(2);
  });
});
