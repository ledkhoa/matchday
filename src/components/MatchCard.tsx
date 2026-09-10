import { useMemo } from 'react';
import { Play, Check } from 'lucide-react';
import type { MatchWithHighlights, Highlight } from '#/db/schema';
import {
  computeMatchScore,
  formatGoalScore,
  getTagCategory,
  sortHighlightsChronologically,
} from '#/lib/formatters';
import { cn } from '#/lib/utils';
import { HighlightPlayer } from '#/components/HighlightPlayer';
import { MatchHeader } from '#/components/MatchHeader';
import { TeamCrest } from '#/components/TeamCrest';
import {
  useHighlightWatchStatus,
  useMatchWatchStatus,
} from '#/hooks/useWatchHistory';

export interface MatchCardProps {
  match: MatchWithHighlights;
  activeHighlightId: string | null;
  onSelectHighlight: (highlight: Highlight) => void;
  onCloseHighlight: () => void;
  timeZone?: string;
}

interface GoalChipProps {
  highlight: Highlight;
  isActive: boolean;
  goalScore?: string | null;
  onSelect: () => void;
  onClose: () => void;
}

function GoalChip({
  highlight,
  isActive,
  goalScore,
  onSelect,
  onClose,
}: GoalChipProps) {
  const isWatched = useHighlightWatchStatus(highlight.id);
  const tagCategory = getTagCategory(highlight.tag);

  const ariaLabel = isActive
    ? `Currently playing goal: ${highlight.scorer ?? 'Goal'} ${highlight.minute ?? ''}. Press to close player`
    : `Play goal: ${highlight.scorer ?? 'Goal'} ${highlight.minute ?? ''}${
        goalScore ? `, score ${goalScore}` : ''
      }. ${isWatched ? 'Watched' : 'Unwatched'}`;

  return (
    <button
      type="button"
      role="button"
      aria-pressed={isActive}
      aria-label={ariaLabel}
      onClick={() => (isActive ? onClose() : onSelect())}
      className={cn(
        'group flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
        isActive
          ? 'border border-emerald-500 bg-emerald-950/60 text-emerald-100 ring-1 ring-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
          : isWatched
            ? 'border border-zinc-800/80 bg-zinc-950/50 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900/80 hover:text-zinc-200'
            : 'border border-zinc-700/80 bg-zinc-900/90 text-zinc-200 hover:border-emerald-500/60 hover:bg-zinc-800 hover:text-white shadow-sm',
      )}
    >
      {/* Icon: Active/Unwatched use Play, Watched uses Check */}
      {isActive ? (
        <Play className="h-3 w-3 shrink-0 fill-emerald-400 text-emerald-400" />
      ) : isWatched ? (
        <Check className="h-3 w-3 shrink-0 text-emerald-500/70 group-hover:text-emerald-400 transition-colors" />
      ) : (
        <Play className="h-3 w-3 shrink-0 text-emerald-400 transition-transform group-hover:scale-110" />
      )}

      {/* Scorer & Minute */}
      <span
        className={cn(
          'font-semibold',
          isActive
            ? 'text-emerald-100'
            : isWatched
              ? 'text-zinc-400 group-hover:text-zinc-200 font-medium'
              : 'text-zinc-200 group-hover:text-zinc-100',
        )}
      >
        {highlight.scorer ?? 'Goal'}{' '}
        {highlight.minute ? `${highlight.minute}` : ''}
      </span>

      {/* Score at Goal */}
      {goalScore && (
        <span
          className={cn(
            'font-mono tabular-nums',
            isWatched ? 'text-zinc-500' : 'text-zinc-400',
          )}
        >
          {goalScore}
        </span>
      )}

      {/* Special Tag Badges (Vivid when unwatched, subdued when watched) */}
      {highlight.tag && (
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase',
            tagCategory === 'penalty' &&
              (isWatched
                ? 'border border-amber-900/40 bg-amber-950/20 text-amber-400/80'
                : 'border border-amber-800/60 bg-amber-950/50 text-amber-300'),
            tagCategory === 'great_goal' &&
              (isWatched
                ? 'border border-purple-900/40 bg-purple-950/20 text-purple-400/80'
                : 'border border-purple-800/60 bg-purple-950/50 text-purple-300'),
            tagCategory === 'own_goal' &&
              (isWatched
                ? 'border border-rose-900/40 bg-rose-950/20 text-rose-400/80'
                : 'border border-rose-800/60 bg-rose-950/50 text-rose-300'),
            tagCategory === 'standard' &&
              (isWatched
                ? 'border border-zinc-800 bg-zinc-900/50 text-zinc-500'
                : 'border border-zinc-700 bg-zinc-800 text-zinc-300'),
          )}
        >
          {highlight.tag}
        </span>
      )}
    </button>
  );
}

