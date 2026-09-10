import { describe, it, expect } from 'bun:test';
import React from 'react';
import { render } from '@testing-library/react';
import { MatchHeader } from './MatchHeader';

describe('MatchHeader component', () => {
  it('renders competition logo, competition name, and FT status badge', () => {
    const { getByText, container } = render(
      React.createElement(MatchHeader, {
        competition: 'Premier League',
        leagueLogo: 'https://example.com/epl.png',
        status: 'FT',
      }),
    );

    expect(getByText('Premier League')).toBeDefined();
    expect(getByText('FT')).toBeDefined();

    const logo = container.querySelector('img');
    expect(logo).not.toBeNull();
    expect(logo?.getAttribute('src')).toBe('https://example.com/epl.png');
    expect(logo?.getAttribute('alt')).toBe('');
    expect(logo?.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders live in-play badge with pulsing dot for 2H', () => {
    const { getByText, container } = render(
      React.createElement(MatchHeader, {
        competition: 'La Liga',
        status: '2H',
      }),
    );

    expect(getByText('2nd Half')).toBeDefined();
    const pingDot = container.querySelector('.animate-ping');
    expect(pingDot).not.toBeNull();
  });

  it('renders live in-play badge for 1H and LIVE', () => {
    const { getByText } = render(
      React.createElement(MatchHeader, {
        competition: 'Champions League',
        status: '1H',
      }),
    );
    expect(getByText('1st Half')).toBeDefined();

    const { getByText: getLive } = render(
      React.createElement(MatchHeader, {
        competition: 'Champions League',
        status: 'LIVE',
      }),
    );
    expect(getLive('LIVE')).toBeDefined();
  });

  it('renders half-time badge for HT', () => {
    const { getByText } = render(
      React.createElement(MatchHeader, {
        competition: 'Serie A',
        status: 'HT',
      }),
    );

    expect(getByText('HT')).toBeDefined();
  });

  it('renders upcoming badge with clock icon and formatted UTC kickoff time', () => {
    const kickoffTime = Date.UTC(2026, 8, 10, 19, 45);
    const { getByText, container } = render(
      React.createElement(MatchHeader, {
        competition: 'Bundesliga',
        status: 'NS',
        kickoffTime,
      }),
    );

    expect(getByText('19:45 UTC')).toBeDefined();
    const clockIcon = container.querySelector('svg');
    expect(clockIcon).not.toBeNull();
  });

  it('renders upcoming badge with "Upcoming" fallback when kickoff time is absent', () => {
    const { getByText } = render(
      React.createElement(MatchHeader, {
        competition: 'Ligue 1',
        status: 'NS',
      }),
    );

    expect(getByText('Upcoming')).toBeDefined();
  });

  it('renders postponed badge for PST and cancelled badge for CANC', () => {
    const { getByText: getPst } = render(
      React.createElement(MatchHeader, {
        competition: 'MLS',
        status: 'PST',
      }),
    );
    expect(getPst('Postponed')).toBeDefined();

    const { getByText: getCanc } = render(
      React.createElement(MatchHeader, {
        competition: 'MLS',
        status: 'CANC',
      }),
    );
    expect(getCanc('Cancelled')).toBeDefined();
  });

  it('collapses cleanly to null when neither competition nor status is available', () => {
    const { container } = render(
      React.createElement(MatchHeader, {
        competition: null,
        leagueLogo: null,
        status: null,
        kickoffTime: null,
      }),
    );

    expect(container.firstChild).toBeNull();
  });

  it('collapses cleanly to null when strings are empty or whitespace only', () => {
    const { container } = render(
      React.createElement(MatchHeader, {
        competition: '   ',
        leagueLogo: '',
        status: '',
      }),
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders competition only without status badge when status is absent', () => {
    const { getByText, queryByText } = render(
      React.createElement(MatchHeader, {
        competition: 'Eredivisie',
        status: null,
      }),
    );

    expect(getByText('Eredivisie')).toBeDefined();
    expect(queryByText('FT')).toBeNull();
  });

  it('renders status badge only when competition is absent', () => {
    const { getByText, container } = render(
      React.createElement(MatchHeader, {
        competition: null,
        status: 'FT',
      }),
    );

    expect(getByText('FT')).toBeDefined();
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
});
