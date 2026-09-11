import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  ChevronDown,
} from 'lucide-react';
import { Button } from '#/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover';
import { Calendar } from '#/components/ui/calendar';
import { cn } from '#/lib/utils';
import {
  addDaysToIsoDate,
  formatDisplayDate,
  getClientTimezone,
  getTodayDateString,
  isFutureDate,
  isTodayDate,
} from '#/lib/date-utils';

export interface DateNavProps {
  currentDate: string; // ISO format 'YYYY-MM-DD'
}

export function DateNav({ currentDate }: DateNavProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const clientTz = getClientTimezone();

  const prevDate = addDaysToIsoDate(currentDate, -1);
  const nextDate = addDaysToIsoDate(currentDate, 1);
  const isNextDisabled =
    isTodayDate(currentDate, clientTz) || isFutureDate(nextDate, clientTz);

  const [y, m, d] = currentDate.split('-').map(Number);
  const currentDateObj = new Date(y, m - 1, d);

  const handlePrevClick = () => {
    navigate({ to: '/date/$date', params: { date: prevDate } });
  };

  const handleNextClick = () => {
    if (isNextDisabled) return;
    navigate({ to: '/date/$date', params: { date: nextDate } });
  };

  const handleTodayClick = () => {
    navigate({
      to: '/date/$date',
      params: { date: getTodayDateString(clientTz) },
    });
  };

  const handleSelect = (selectedDate: Date | undefined) => {
    if (!selectedDate) return;
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    const targetIso = `${year}-${month}-${day}`;
    setOpen(false);
    navigate({ to: '/date/$date', params: { date: targetIso } });
  };

  return (
    <nav
      aria-label="Date navigation"
      className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5 backdrop-blur-sm sm:gap-4 sm:p-3"
    >
      <div className="flex items-center gap-1.5 sm:gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrevClick}
          aria-label={`Previous day, ${formatDisplayDate(prevDate)}`}
          className="h-9 border-zinc-800 bg-zinc-900/80 px-2.5 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 sm:px-3"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Prev</span>
        </Button>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 border-zinc-800 bg-zinc-900/80 px-2.5 text-zinc-200 hover:bg-zinc-800 hover:text-zinc-100 sm:px-3.5"
              aria-label="Select date from calendar"
            >
              <CalendarIcon className="h-4 w-4 text-yellow-400" />
              <span className="hidden sm:inline font-medium">
                {formatDisplayDate(currentDate)}
              </span>
              <span className="inline sm:hidden font-medium">
                {formatDisplayDate(currentDate, { short: true })}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="center"
            className="w-auto border-zinc-800 bg-zinc-950 p-0 shadow-2xl"
          >
            <Calendar
              mode="single"
              selected={currentDateObj}
              defaultMonth={currentDateObj}
              onSelect={handleSelect}
              disabled={(date) => {
                const todayLocal = getTodayDateString(clientTz);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const iso = `${year}-${month}-${day}`;
                return iso > todayLocal || iso < '2020-01-01';
              }}
            />
          </PopoverContent>
        </Popover>

        <Button
          variant="outline"
          size="sm"
          onClick={handleNextClick}
          disabled={isNextDisabled}
          aria-label={`Next day, ${formatDisplayDate(nextDate)}`}
          className={cn(
            'h-9 border-zinc-800 bg-zinc-900/80 px-2.5 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 sm:px-3',
            isNextDisabled &&
              'opacity-40 cursor-not-allowed pointer-events-none',
          )}
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {!isTodayDate(currentDate, clientTz) && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleTodayClick}
          className="h-9 border-yellow-500/40 bg-yellow-500/10 px-3 text-xs font-semibold text-yellow-300 hover:border-yellow-400/60 hover:bg-yellow-500/20 hover:text-yellow-200"
        >
          Today
        </Button>
      )}
    </nav>
  );
}