export function MatchCard({
  match,
  activeHighlightId,
  onSelectHighlight,
  onCloseHighlight,
  timeZone,
}: MatchCardProps) {
  const sortedHighlights = sortHighlightsChronologically(match.highlights);
  const computedScore = computeMatchScore(sortedHighlights);
  const activeHighlight =
    sortedHighlights.find((h) => h.id === activeHighlightId) ?? null;

  const highlightIds = useMemo(
    () => sortedHighlights.map((h) => h.id),
    [sortedHighlights],
  );
  const watchStatus = useMatchWatchStatus(highlightIds);

  const containerStateClasses =
    watchStatus.total > 0 && watchStatus.hasUnwatched
      ? 'relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-zinc-900/85 p-4 backdrop-blur-sm transition-all duration-200 hover:border-emerald-500/50 shadow-[0_4px_24px_-4px_rgba(16,185,129,0.07)] before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-emerald-500/40 before:to-transparent sm:p-5'
      : watchStatus.total > 0 && watchStatus.isAllWatched
        ? 'relative overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900/50 p-4 backdrop-blur-sm transition-all duration-200 hover:border-zinc-700/80 opacity-90 hover:opacity-100 shadow-lg sm:p-5'
        : 'relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 backdrop-blur-sm transition-all duration-200 hover:border-zinc-700/80 shadow-lg sm:p-5';

  return (
    <article
      aria-label={`${match.teamHome} vs ${match.teamAway}`}
      className={containerStateClasses}
    >
      {/* Competition & Match Status Header (Collapses cleanly when metadata is absent) */}
      <MatchHeader
        competition={match.competition}
        leagueLogo={match.leagueLogo}
        kickoffTime={match.kickoffTime}
        timeZone={timeZone}
        watchStatus={watchStatus}
      />

      {/* Team Display & Scoreline Header */}
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800/80 pb-3 sm:gap-4">
        {/* Home Team */}
        <div className="flex flex-1 min-w-0 items-center gap-2.5">
          <TeamCrest teamName={match.teamHome} logoUrl={match.teamHomeLogo} />
          <span className="truncate text-sm font-bold text-zinc-100 sm:text-base">
            {match.teamHome}
          </span>
        </div>

        {/* Scoreline Badge */}
        <div className="flex shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950/90 px-3 py-1 shadow-inner sm:px-4 sm:py-1.5">
          <span className="font-mono text-base font-black tracking-wider text-emerald-400 tabular-nums sm:text-lg">
            {computedScore
              ? `${computedScore.home} - ${computedScore.away}`
              : 'VS'}
          </span>
        </div>

        {/* Away Team */}
        <div className="flex flex-1 min-w-0 items-center justify-end gap-2.5 text-right">
          <span className="truncate text-sm font-bold text-zinc-100 sm:text-base">
            {match.teamAway}
          </span>
          <TeamCrest teamName={match.teamAway} logoUrl={match.teamAwayLogo} />
        </div>
      </div>

      {/* Goal Timeline Chips Row */}
      {sortedHighlights.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-3">
          {sortedHighlights.map((hl, idx) => {
            const prevHl = idx > 0 ? sortedHighlights[idx - 1] : undefined;
            const goalScore = formatGoalScore(hl, prevHl);
            const isActive = hl.id === activeHighlightId;

            return (
              <GoalChip
                key={hl.id}
                highlight={hl}
                isActive={isActive}
                goalScore={goalScore}
                onSelect={() => onSelectHighlight(hl)}
                onClose={onCloseHighlight}
              />
            );
          })}
        </div>
      )}

      {/* Inline Highlight Player */}
      {activeHighlight && (
        <HighlightPlayer
          highlight={activeHighlight}
          onClose={onCloseHighlight}
        />
      )}
    </article>
  );
}
