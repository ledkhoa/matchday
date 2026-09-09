import { describe, it, expect, mock } from 'bun:test';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { EmptyState } from './EmptyState';

// Mock @tanstack/react-router useNavigate
const mockNavigate = mock(() => {});
mock.module('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

describe('EmptyState component', () => {
  it('renders heading, description and formatted date', () => {
    const { getByText, getByRole } = render(
      React.createElement(EmptyState, { date: '2026-09-09' }),
    );
    expect(getByText('No highlights recorded for this day')).toBeDefined();
    expect(getByText('Wednesday, September 9, 2026')).toBeDefined();
    expect(getByRole('button', { name: /Jump to Today/i })).toBeDefined();
    expect(getByRole('link', { name: /Visit r\/soccer/i })).toBeDefined();
  });

  it('triggers onJumpToToday callback when Jump to Today is clicked', () => {
    const jumpSpy = mock(() => {});
    const { getByRole } = render(
      React.createElement(EmptyState, {
        date: '2026-09-09',
        onJumpToToday: jumpSpy,
      }),
    );
    const jumpBtn = getByRole('button', { name: /Jump to Today/i });
    fireEvent.click(jumpBtn);
    expect(jumpSpy).toHaveBeenCalledTimes(1);
  });

  it('triggers router navigation when onJumpToToday is not provided', () => {
    mockNavigate.mockClear();
    const { getByRole } = render(
      React.createElement(EmptyState, { date: '2026-09-09' }),
    );
    const jumpBtn = getByRole('button', { name: /Jump to Today/i });
    fireEvent.click(jumpBtn);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });
});
