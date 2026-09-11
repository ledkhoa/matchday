import { useNavigate } from '@tanstack/react-router';
import { CalendarOff, Calendar, ExternalLink } from 'lucide-react';
import { Button } from '#/components/ui/button';
import { formatDisplayDate, getTodayUtcString } from '#/lib/date-utils';

export interface EmptyStateProps {
  date: string;
  onJumpToToday?: () => void;
}

export function EmptyState({ date, onJumpToToday }: EmptyStateProps) {
  const navigate = useNavigate();
  const formattedDate = formatDisplayDate(date);

  const handleJump = () => {
    if (onJumpToToday) {
      onJumpToToday();
    } else {
      navigate({ to: '/date/$date', params: { date: getTodayUtcString() } });
    }
  };

  return (
    <div
      role="region"
      aria-label="No matches found"
      className="my-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 p-8 text-center sm:p-12"
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-zinc-700/50 bg-zinc-800/60 text-zinc-400 shadow-inner">
        <CalendarOff className="h-7 w-7 text-zinc-400" />
      </div>

      <h3 className="text-lg font-bold text-zinc-100 sm:text-xl">
        No highlights recorded for this day
      </h3>

      <p className="mt-2 max-w-md text-sm text-zinc-400">
        No matches were found or the scraper is still compiling posts for{' '}
        <span className="font-semibold text-zinc-300">{formattedDate}</span>.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button
          onClick={handleJump}
          className="flex items-center gap-2 font-bold shadow-md"
        >
          <Calendar className="h-4 w-4" />
          <span>Jump to Today</span>
        </Button>

        <Button
          variant="outline"
          asChild
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <a
            href="https://reddit.com/r/soccer"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5"
          >
            <span>Visit r/soccer</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
      </div>
    </div>
  );
}
