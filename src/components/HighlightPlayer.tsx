import { useState, useEffect, useId } from 'react';
import {
  Play,
  X,
  VideoOff,
  ExternalLink,
  MessageSquare,
  Globe,
} from 'lucide-react';
import type { Highlight } from '#/db/schema';
import { resolveVideoEmbed } from '#/lib/video';
import { markHighlightWatched } from '#/stores/watchHistoryStore';
import { getTagCategory } from '#/lib/formatters';
import { cn } from '#/lib/utils';

export interface HighlightPlayerProps {
  highlight: Highlight;
  onClose: () => void;
  goalScore?: string | null;
}

function getSourceHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Source Host';
  }
}

export function HighlightPlayer({
  highlight,
  onClose,
  goalScore,
}: HighlightPlayerProps) {
  const media = resolveVideoEmbed(highlight.sourceUrl, highlight.redditUrl);
  const [playbackError, setPlaybackError] = useState(false);
  const titleId = useId();

  useEffect(() => {
    setPlaybackError(false);
  }, [highlight.id]);

  const isDirectVideo =
    Boolean(media.directVideoUrl && !media.isIframe) && !playbackError;
  const effectiveEmbedUrl =
    !playbackError && !isDirectVideo
      ? (media.embedUrl ?? highlight.embedUrl)
      : null;
  const hasEmbed = Boolean(effectiveEmbedUrl);

  useEffect(() => {
    if (highlight.id) {
      markHighlightWatched(highlight.id);
    }
  }, [highlight.id]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const redditDiscussionUrl = highlight.redditUrl.startsWith('http')
    ? highlight.redditUrl
    : `https://reddit.com${highlight.redditUrl}`;

  const tagCategory = getTagCategory(highlight.tag);
  const hostname = getSourceHostname(highlight.sourceUrl);

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      className="mt-4 flex flex-col w-full shadow-2xl rounded-xl transition-all"
    >
      {/* 1. Dedicated External Header Bar (Above Video) */}
      <div className="flex h-11 items-center justify-between px-3.5 py-2 rounded-t-xl border-t border-x border-zinc-800 bg-zinc-900/95 backdrop-blur-md">
        {/* Left: Metadata Group */}
        <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
          {/* Active playback indicator */}
          <Play
            className="h-3.5 w-3.5 shrink-0 fill-yellow-400 text-yellow-400"
            aria-hidden="true"
          />

          {/* Goal Scorer & Minute */}
          <span
            id={titleId}
            title={highlight.scorer ?? highlight.title}
            className="truncate text-xs sm:text-sm font-bold text-zinc-100 max-w-[180px] sm:max-w-[320px]"
          >
            {highlight.scorer ?? 'Goal'}{' '}
            {highlight.minute ? `${highlight.minute}` : ''}
          </span>

          {/* Scoreline Context (if available) */}
          {goalScore && (
            <span className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums border border-zinc-800 bg-zinc-950/80 text-zinc-400">
              {goalScore}
            </span>
          )}

          {/* Tag Badge */}
          {highlight.tag && (
            <span
              className={cn(
                'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider',
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
              {highlight.tag}
            </span>
          )}
        </div>

        {/* Right: Dismiss Control */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close player"
          title="Close player (Esc)"
          className="relative flex h-7 w-7 items-center justify-center rounded-full border border-zinc-700/60 bg-zinc-800/80 text-zinc-400 transition-colors hover:border-zinc-600 hover:bg-zinc-700 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500 before:absolute before:-inset-2 before:content-[''] sm:before:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 2. Unobstructed 16:9 Video Canvas */}
      <div className="relative aspect-video w-full overflow-hidden bg-black border-x border-zinc-800">
        {isDirectVideo ? (
          <video
            key={media.directVideoUrl!}
            src={media.directVideoUrl!}
            controls
            playsInline
            autoPlay
            preload="metadata"
            className="h-full w-full object-contain bg-black"
            aria-label={highlight.title}
            onError={() => setPlaybackError(true)}
          />
        ) : hasEmbed ? (
          <iframe
            key={effectiveEmbedUrl!}
            src={effectiveEmbedUrl!}
            title={highlight.title}
            allow="autoplay; fullscreen; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
            className="h-full w-full border-0 bg-black"
            onError={() => setPlaybackError(true)}
          />
        ) : (
          /* Graceful Fallback Card */
          <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center bg-zinc-950/95">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 border border-zinc-800 text-amber-400 mb-3 shadow-inner">
              <VideoOff className="h-6 w-6" />
            </div>
            <h4 className="text-base font-bold text-zinc-100">
              Direct Playback Unavailable
            </h4>
            <p className="mt-1 text-xs text-zinc-400 max-w-sm">
              This hosting service does not support inline playback. You can
              watch the clip directly on the source host.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
              <a
                href={highlight.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 shadow-md"
              >
                <span>Watch on Source Host</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <a
                href={redditDiscussionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
              >
                <span>Reddit Thread</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* 3. Unified Bottom Action Bar (Below Video) */}
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-b-xl border-b border-x border-zinc-800 bg-zinc-900/90 backdrop-blur-md">
        {/* Reddit Discussion Action */}
        <a
          href={redditDiscussionUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View Reddit discussion thread for this goal (opens in new tab)"
          className="group inline-flex h-8 flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-lg border border-orange-900/50 bg-orange-950/25 px-3 py-1.5 text-xs font-semibold text-orange-400 shadow-xs transition-all duration-150 hover:border-orange-700/70 hover:bg-orange-950/50 hover:text-orange-300 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          <MessageSquare className="h-3.5 w-3.5 shrink-0" />
          <span>Reddit Discussion</span>
          <ExternalLink className="h-3 w-3 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
        </a>

        {/* Source Host Action */}
        <a
          href={highlight.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View original highlight clip on ${hostname} (opens in new tab)`}
          className="group inline-flex h-8 flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-300 shadow-xs transition-all duration-150 hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500"
        >
          <Globe className="h-3.5 w-3.5 shrink-0 text-zinc-400 group-hover:text-zinc-200" />
          <span className="truncate max-w-[160px] sm:max-w-[220px]">
            Source: {hostname}
          </span>
          <ExternalLink className="h-3 w-3 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
        </a>
      </div>
    </div>
  );
}
