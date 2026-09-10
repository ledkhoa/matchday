import { useSelector } from '@tanstack/react-store';
import { shallow } from '@tanstack/store';
import {
  watchHistoryStore,
  markHighlightWatched,
  toggleHighlightWatched,
  clearWatchHistory,
  isHighlightWatched,
  type WatchHistoryState,
} from '#/stores/watchHistoryStore';

export interface MatchWatchStatus {
  total: number;
  watchedCount: number;
  hasUnwatched: boolean;
  isAllWatched: boolean;
}

export function useHighlightWatchStatus(highlightId: string): boolean {
  return useSelector(watchHistoryStore, (state: WatchHistoryState) =>
    Boolean(state.watchedMap[highlightId]),
  );
}

export function useMatchWatchStatus(
  highlightIds: readonly string[],
): MatchWatchStatus {
  return useSelector(
    watchHistoryStore,
    (state: WatchHistoryState) => {
      const total = highlightIds.length;
      if (total === 0) {
        return {
          total: 0,
          watchedCount: 0,
          hasUnwatched: false,
          isAllWatched: false,
        };
      }
      let watchedCount = 0;
      for (const id of highlightIds) {
        if (state.watchedMap[id]) {
          watchedCount++;
        }
      }
      return {
        total,
        watchedCount,
        hasUnwatched: watchedCount < total,
        isAllWatched: watchedCount === total,
      };
    },
    { compare: shallow },
  );
}

export {
  markHighlightWatched,
  toggleHighlightWatched,
  clearWatchHistory,
  isHighlightWatched,
};
