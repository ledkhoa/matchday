import { Store } from '@tanstack/store';
import { z } from 'zod';

export const WATCH_HISTORY_STORAGE_KEY = 'matchday_watch_history_v1';
export const WATCH_HISTORY_VERSION = 1;

export interface WatchHistoryState {
  watchedMap: Record<string, number>;
  version: number;
}

const watchHistoryStateSchema = z.object({
  watchedMap: z.record(z.string(), z.number()),
  version: z.number().default(WATCH_HISTORY_VERSION),
});

function getDefaultState(): WatchHistoryState {
  return {
    watchedMap: {},
    version: WATCH_HISTORY_VERSION,
  };
}

export function loadInitialState(): WatchHistoryState {
  if (!('document' in globalThis) || !('localStorage' in globalThis)) {
    return getDefaultState();
  }
  try {
    const raw = window.localStorage.getItem(WATCH_HISTORY_STORAGE_KEY);
    if (!raw) return getDefaultState();
    const parsed = JSON.parse(raw);
    const result = watchHistoryStateSchema.safeParse(parsed);
    if (result.success) {
      return {
        watchedMap: result.data.watchedMap,
        version: result.data.version,
      };
    }
    return getDefaultState();
  } catch {
    return getDefaultState();
  }
}

export const watchHistoryStore = new Store<WatchHistoryState>(
  loadInitialState(),
);

if (
  'document' in globalThis &&
  'window' in globalThis &&
  'localStorage' in globalThis
) {
  watchHistoryStore.subscribe((snapshot) => {
    try {
      window.localStorage.setItem(
        WATCH_HISTORY_STORAGE_KEY,
        JSON.stringify(snapshot),
      );
    } catch {
      // Safari private mode or disabled storage fails silently to maintain in-memory operation
    }
  });

  window.addEventListener('storage', (event) => {
    if (event.key === WATCH_HISTORY_STORAGE_KEY && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue);
        const result = watchHistoryStateSchema.safeParse(parsed);
        if (result.success) {
          watchHistoryStore.setState(() => ({
            watchedMap: result.data.watchedMap,
            version: result.data.version,
          }));
        }
      } catch {
        // Discard unparseable cross-tab storage mutations
      }
    }
  });
}

export function markHighlightWatched(highlightId: string): void {
  if (!highlightId) return;
  watchHistoryStore.setState((prev) => {
    if (prev.watchedMap[highlightId]) {
      return prev;
    }
    return {
      ...prev,
      watchedMap: {
        ...prev.watchedMap,
        [highlightId]: Date.now(),
      },
    };
  });
}

export function toggleHighlightWatched(highlightId: string): void {
  if (!highlightId) return;
  watchHistoryStore.setState((prev) => {
    const nextMap = { ...prev.watchedMap };
    if (nextMap[highlightId]) {
      delete nextMap[highlightId];
    } else {
      nextMap[highlightId] = Date.now();
    }
    return {
      ...prev,
      watchedMap: nextMap,
    };
  });
}

export function clearWatchHistory(): void {
  watchHistoryStore.setState(() => getDefaultState());
}

export function isHighlightWatched(highlightId: string): boolean {
  if (!highlightId) return false;
  return Boolean(watchHistoryStore.state.watchedMap[highlightId]);
}
