import { describe, it, expect, beforeEach, mock } from 'bun:test';
import {
  watchHistoryStore,
  markHighlightWatched,
  toggleHighlightWatched,
  clearWatchHistory,
  isHighlightWatched,
  loadInitialState,
  WATCH_HISTORY_STORAGE_KEY,
  WATCH_HISTORY_VERSION,
} from './watchHistoryStore';

describe('watchHistoryStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearWatchHistory();
  });

  it('initializes with empty watchedMap and current version', () => {
    expect(watchHistoryStore.state.watchedMap).toEqual({});
    expect(watchHistoryStore.state.version).toBe(WATCH_HISTORY_VERSION);
  });

  it('persists watched highlight to localStorage when marked', () => {
    markHighlightWatched('hl-test-1');

    expect(isHighlightWatched('hl-test-1')).toBe(true);
    expect(watchHistoryStore.state.watchedMap['hl-test-1']).toBeGreaterThan(0);

    const raw = window.localStorage.getItem(WATCH_HISTORY_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw!);
    expect(stored.watchedMap['hl-test-1']).toBe(
      watchHistoryStore.state.watchedMap['hl-test-1'],
    );
  });

  it('handles markHighlightWatched idempotently without re-notifying subscribers', () => {
    markHighlightWatched('hl-test-1');
    const firstTimestamp = watchHistoryStore.state.watchedMap['hl-test-1'];

    const subscriberSpy = mock(() => {});
    const subscription = watchHistoryStore.subscribe(subscriberSpy);

    // Call again with same ID
    markHighlightWatched('hl-test-1');

    expect(watchHistoryStore.state.watchedMap['hl-test-1']).toBe(
      firstTimestamp,
    );
    expect(subscriberSpy).toHaveBeenCalledTimes(0);

    subscription.unsubscribe();
  });

  it('ignores empty highlight ID in markHighlightWatched', () => {
    const subscriberSpy = mock(() => {});
    const subscription = watchHistoryStore.subscribe(subscriberSpy);

    markHighlightWatched('');

    expect(subscriberSpy).toHaveBeenCalledTimes(0);
    subscription.unsubscribe();
  });

  it('toggles highlight watched status on and off', () => {
    expect(isHighlightWatched('hl-toggle')).toBe(false);

    toggleHighlightWatched('hl-toggle');
    expect(isHighlightWatched('hl-toggle')).toBe(true);
    expect(watchHistoryStore.state.watchedMap['hl-toggle']).toBeGreaterThan(0);

    toggleHighlightWatched('hl-toggle');
    expect(isHighlightWatched('hl-toggle')).toBe(false);
    expect(watchHistoryStore.state.watchedMap['hl-toggle']).toBeUndefined();
  });

  it('ignores empty highlight ID in toggleHighlightWatched', () => {
    toggleHighlightWatched('');
    expect(watchHistoryStore.state.watchedMap).toEqual({});
  });

  it('clears all watch history with clearWatchHistory', () => {
    markHighlightWatched('hl-1');
    markHighlightWatched('hl-2');
    expect(isHighlightWatched('hl-1')).toBe(true);
    expect(isHighlightWatched('hl-2')).toBe(true);

    clearWatchHistory();
    expect(watchHistoryStore.state.watchedMap).toEqual({});
    expect(isHighlightWatched('hl-1')).toBe(false);
    expect(isHighlightWatched('hl-2')).toBe(false);
  });

  it('returns false for empty ID in isHighlightWatched', () => {
    expect(isHighlightWatched('')).toBe(false);
  });

  describe('loadInitialState', () => {
    it('returns default state when localStorage is empty', () => {
      const state = loadInitialState();
      expect(state).toEqual({
        watchedMap: {},
        version: WATCH_HISTORY_VERSION,
      });
    });

    it('hydrates valid state from localStorage', () => {
      const sample = {
        watchedMap: { 'hl-hydrated': 1700000000 },
        version: 1,
      };
      window.localStorage.setItem(
        WATCH_HISTORY_STORAGE_KEY,
        JSON.stringify(sample),
      );

      const state = loadInitialState();
      expect(state.watchedMap).toEqual({ 'hl-hydrated': 1700000000 });
      expect(state.version).toBe(1);
    });

    it('recovers safely with default state when localStorage contains invalid JSON', () => {
      window.localStorage.setItem(
        WATCH_HISTORY_STORAGE_KEY,
        '{ malformed json %%%',
      );

      const state = loadInitialState();
      expect(state).toEqual({
        watchedMap: {},
        version: WATCH_HISTORY_VERSION,
      });
    });

    it('recovers safely when localStorage schema does not match expected structure', () => {
      window.localStorage.setItem(
        WATCH_HISTORY_STORAGE_KEY,
        JSON.stringify({ watchedMap: 'not-an-object' }),
      );

      const state = loadInitialState();
      expect(state).toEqual({
        watchedMap: {},
        version: WATCH_HISTORY_VERSION,
      });
    });
  });

  describe('Cross-tab synchronization via storage event', () => {
    it('updates store state when storage event fires for WATCH_HISTORY_STORAGE_KEY', () => {
      const externalState = {
        watchedMap: { 'hl-tab-2': 1700000050 },
        version: 1,
      };

      // SAFETY: Cast generic Event to StorageEvent for testing cross-tab window event handler
      const event = new window.Event('storage') as StorageEvent;
      Object.defineProperties(event, {
        key: { value: WATCH_HISTORY_STORAGE_KEY },
        newValue: { value: JSON.stringify(externalState) },
      });

      window.dispatchEvent(event);

      expect(isHighlightWatched('hl-tab-2')).toBe(true);
      expect(watchHistoryStore.state.watchedMap['hl-tab-2']).toBe(1700000050);
    });

    it('ignores storage event with different key or unparseable value', () => {
      markHighlightWatched('hl-tab-1');

      // SAFETY: Cast generic Event to StorageEvent for testing cross-tab window event handler
      const event = new window.Event('storage') as StorageEvent;
      Object.defineProperties(event, {
        key: { value: 'other_key' },
        newValue: { value: '{"test": 123}' },
      });
      window.dispatchEvent(event);

      expect(isHighlightWatched('hl-tab-1')).toBe(true);

      // SAFETY: Cast generic Event to StorageEvent for testing cross-tab window event handler
      const badJsonEvent = new window.Event('storage') as StorageEvent;
      Object.defineProperties(badJsonEvent, {
        key: { value: WATCH_HISTORY_STORAGE_KEY },
        newValue: { value: 'invalid json...' },
      });
      window.dispatchEvent(badJsonEvent);

      expect(isHighlightWatched('hl-tab-1')).toBe(true);
    });
  });
});
