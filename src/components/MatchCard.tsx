import { Play } from 'lucide-react';
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

export interface MatchCardProps {
  match: MatchWithHighlights;
  activeHighlightId: string | null;
  onSelectHighlight: (highlight: Highlight) => void;
  onCloseHighlight: () => void;
  timeZone?: string;
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

  return (
    <article
      aria-label={`${match.teamHome} vs ${match.teamAway}`}
      className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 backdrop-blur-sm transition-all duration-200 hover:border-zinc-700/80 shadow-lg sm:p-5"
    >
      {/* Competition & Match Status Header (Collapses cleanly when metadata is absent) */}
      <MatchHeader
        competition={match.competition}
        leagueLogo={match.leagueLogo}
        kickoffTime={match.kickoffTime}
        timeZone={timeZone}
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
            const tagCategory = getTagCategory(hl.tag);
            const isActive = hl.id === activeHighlightId;

            return (
              <button
                key={hl.id}
                type="button"
                role="button"
                aria-pressed={isActive}
                onClick={() =>
                  isActive ? onCloseHighlight() : onSelectHighlight(hl)
                }
                className={cn(
                  'group flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
                  isActive
                    ? 'border border-emerald-500 bg-emerald-950/50 text-emerald-200 ring-1 ring-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                    : 'border border-zinc-800 bg-zinc-900/90 text-zinc-300 hover:border-emerald-500/50 hover:bg-zinc-800 hover:text-zinc-100',
                )}
              >
                <Play
                  className={cn(
                    'h-3 w-3 shrink-0 transition-transform group-hover:scale-110',
                    isActive
                      ? 'text-emerald-400 fill-emerald-400'
                      : 'text-zinc-400',
                  )}
                />

                {/* Scorer & Minute */}
                <span className="font-semibold text-zinc-200 group-hover:text-zinc-100">
                  {hl.scorer ?? 'Goal'} {hl.minute ? `${hl.minute}` : ''}
                </span>

                {/* Score at Goal */}
                {goalScore && (
                  <span className="font-mono text-zinc-400 tabular-nums">
                    {goalScore}
                  </span>
                )}

                {/* Special Tag Badges */}
                {hl.tag && (
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase',
                      tagCategory === 'penalty' &&
                        'border border-amber-800/60 bg-amber-950/50 text-amber-300',
                      tagCategory === 'great_goal' &&
                        'border border-purple-800/60 bg-purple-950/50 text-purple-300',
                      tagCategory === 'own_goal' &&
                        'border border-rose-800/60 bg-rose-950/50 text-rose-300',
                      tagCategory === 'standard' &&
                        'border border-zinc-700 bg-zinc-800 text-zinc-300',
                    )}
                  >
                    {hl.tag}
                  </span>
                )}
              </button>
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
