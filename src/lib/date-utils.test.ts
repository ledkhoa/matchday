import { describe, it, expect } from 'bun:test';
import {
  getTodayUtcString,
  addDaysToIsoDate,
  formatDisplayDate,
  isTodayDate,
  isFutureDate,
} from './date-utils';

describe('date-utils', () => {
  describe('getTodayUtcString', () => {
    it('returns a string matching YYYY-MM-DD', () => {
      const today = getTodayUtcString();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('addDaysToIsoDate', () => {
    it('adds days correctly within the same month', () => {
      expect(addDaysToIsoDate('2026-09-09', 1)).toBe('2026-09-10');
      expect(addDaysToIsoDate('2026-09-09', 5)).toBe('2026-09-14');
    });

    it('subtracts days correctly within the same month', () => {
      expect(addDaysToIsoDate('2026-09-09', -1)).toBe('2026-09-08');
      expect(addDaysToIsoDate('2026-09-09', -5)).toBe('2026-09-04');
    });

    it('handles month boundaries correctly across forward navigation', () => {
      expect(addDaysToIsoDate('2026-08-31', 1)).toBe('2026-09-01');
      expect(addDaysToIsoDate('2026-09-30', 1)).toBe('2026-10-01');
    });

    it('handles month boundaries correctly across backward navigation', () => {
      expect(addDaysToIsoDate('2026-09-01', -1)).toBe('2026-08-31');
      expect(addDaysToIsoDate('2026-10-01', -1)).toBe('2026-09-30');
    });

    it('handles leap years correctly', () => {
      expect(addDaysToIsoDate('2024-02-28', 1)).toBe('2024-02-29');
      expect(addDaysToIsoDate('2024-02-29', 1)).toBe('2024-03-01');
      expect(addDaysToIsoDate('2024-03-01', -1)).toBe('2024-02-29');
      // 2026 is non-leap year
      expect(addDaysToIsoDate('2026-02-28', 1)).toBe('2026-03-01');
    });

    it('handles year rollover boundaries correctly', () => {
      expect(addDaysToIsoDate('2026-12-31', 1)).toBe('2027-01-01');
      expect(addDaysToIsoDate('2026-01-01', -1)).toBe('2025-12-31');
    });
  });

  describe('formatDisplayDate', () => {
    it('formats date in long format by default', () => {
      const formatted = formatDisplayDate('2026-09-09');
      expect(formatted).toBe('Wednesday, September 9, 2026');
    });

    it('formats date in short format when options.short is true', () => {
      const formatted = formatDisplayDate('2026-09-09', { short: true });
      expect(formatted).toBe('Wed, Sep 9');
    });
  });

  describe('isTodayDate', () => {
    it('returns true for today in UTC', () => {
      const today = getTodayUtcString();
      expect(isTodayDate(today)).toBe(true);
    });

    it('returns false for past or future dates', () => {
      expect(isTodayDate('2020-01-01')).toBe(false);
      expect(isTodayDate('2099-01-01')).toBe(false);
    });
  });

  describe('isFutureDate', () => {
    it('returns true for dates after today', () => {
      const tomorrow = addDaysToIsoDate(getTodayUtcString(), 1);
      expect(isFutureDate(tomorrow)).toBe(true);
      expect(isFutureDate('2099-12-31')).toBe(true);
    });

    it('returns false for today or past dates', () => {
      const today = getTodayUtcString();
      const yesterday = addDaysToIsoDate(today, -1);
      expect(isFutureDate(today)).toBe(false);
      expect(isFutureDate(yesterday)).toBe(false);
      expect(isFutureDate('2020-01-01')).toBe(false);
    });
  });
});
