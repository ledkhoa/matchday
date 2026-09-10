import { useState } from 'react';
import { getTeamInitials } from '#/lib/formatters';
import { cn } from '#/lib/utils';

export interface TeamCrestProps {
  teamName: string;
  logoUrl?: string | null;
  className?: string;
}

export function TeamCrest({ teamName, logoUrl, className }: TeamCrestProps) {
  const [hasError, setHasError] = useState(false);
  const [prevUrl, setPrevUrl] = useState(logoUrl);

  // Reset error state when the logoUrl prop changes between renders (e.g. data re-fetch)
  if (logoUrl !== prevUrl) {
    setPrevUrl(logoUrl);
    setHasError(false);
  }

  const cleanUrl = logoUrl?.trim();
  // Fallback to stylized circular initials if URL is absent or failed to load
  if (!cleanUrl || hasError) {
    return (
      <div
        aria-hidden="true"
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-xs font-bold text-zinc-200 shadow-inner sm:h-9 sm:w-9',
          className,
        )}
      >
        {getTeamInitials(teamName)}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-800/80 bg-zinc-950/60 p-1 shadow-inner transition-colors hover:border-zinc-700 sm:h-9 sm:w-9',
        className,
      )}
    >
      <img
        src={cleanUrl}
        alt={`${teamName} crest`}
        loading="lazy"
        onError={() => setHasError(true)}
        className="h-full w-full object-contain"
      />
    </div>
  );
}
