import { useEffect } from 'react';
import { Play, X, VideoOff, ExternalLink, MessageSquare } from 'lucide-react';
import type { Highlight } from '#/db/schema';
import { resolveVideoEmbed } from '#/lib/video';
import { markHighlightWatched } from '#/stores/watchHistoryStore';

export interface HighlightPlayerProps {
  highlight: Highlight;
  onClose: () => void;
}

function getSourceHostname(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return 'Source Host';
  }
}

export function HighlightPlayer({ highlight, onClose }: HighlightPlayerProps) {
  const media = resolveVideoEmbed(highlight.sourceUrl);
  const effectiveEmbedUrl = media.embedUrl ?? highlight.embedUrl;
  const isDirectVideo = Boolean(media.directVideoUrl && !media.isIframe);
  const hasEmbed = Boolean(effectiveEmbedUrl);
  const isFallback = !isDirectVideo && !hasEmbed;

  useEffect(() => {
    if (highlight.id) {
      markHighlightWatched(highlight.id);
    }
  }, [highlight.id]);

  const redditDiscussionUrl = highlight.redditUrl.startsWith('http')
    ? highlight.redditUrl
    : `https://reddit.com${highlight.redditUrl}`;

  return (
    <div className="mt-4 space-y-2">
      {/* 16:9 Responsive Container */}
      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black shadow-2xl border border-zinc-800">
        {/* Floating Top Bar with Goal Info & Close Button */}
        <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between p-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-auto">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200 truncate pr-2">
            <Play className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
            <span className="truncate">
              {highlight.scorer ?? 'Goal'}{' '}
              {highlight.minute ? `${highlight.minute}` : ''}
            </span>
            {highlight.tag && (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
                {highlight.tag}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 transition-colors border border-zinc-700/60"
            aria-label="Close player"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Media Presentation Engines */}
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
          />
        ) : (
          /* Graceful Fallback for Unsupported Domains */
          <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center bg-zinc-950/95 border border-zinc-800 rounded-xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 border border-zinc-800 text-amber-400 mb-3">
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

      {/* Footer Media Controls & Community Links */}
      {!isFallback && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
          <a
            href={redditDiscussionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-orange-900/40 bg-orange-950/20 px-3 py-1.5 font-medium text-orange-400 transition-colors hover:bg-orange-950/40 hover:text-orange-300"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Reddit Discussion</span>
            <ExternalLink className="h-3 w-3 opacity-70" />
          </a>

          <a
            href={highlight.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-zinc-400 transition-colors hover:text-zinc-200"
          >
            <span className='text-primary'>Source: {getSourceHostname(highlight.sourceUrl)}</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
}
