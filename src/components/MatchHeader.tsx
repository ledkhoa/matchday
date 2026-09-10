import { Clock } from 'lucide-react';
import { formatMatchStatus } from '#/lib/formatters';
import { cn } from '#/lib/utils';

export interface MatchHeaderProps {
  competition?: string | null;
  leagueLogo?: string | null;
  status?: string | null;
  kickoffTime?: number | null;
  className?: string;
}

export function MatchHeader({
  competition,
  leagueLogo,
  status,
  kickoffTime,
  className,
}: MatchHeaderProps) {
  const cleanCompetition = competition?.trim();
  const cleanLogo = leagueLogo?.trim();
  const hasCompetition = Boolean(cleanCompetition || cleanLogo);

  const formattedStatus = formatMatchStatus(status, kickoffTime);
  const hasStatus = formattedStatus.variant !== 'unknown';

  // Collapse cleanly with zero margin or padding jitter when neither competition nor status metadata is available
  if (!hasCompetition && !hasStatus) {
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

      {/* Right: Match Status Badge */}
      {hasStatus && (
        <div className="shrink-0">
          {formattedStatus.variant === 'ft' && (
            <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700/60 bg-zinc-800/70 px-2 py-0.5 text-[10px] font-semibold text-zinc-300 sm:text-xs">
              {formattedStatus.label}
            </span>
          )}

          {formattedStatus.variant === 'live' && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-800/50 bg-rose-950/50 px-2 py-0.5 text-[10px] font-semibold text-rose-300 sm:text-xs">
              <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
              </span>
              {formattedStatus.label}
            </span>
          )}

          {formattedStatus.variant === 'ht' && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-800/50 bg-amber-950/50 px-2 py-0.5 text-[10px] font-semibold text-amber-300 sm:text-xs">
              {formattedStatus.label}
            </span>
          )}

          {formattedStatus.variant === 'upcoming' && (
            <span className="inline-flex items-center gap-1 rounded-full border border-zinc-800/80 bg-zinc-950/60 px-2 py-0.5 font-mono text-[10px] font-medium text-zinc-400 sm:text-xs">
              <Clock className="h-3 w-3 text-zinc-500" aria-hidden="true" />
              {formattedStatus.label}
            </span>
          )}

          {formattedStatus.variant === 'postponed' && (
            <span className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold text-zinc-500 sm:text-xs">
              {formattedStatus.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
