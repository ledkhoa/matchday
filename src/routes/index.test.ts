import { describe, it, expect } from 'bun:test';
import { isRedirect } from '@tanstack/react-router';
import { getTodayUtcDate, handleIndexBeforeLoad, Route } from './index';

describe('Index route (/)', () => {
  it('computes correct UTC date string (YYYY-MM-DD)', () => {
    const today = getTodayUtcDate();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const expected = new Date().toISOString().slice(0, 10);
    expect(today).toBe(expected);
  });

  it('throws a redirect to /date/$today in handleIndexBeforeLoad', () => {
    try {
      handleIndexBeforeLoad();
      expect.unreachable('Expected beforeLoad to throw a redirect');
    } catch (thrown: unknown) {
      expect(isRedirect(thrown)).toBe(true);
      if (isRedirect(thrown)) {
        expect(thrown.status).toBe(307);
        expect(thrown.options.to).toBe('/date/$date');
        expect(JSON.stringify(thrown.options.params)).toBe(
          JSON.stringify({ date: getTodayUtcDate() }),
        );
      }
    }
  });

  it('configures beforeLoad handler on Route options', () => {
    expect(Route.options.beforeLoad).toBe(handleIndexBeforeLoad);
  });
});
