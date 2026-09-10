import { describe, it, expect, beforeEach } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import {
  useHighlightWatchStatus,
  useMatchWatchStatus,
  markHighlightWatched,
  toggleHighlightWatched,
  clearWatchHistory,
} from './useWatchHistory';

describe('useWatchHistory hooks', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearWatchHistory();
  });

  describe('useHighlightWatchStatus', () => {
    it('returns false for unwatched highlight', () => {
      const { result } = renderHook(() =>
        useHighlightWatchStatus('hl-test-unwatched'),
      );
      expect(result.current).toBe(false);
    });

    it('reactively updates to true when highlight is marked watched', () => {
      const { result } = renderHook(() =>
        useHighlightWatchStatus('hl-test-reactivity'),
      );
      expect(result.current).toBe(false);

      act(() => {
        markHighlightWatched('hl-test-reactivity');
      });

      expect(result.current).toBe(true);
    });

    it('reactively updates when highlight watched state is toggled', () => {
      const { result } = renderHook(() =>
        useHighlightWatchStatus('hl-test-toggle'),
      );
      expect(result.current).toBe(false);

      act(() => {
        toggleHighlightWatched('hl-test-toggle');
      });
      expect(result.current).toBe(true);

      act(() => {
        toggleHighlightWatched('hl-test-toggle');
      });
      expect(result.current).toBe(false);
    });
  });

  describe('useMatchWatchStatus', () => {
    it('returns zeroed state for matches with empty highlights', () => {
      const { result } = renderHook(() => useMatchWatchStatus([]));
      expect(result.current).toEqual({
        total: 0,
        watchedCount: 0,
        hasUnwatched: false,
        isAllWatched: false,
      });
    });

    it('computes correct watch status when highlights are unwatched', () => {
      const ids = ['hl-1', 'hl-2', 'hl-3'];
      const { result } = renderHook(() => useMatchWatchStatus(ids));

      expect(result.current).toEqual({
        total: 3,
        watchedCount: 0,
        hasUnwatched: true,
        isAllWatched: false,
      });
    });

    it('reactively tracks partial progress (1 of 3 watched)', () => {
      const ids = ['hl-1', 'hl-2', 'hl-3'];
      const { result } = renderHook(() => useMatchWatchStatus(ids));

      act(() => {
        markHighlightWatched('hl-1');
      });

      expect(result.current).toEqual({
        total: 3,
        watchedCount: 1,
        hasUnwatched: true,
        isAllWatched: false,
      });
    });

    it('reactively updates to isAllWatched when all highlights are watched', () => {
      const ids = ['hl-1', 'hl-2'];
      const { result } = renderHook(() => useMatchWatchStatus(ids));

      act(() => {
        markHighlightWatched('hl-1');
        markHighlightWatched('hl-2');
      });

      expect(result.current).toEqual({
        total: 2,
        watchedCount: 2,
        hasUnwatched: false,
        isAllWatched: true,
      });
    });

    it('preserves referential stability via shallow equality when unrelated store data updates', () => {
      const ids = ['hl-target-1'];
      let renderCount = 0;

      const { result } = renderHook(() => {
        renderCount++;
        return useMatchWatchStatus(ids);
      });

      expect(renderCount).toBe(1);

      // Mutate an unrelated highlight in the store
      act(() => {
        markHighlightWatched('hl-unrelated');
      });

      // The hook return value is shallow-equal, so selector should not force a component re-render
      expect(result.current).toEqual({
        total: 1,
        watchedCount: 0,
        hasUnwatched: true,
        isAllWatched: false,
      });
      expect(renderCount).toBe(1);
    });
  });
});
