import { useState, useEffect } from 'react';
import { Clock, Check } from 'lucide-react';
import { formatKickoffTime } from '#/lib/formatters';
import { cn } from '#/lib/utils';
import type { MatchWatchStatus } from '#/hooks/useWatchHistory';

export interface MatchHeaderProps {
  competition?: string | null;
  leagueLogo?: string | null;
  kickoffTime?: number | null;
  timeZone?: string;
  className?: string;
  /** Aggregate watch status for the match */
  watchStatus?: MatchWatchStatus;
}

export function MatchHeader({
  competition,
  leagueLogo,
  kickoffTime,
  timeZone,
  className,
  watchStatus,
}: MatchHeaderProps) {
  const cleanCompetition = competition?.trim();
  const cleanLogo = leagueLogo?.trim();
  const hasCompetition = Boolean(cleanCompetition || cleanLogo);

  const [activeTz, setActiveTz] = useState<string | undefined>(timeZone);

  useEffect(() => {
    if (!timeZone && 'Intl' in globalThis) {
      try {
        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (detected && detected !== activeTz) {
          setActiveTz(detected);
        }
      } catch {
        // Leave activeTz fallback
      }
    }
  }, [timeZone, activeTz]);

  const formattedKickoff = formatKickoffTime(kickoffTime, activeTz);
  const hasKickoff = Boolean(formattedKickoff);
  const hasWatchBadge = Boolean(watchStatus && watchStatus.total > 0);

  // Collapse cleanly with zero margin or padding jitter when metadata and watch status are absent
  if (!hasCompetition && !hasKickoff && !hasWatchBadge) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 border-b border-zinc-800/60 pb-2.5 mb-3 sm:pb-3 sm:mb-3.5',
        className,
      )}
    >
      {/* Left: Competition Branding */}
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
        {cleanLogo && (
          <img
            src={cleanLogo}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="h-4 w-4 shrink-0 object-contain sm:h-4.5 sm:w-4.5"
          />
        )}
        {cleanCompetition && (
          <span className="truncate max-w-[180px] sm:max-w-[300px] text-xs font-semibold text-zinc-400 tracking-wide">
            {cleanCompetition}
          </span>
        )}
      </div>

      {/* Right: Kickoff Time Badge & Watch Status Badge */}
      {(hasKickoff || hasWatchBadge) && (
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {hasKickoff && (
            <span
              suppressHydrationWarning
              className="inline-flex items-center gap-1 rounded-full border border-zinc-800/80 bg-zinc-950/60 px-2 py-0.5 font-mono text-[10px] font-medium text-zinc-400 sm:text-xs"
            >
              <Clock className="h-3 w-3 text-zinc-500" aria-hidden="true" />
              Kickoff: {formattedKickoff}
            </span>
          )}
          {hasWatchBadge &&
            watchStatus &&
            (watchStatus.hasUnwatched ? (
              <span
                data-testid="watch-badge-unwatched"
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/30 px-2 py-0.5 font-mono text-[10px] sm:text-xs text-emerald-300"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse motion-reduce:animate-none" />
                {watchStatus.watchedCount}/{watchStatus.total} watched
              </span>
            ) : watchStatus.isAllWatched ? (
              <span
                data-testid="watch-badge-all-watched"
                className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-950/80 px-2 py-0.5 font-mono text-[10px] sm:text-xs text-zinc-400"
              >
                <Check
                  className="h-3 w-3 text-emerald-400/90"
                  aria-hidden="true"
                />
                {watchStatus.total}/{watchStatus.total} watched
              </span>
            ) : null)}
        </div>
      )}
    </div>
  );
}
