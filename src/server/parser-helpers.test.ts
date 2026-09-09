import { describe, it, expect } from 'bun:test';
import {
  parseMinuteToSeconds,
  sortHighlightsChronologically,
} from './parser-helpers';

describe('parseMinuteToSeconds', () => {
  it('parses regular match minutes', () => {
    expect(parseMinuteToSeconds("15'")).toBe(15 * 60);
    expect(parseMinuteToSeconds('45')).toBe(45 * 60);
    expect(parseMinuteToSeconds("90'")).toBe(90 * 60);
  });

  it('parses stoppage time with + sign', () => {
    expect(parseMinuteToSeconds("45+2'")).toBe(47 * 60);
    expect(parseMinuteToSeconds("90+4'")).toBe(94 * 60);
    expect(parseMinuteToSeconds("120+1'")).toBe(121 * 60);
  });

  it('handles extra time notation like 105', () => {
    expect(parseMinuteToSeconds("105'")).toBe(105 * 60);
  });

  it('handles prime and apostrophe variations', () => {
    expect(parseMinuteToSeconds('45’')).toBe(45 * 60);
    expect(parseMinuteToSeconds('90+3’')).toBe(93 * 60);
    expect(parseMinuteToSeconds("120+3'")).toBe(123 * 60);
    expect(parseMinuteToSeconds("5'")).toBe(5 * 60);
  });

  it('returns MAX_SAFE_INTEGER for null, undefined, or empty', () => {
    expect(parseMinuteToSeconds(null)).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseMinuteToSeconds(undefined)).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseMinuteToSeconds('')).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseMinuteToSeconds('   ')).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('returns MAX_SAFE_INTEGER for invalid or unparseable minutes', () => {
    expect(parseMinuteToSeconds('invalid')).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseMinuteToSeconds('abc+def')).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseMinuteToSeconds('HT')).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseMinuteToSeconds('FT')).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseMinuteToSeconds('Penalties')).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('sortHighlightsChronologically', () => {
  it('correctly orders 15, 45, 45+2, 60, 90, 90+4', () => {
    const items = [
      { id: '1', minute: "90+4'", postedAt: 600 },
      { id: '2', minute: "15'", postedAt: 100 },
      { id: '3', minute: "60'", postedAt: 400 },
      { id: '4', minute: "45+2'", postedAt: 300 },
      { id: '5', minute: "45'", postedAt: 200 },
      { id: '6', minute: "90'", postedAt: 500 },
    ];

    const sorted = sortHighlightsChronologically(items);
    expect(sorted.map((item) => item.minute)).toEqual([
      "15'",
      "45'",
      "45+2'",
      "60'",
      "90'",
      "90+4'",
    ]);
  });

  it('handles extra time notation like 105 and 120+1', () => {
    const items = [
      { id: '1', minute: "120+1'", postedAt: 700 },
      { id: '2', minute: "90'", postedAt: 500 },
      { id: '3', minute: "105'", postedAt: 600 },
    ];

    const sorted = sortHighlightsChronologically(items);
    expect(sorted.map((item) => item.minute)).toEqual([
      "90'",
      "105'",
      "120+1'",
    ]);
  });

  it('places null and unparseable minutes at the end sorted by postedAt ascending', () => {
    const items = [
      { id: 'null-later', minute: null, postedAt: 1000 },
      { id: 'goal-1', minute: "23'", postedAt: 100 },
      { id: 'invalid-mid', minute: 'N/A', postedAt: 500 },
      { id: 'null-earlier', minute: null, postedAt: 400 },
    ];

    const sorted = sortHighlightsChronologically(items);
    expect(sorted.map((item) => item.id)).toEqual([
      'goal-1',
      'null-earlier',
      'invalid-mid',
      'null-later',
    ]);
  });

  it('breaks minute ties by sorting postedAt ascending', () => {
    const items = [
      { id: 'second', minute: "45'", postedAt: 200 },
      { id: 'first', minute: "45'", postedAt: 100 },
    ];

    const sorted = sortHighlightsChronologically(items);
    expect(sorted.map((item) => item.id)).toEqual(['first', 'second']);
  });

  it('handles empty highlights array gracefully', () => {
    expect(sortHighlightsChronologically([])).toEqual([]);
  });

  it('does not mutate the original array', () => {
    const original = [
      { id: '2', minute: "90'", postedAt: 200 },
      { id: '1', minute: "10'", postedAt: 100 },
    ];
    const originalCopy = [...original];

    const sorted = sortHighlightsChronologically(original);
    expect(original).toEqual(originalCopy);
    expect(sorted[0].id).toBe('1');
    expect(original[0].id).toBe('2');
  });
});
