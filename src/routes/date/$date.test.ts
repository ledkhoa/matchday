import { describe, it, expect, spyOn } from 'bun:test';
import { isNotFound } from '@tanstack/react-router';
import { QueryClient } from '@tanstack/react-query';
import { isValidIsoDate, loadDateRoute, Route } from './$date';
import type { DayMatchesResult } from '../../server/matches';

describe('isValidIsoDate', () => {
  it('returns true for valid ISO calendar dates', () => {
    expect(isValidIsoDate('2026-09-09')).toBe(true);
    expect(isValidIsoDate('2024-02-29')).toBe(true); // leap year
    expect(isValidIsoDate('2000-02-29')).toBe(true); // 400-year leap rule
    expect(isValidIsoDate('2023-12-31')).toBe(true);
  });

  it('returns false for malformed date strings', () => {
    expect(isValidIsoDate('invalid')).toBe(false);
    expect(isValidIsoDate('2026-9-9')).toBe(false);
    expect(isValidIsoDate('2026/09/09')).toBe(false);
    expect(isValidIsoDate('09-09-2026')).toBe(false);
    expect(isValidIsoDate('2026-09-09T00:00:00.000Z')).toBe(false);
    expect(isValidIsoDate('')).toBe(false);
    expect(isValidIsoDate('   ')).toBe(false);
  });

  it('returns false for invalid calendar dates like month 13 or day 45', () => {
    expect(isValidIsoDate('2026-13-45')).toBe(false);
    expect(isValidIsoDate('2026-00-15')).toBe(false); // month 00
    expect(isValidIsoDate('2026-05-00')).toBe(false); // day 00
    expect(isValidIsoDate('2026-01-32')).toBe(false); // January max 31
    expect(isValidIsoDate('2026-02-29')).toBe(false); // 2026 is not a leap year
    expect(isValidIsoDate('2025-02-29')).toBe(false); // 2025 is not a leap year
    expect(isValidIsoDate('1900-02-29')).toBe(false); // 1900 is not a leap year (100-year rule)
    expect(isValidIsoDate('2026-02-31')).toBe(false);
    expect(isValidIsoDate('2026-04-31')).toBe(false); // April has 30 days
    expect(isValidIsoDate('2026-06-31')).toBe(false); // June has 30 days
    expect(isValidIsoDate('2026-09-31')).toBe(false); // September has 30 days
    expect(isValidIsoDate('2026-11-31')).toBe(false); // November has 30 days
  });
});

describe('Date route loader (/date/$date)', () => {
  it('throws notFound() for malformed date strings like "invalid"', async () => {
    const queryClient = new QueryClient();

    try {
      await loadDateRoute({
        params: { date: 'invalid' },
        context: { queryClient },
      });
      expect.unreachable('Expected loader to throw notFound');
    } catch (err: unknown) {
      expect(isNotFound(err)).toBe(true);
    }
  });

  it('throws notFound() for calendar-invalid dates like "2026-13-45"', async () => {
    const queryClient = new QueryClient();

    try {
      await loadDateRoute({
        params: { date: '2026-13-45' },
        context: { queryClient },
      });
      expect.unreachable('Expected loader to throw notFound');
    } catch (err: unknown) {
      expect(isNotFound(err)).toBe(true);
    }
  });

  it('pre-fetches query data through ensureQueryData for valid dates', async () => {
    const queryClient = new QueryClient();
    const expectedData: DayMatchesResult = {
      date: '2026-09-09',
      matches: [],
    };

    queryClient.setQueryData(['matches', '2026-09-09'], expectedData);
    const spy = spyOn(queryClient, 'ensureQueryData');

    const result = await loadDateRoute({
      params: { date: '2026-09-09' },
      context: { queryClient },
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expectedData);
    spy.mockRestore();
  });

  it('wires loadDateRoute to Route.options.loader', () => {
    expect(Route.options.loader).toBe(loadDateRoute);
    expect(Route.options.notFoundComponent).toBeDefined();
  });

  it('renders notFoundComponent with invalid date message', () => {
    const notFoundComponent = Route.options.notFoundComponent;
    expect(notFoundComponent).toBeDefined();
    if (notFoundComponent) {
      // @ts-expect-error - invoking component function directly
      const rendered = notFoundComponent({});
      expect(rendered).toBeDefined();
      expect(JSON.stringify(rendered)).toContain('Invalid Date Format');
    }
  });
});
