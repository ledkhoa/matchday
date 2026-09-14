import { useState, useEffect } from 'react';
import { Clock, Check } from 'lucide-react';
import { formatKickoffTime, isFullTimeStatus } from '#/lib/formatters';
import { cn } from '#/lib/utils';
import type { MatchWatchStatus } from '#/hooks/useWatchHistory';

export interface MatchHeaderProps {
  competition?: string | null;
  leagueLogo?: string | null;
  kickoffTime?: number | null;
  status?: string | null;
  timeZone?: string;
  className?: string;
  /** Aggregate watch status for the match */
  watchStatus?: MatchWatchStatus;
}

export function MatchHeader({
  competition,
  leagueLogo,
  kickoffTime,
  status,
  timeZone,
  className,
  watchStatus,
}: MatchHeaderProps) {
  const cleanCompetition = competition?.trim();
  const cleanLogo = leagueLogo?.trim();
  const hasCompetition = Boolean(cleanCompetition || cleanLogo);

  const [activeTz, setActiveTz] = useState<string | undefined>(timeZone);

  useEffect(() => {
    if ('Intl' in globalThis) {
      try {
        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (detected) {
          // If no timeZone was passed, or if timeZone was the 'UTC' SSR fallback while user is in local timezone
          if (!timeZone || (timeZone === 'UTC' && detected !== 'UTC')) {
            setActiveTz(detected);
          } else if (timeZone && timeZone !== activeTz) {
            setActiveTz(timeZone);
          }
        }
      } catch {
        // Leave activeTz fallback
      }
    }
  }, [timeZone, activeTz]);

  const cleanStatus = status?.trim().toUpperCase();
  const isFullTime = isFullTimeStatus(status);
  const fullTimeLabel =
    cleanStatus === 'AET'
      ? 'Full Time (ET)'
      : cleanStatus === 'PEN'
        ? 'Full Time (PEN)'
        : 'Full Time';

  const formattedKickoff = formatKickoffTime(kickoffTime, activeTz);
  const hasKickoff = Boolean(formattedKickoff);
  const hasTimeOrStatus = isFullTime || hasKickoff;
  const hasWatchBadge = Boolean(watchStatus && watchStatus.total > 0);

  // Collapse cleanly with zero margin or padding jitter when metadata and watch status are absent
  if (!hasCompetition && !hasTimeOrStatus && !hasWatchBadge) {
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
          <div className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded bg-white p-0.5 shadow-xs sm:h-5 sm:w-5">
            <img
              src={cleanLogo}
              alt=""
              aria-hidden="true"
              loading="lazy"
              className="h-full w-full object-contain"
            />
          </div>
        )}
        {cleanCompetition && (
          <span className="truncate max-w-[180px] sm:max-w-[300px] text-xs font-semibold text-zinc-400 tracking-wide">
            {cleanCompetition}
          </span>
        )}
      </div>

      {/* Right: Kickoff Time Badge / Full Time Badge & Watch Status Badge */}
      {(hasTimeOrStatus || hasWatchBadge) && (
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {isFullTime ? (
            <span
              data-testid="match-status-full-time"
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700/80 bg-zinc-800/90 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-zinc-200 shadow-xs sm:text-xs"
            >
              <span
                className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0"
                aria-hidden="true"
              />
              {fullTimeLabel}
            </span>
          ) : hasKickoff ? (
            <span
              suppressHydrationWarning
              data-testid="match-kickoff-time"
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700/80 bg-zinc-800/90 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-zinc-200 shadow-xs sm:text-xs"
            >
              <Clock
                className="h-3 w-3 text-zinc-400 shrink-0"
                aria-hidden="true"
              />
              Kickoff: {formattedKickoff}
            </span>
          ) : null}
          {hasWatchBadge &&
            watchStatus &&
            (watchStatus.hasUnwatched ? (
              <span
                data-testid="watch-badge-unwatched"
                className="inline-flex items-center gap-1.5 rounded-full border border-yellow-500/30 bg-yellow-950/30 px-2 py-0.5 font-mono text-[10px] sm:text-xs text-yellow-300"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse motion-reduce:animate-none" />
                {watchStatus.watchedCount}/{watchStatus.total} watched
              </span>
            ) : watchStatus.isAllWatched ? (
              <span
                data-testid="watch-badge-all-watched"
                className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-950/80 px-2 py-0.5 font-mono text-[10px] sm:text-xs text-zinc-400"
              >
                <Check
                  className="h-3 w-3 text-blue-400/90"
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
