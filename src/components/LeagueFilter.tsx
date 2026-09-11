import { useState } from 'react';
import { Check, ChevronDown, Trophy, X } from 'lucide-react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '#/components/ui/popover';
import { SUPPORTED_LEAGUES_LIST } from '#/lib/leagues';
import { cn } from '#/lib/utils';

export interface LeagueCount {
  name: string;
  logo: string | null;
  count: number;
}

export interface LeagueFilterProps {
  activeLeague?: string;
  totalMatches: number;
  availableLeagues: LeagueCount[];
  onSelectLeague: (league?: string) => void;
}

export function LeagueFilter({
  activeLeague,
  totalMatches,
  availableLeagues,
  onSelectLeague,
}: LeagueFilterProps) {
  const [open, setOpen] = useState(false);

  // Map of available match counts by league name for fast lookup
  const countMap = new Map<string, number>();
  for (const l of availableLeagues) {
    countMap.set(l.name, l.count);
  }

  const isAllActive = !activeLeague;

  // Check if activeLeague is outside availableLeagues (e.g., filtered to a league with 0 matches)
  const isCustomActive =
    Boolean(activeLeague) &&
    !availableLeagues.some((l) => l.name === activeLeague);

  return (
    <div
      aria-label="Filter matches by competition"
      className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-none"
    >
      {/* "All" Pill */}
      <button
        type="button"
        role="button"
        aria-pressed={isAllActive}
        onClick={() => onSelectLeague(undefined)}
        className={cn(
          'flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500',
          isAllActive
            ? 'border border-yellow-500 bg-blue-950/70 text-yellow-200 ring-1 ring-yellow-500 shadow-[0_0_12px_rgba(255,209,0,0.2)]'
            : 'border border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
        )}
      >
        <span>All</span>
        <span
          className={cn(
            'flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums',
            isAllActive
              ? 'bg-yellow-500/20 text-yellow-300'
              : 'bg-zinc-800 text-zinc-400',
          )}
        >
          {totalMatches}
        </span>
      </button>

      {/* Active Day Leagues */}
      {availableLeagues.map((league) => {
        const isSelected = activeLeague === league.name;
        return (
          <button
            key={league.name}
            type="button"
            role="button"
            aria-pressed={isSelected}
            onClick={() => onSelectLeague(isSelected ? undefined : league.name)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500',
              isSelected
                ? 'border border-yellow-500 bg-blue-950/70 text-yellow-200 ring-1 ring-yellow-500 shadow-[0_0_12px_rgba(255,209,0,0.2)]'
                : 'border border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
            )}
          >
            {league.logo ? (
              <img
                src={league.logo}
                alt=""
                aria-hidden="true"
                className="h-4 w-4 shrink-0 object-contain"
              />
            ) : (
              <Trophy className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            )}
            <span className="truncate max-w-[140px] sm:max-w-[200px]">
              {league.name}
            </span>
            <span
              className={cn(
                'flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums',
                isSelected
                  ? 'bg-yellow-500/20 text-yellow-300'
                  : 'bg-zinc-800 text-zinc-400',
              )}
            >
              {league.count}
            </span>
          </button>
        );
      })}

      {/* Scoped Active League with 0 matches (if navigated directly or selected via dropdown) */}
      {isCustomActive && (
        <button
          type="button"
          role="button"
          aria-pressed={true}
          onClick={() => onSelectLeague(undefined)}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-yellow-500 bg-blue-950/70 px-3 py-1.5 text-xs font-semibold text-yellow-200 ring-1 ring-yellow-500 shadow-[0_0_12px_rgba(255,209,0,0.2)]"
        >
          <Trophy className="h-3.5 w-3.5 shrink-0 text-yellow-400" />
          <span className="truncate max-w-[140px]">{activeLeague}</span>
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow-500/20 px-1 text-[10px] font-bold text-yellow-300 tabular-nums">
            0
          </span>
          <X className="h-3.5 w-3.5 ml-0.5 text-yellow-400 hover:text-yellow-200" />
        </button>
      )}

      {/* "All 14 Leagues" Dropdown / Popover */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="View all supported competitions"
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500',
              open
                ? 'border-zinc-700 bg-zinc-800 text-zinc-200'
                : 'border-zinc-800/80 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
            )}
          >
            <Trophy className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
            <span className="hidden sm:inline">All Competitions</span>
            <span className="sm:hidden">More</span>
            <ChevronDown className="h-3 w-3 shrink-0 text-zinc-500" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          className="w-72 max-h-80 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-2 text-zinc-100 shadow-2xl"
        >
          <div className="px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-zinc-400 border-b border-zinc-800/80 mb-1">
            Supported Competitions
          </div>
          <div className="space-y-0.5">
            {SUPPORTED_LEAGUES_LIST.map((league) => {
              const isSelected = activeLeague === league.name;
              const matchCount = countMap.get(league.name) ?? 0;

              return (
                <button
                  key={league.id}
                  type="button"
                  onClick={() => {
                    onSelectLeague(isSelected ? undefined : league.name);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors text-left',
                    isSelected
                      ? 'bg-blue-950/70 text-yellow-200 font-semibold'
                      : 'text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100',
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="truncate">{league.name}</div>
                    <span className="text-[10px] text-zinc-500 shrink-0">
                      ({league.country})
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 pl-2">
                    <span
                      className={cn(
                        'flex h-4.5 min-w-[20px] items-center justify-center rounded-md px-1 text-[10px] tabular-nums',
                        matchCount > 0
                          ? 'bg-yellow-500/20 font-bold text-yellow-400'
                          : 'font-medium text-zinc-600',
                      )}
                    >
                      {matchCount}
                    </span>
                    <span className="flex h-3.5 w-3.5 items-center justify-center shrink-0">
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 text-yellow-400" />
                      )}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
