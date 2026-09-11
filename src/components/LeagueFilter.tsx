import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Trophy,
  X,
} from 'lucide-react';
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

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

  // Track horizontal scroll state to show/hide chevrons and apply edge-fade masks
  const updateScrollState = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 2);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    updateScrollState();

    const handleScroll = () => updateScrollState();
    el.addEventListener('scroll', handleScroll, { passive: true });

    let resizeObserver: ResizeObserver | null = null;
    if ('ResizeObserver' in globalThis) {
      resizeObserver = new ResizeObserver(() => updateScrollState());
      resizeObserver.observe(el);
    }

    return () => {
      el.removeEventListener('scroll', handleScroll);
      resizeObserver?.disconnect();
    };
  }, [updateScrollState, availableLeagues]);

  // Smooth step scroll for desktop chevrons
  const scroll = (direction: 'left' | 'right') => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const offset = direction === 'left' ? -220 : 220;
    el.scrollBy({ left: offset, behavior: 'smooth' });
  };

  // Auto-scroll active pill into view when activeLeague changes
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !activeLeague) return;

    // SAFETY: Elements rendered inside the filter track are HTMLElements
    const activeEl = el.querySelector(
      '[data-active="true"]',
    ) as HTMLElement | null;
    if (activeEl && 'scrollIntoView' in activeEl) {
      activeEl.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [activeLeague]);

  return (
    <div
      aria-label="Filter matches by competition"
      className="relative flex items-center gap-2.5 w-full"
    >
      {/* Scrollable Viewport Container */}
      <div className="relative flex-1 min-w-0 flex items-center group">
        {/* Left Scroll Chevron (Desktop / Mouse) */}
        {canScrollLeft && (
          <button
            type="button"
            aria-label="Scroll competitions left"
            onClick={() => scroll('left')}
            className="absolute left-0 z-10 hidden sm:flex h-7 w-7 -translate-x-1 items-center justify-center rounded-full border border-zinc-700/80 bg-zinc-900/90 text-zinc-300 shadow-md backdrop-blur-xs transition hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        {/* Scrollable Pill Track with Dynamic Edge-Fade Masks */}
        <div
          ref={scrollContainerRef}
          className={cn(
            'flex items-center gap-2 overflow-x-auto py-1 scrollbar-none',
            canScrollLeft && canScrollRight && 'mask-edges-both',
            canScrollLeft && !canScrollRight && 'mask-edges-left',
            !canScrollLeft && canScrollRight && 'mask-edges-right',
          )}
        >
          {/* "All" Pill */}
          <button
            type="button"
            role="button"
            data-active={isAllActive}
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
                data-active={isSelected}
                aria-pressed={isSelected}
                onClick={() =>
                  onSelectLeague(isSelected ? undefined : league.name)
                }
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500',
                  isSelected
                    ? 'border border-yellow-500 bg-blue-950/70 text-yellow-200 ring-1 ring-yellow-500 shadow-[0_0_12px_rgba(255,209,0,0.2)]'
                    : 'border border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
                )}
              >
                {league.logo ? (
                  <div className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded bg-white p-0.5 shadow-xs">
                    <img
                      src={league.logo}
                      alt=""
                      aria-hidden="true"
                      className="h-full w-full object-contain"
                    />
                  </div>
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

          {/* Scoped Active League with 0 matches (if chosen via Popover) */}
          {isCustomActive && (
            <button
              type="button"
              role="button"
              data-active={true}
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
        </div>

        {/* Right Scroll Chevron (Desktop / Mouse) */}
        {canScrollRight && (
          <button
            type="button"
            aria-label="Scroll competitions right"
            onClick={() => scroll('right')}
            className="absolute right-0 z-10 hidden sm:flex h-7 w-7 translate-x-1 items-center justify-center rounded-full border border-zinc-700/80 bg-zinc-900/90 text-zinc-300 shadow-md backdrop-blur-xs transition hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Visual Separator */}
      <div className="h-5 w-px bg-zinc-800 shrink-0" aria-hidden="true" />

      {/* Pinned Right: "All Supported Leagues" Dropdown / Popover */}
      <div className="shrink-0">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="View all supported competitions"
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500',
                open
                  ? 'border-zinc-700 bg-zinc-800 text-zinc-200'
                  : isCustomActive
                    ? 'border-yellow-500/70 bg-blue-950/60 text-yellow-300'
                    : 'border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
              )}
            >
              <Trophy
                className={cn(
                  'h-3.5 w-3.5 shrink-0',
                  isCustomActive ? 'text-yellow-400' : 'text-zinc-400',
                )}
              />
              <span className="hidden sm:inline">All Competitions</span>
              <span className="sm:hidden text-xs">More</span>
              <ChevronDown className="h-3 w-3 shrink-0 text-zinc-500" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            className="w-72 max-h-80 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-2 text-zinc-100 shadow-2xl"
          >
            <div className="px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-zinc-400 border-b border-zinc-800/80 mb-1 flex items-center justify-between">
              <span>Supported Competitions</span>
              <span className="text-[10px] text-zinc-500 font-normal">
                ({SUPPORTED_LEAGUES_LIST.length})
              </span>
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
    </div>
  );
}
