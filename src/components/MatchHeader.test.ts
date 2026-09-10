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
});
