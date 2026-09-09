import { describe, it, expect, mock, beforeEach } from 'bun:test';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { DateNav } from './DateNav';
import { getTodayUtcString, addDaysToIsoDate } from '#/lib/date-utils';

// Mock @tanstack/react-router
const mockNavigate = mock(() => {});
mock.module('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

describe('DateNav component', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders date navigation with formatted date labels', () => {
    const { getByText } = render(
      React.createElement(DateNav, { currentDate: '2026-09-09' }),
    );
    expect(getByText('Wednesday, September 9, 2026')).toBeDefined();
    expect(getByText('Prev')).toBeDefined();
    expect(getByText('Next')).toBeDefined();
  });

  it('decrements date on Previous button click', () => {
    const { getByRole } = render(
      React.createElement(DateNav, { currentDate: '2026-09-09' }),
    );
    const prevBtn = getByRole('button', {
      name: /Previous day, Tuesday, September 8, 2026/i,
    });
    fireEvent.click(prevBtn);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/date/$date',
      params: { date: '2026-09-08' },
    });
  });

  it('navigates to next date on Next button click when date is in the past', () => {
    const pastDate = addDaysToIsoDate(getTodayUtcString(), -5);
    const expectedNext = addDaysToIsoDate(pastDate, 1);
    const { getByRole } = render(
      React.createElement(DateNav, { currentDate: pastDate }),
    );
    const nextBtn = getByRole('button', { name: /Next day/i });
    expect(nextBtn.hasAttribute('disabled')).toBe(false);
    fireEvent.click(nextBtn);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/date/$date',
      params: { date: expectedNext },
    });
  });

  it('disables Next button when currentDate is today', () => {
    const today = getTodayUtcString();
    const { getByRole } = render(
      React.createElement(DateNav, { currentDate: today }),
    );
    const nextBtn = getByRole('button', { name: /Next day/i });
    expect(nextBtn.hasAttribute('disabled')).toBe(true);

    fireEvent.click(nextBtn);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('renders Today button only when currentDate is not today', () => {
    const pastDate = addDaysToIsoDate(getTodayUtcString(), -2);
    const { getByRole, unmount } = render(
      React.createElement(DateNav, { currentDate: pastDate }),
    );
    const todayBtn = getByRole('button', { name: 'Today' });
    expect(todayBtn).toBeDefined();
    fireEvent.click(todayBtn);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/date/$date',
      params: { date: getTodayUtcString() },
    });

    unmount();

    // When current date is today, Today button should not be present
    const { queryByRole } = render(
      React.createElement(DateNav, { currentDate: getTodayUtcString() }),
    );
    expect(queryByRole('button', { name: 'Today' })).toBeNull();
  });
});
