import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import { parseRedditTitle } from '../lib/parser';

export interface HighlightPost {
  id: string;
  name: string;
  title: string;
  url: string;
  permalink: string;
  domain: string;
  createdUtc: number;
  flair: string | null;
}

export interface RedditClientConfig {
  feedUrl?: string;
  userAgent?: string;
}

export const REDDIT_RSS_SEARCH_URL =
  'https://www.reddit.com/r/soccer/search.rss?q=flair:%22Goal+Clip%22+OR+flair:%22Great+Goal%22&restrict_sr=1&sort=new';

export const DEFAULT_BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 MatchDayDigest/1.0';

const AtomContentSchema = z.union([
  z.string(),
  z
    .object({
      '#text': z.string().optional(),
    })
    .transform((obj) => obj['#text'] ?? ''),
]);

const AtomLinkSchema = z.union([
  z.string(),
  z
    .object({
      '@_href': z.string().optional(),
    })
    .transform((obj) => obj['@_href'] ?? ''),
]);

const AtomEntrySchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  published: z.string().optional(),
  updated: z.string().optional(),
  link: AtomLinkSchema.optional(),
  content: AtomContentSchema.optional(),
});

type AtomEntry = z.infer<typeof AtomEntrySchema>;

const AtomFeedSchema = z.object({
  feed: z
    .object({
      entry: z.union([AtomEntrySchema, z.array(AtomEntrySchema)]).optional(),
    })
    .optional(),
});

/**
 * Extracts target media link from Reddit Atom entry content HTML.
 * Handles both standard HTML and XML-entity-escaped HTML formats.
 */
export function extractMediaUrlFromAtomContent(content: string): string | null {
  const match =
    content.match(
      /(?:<a href="|&lt;a href=(?:&quot;|"))((?:https?:)?\/\/[^"&]+)(?:"|&quot;)(?:>|&gt;)\[link\]/i,
    ) || content.match(/<a\s+href="([^"]+)">\[link\]<\/a>/i);

  return match ? match[1] : null;
}

/**
 * Fetches and parses Reddit's search Atom/RSS feed for soccer goal clips.
 * Requires no authentication, eliminating OAuth token or app secret requirements.
 */
export async function fetchRedditPosts(
  config?: RedditClientConfig,
): Promise<HighlightPost[]> {
  const feedUrl = config?.feedUrl || REDDIT_RSS_SEARCH_URL;
  const userAgent = config?.userAgent || DEFAULT_BROWSER_USER_AGENT;

  const response = await fetch(feedUrl, {
    headers: {
      'User-Agent': userAgent,
      Accept: 'application/atom+xml, application/xml, text/xml',
    },
  });

  if (response.status === 429) {
    console.warn('[REDDIT_RSS] Rate limited (429) by Reddit.');
    return [];
  }

  if (!response.ok) {
    console.error(
      `[REDDIT_RSS] Failed to fetch feed. Status: ${response.status} ${response.statusText}`,
    );
    return [];
  }

  const xmlText = await response.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    htmlEntities: true,
  });

  const parsedRaw: unknown = parser.parse(xmlText);
  const parsed = AtomFeedSchema.safeParse(parsedRaw);
  if (!parsed.success || !parsed.data.feed?.entry) {
    return [];
  }

  const rawEntries = parsed.data.feed.entry;
  const entries: AtomEntry[] = Array.isArray(rawEntries)
    ? rawEntries
    : [rawEntries];
  const results: HighlightPost[] = [];

  for (const entry of entries) {
    const title = entry.title?.trim() ?? '';
    if (!title) continue;

    // Filter out non-goal post titles immediately
    if (!parseRedditTitle(title)) {
      continue;
    }

    const contentStr = entry.content ?? '';
    const sourceUrl = extractMediaUrlFromAtomContent(contentStr);
    if (!sourceUrl || sourceUrl.includes('reddit.com/r/soccer/comments')) {
      continue;
    }

    // Determine canonical Reddit ID (e.g., "t3_1wc7ce0" -> id: "1wc7ce0", name: "t3_1wc7ce0")
    const rawId = entry.id ?? '';
    const cleanId = rawId.startsWith('t3_')
      ? rawId.slice(3)
      : rawId.replace(/^.*\/comments\//, '').split('/')[0] || rawId;
    const name = cleanId.startsWith('t3_') ? cleanId : `t3_${cleanId}`;

    const permalink = entry.link ?? '';
    const publishedIso =
      entry.published ?? entry.updated ?? new Date().toISOString();
    const createdUtc = Math.floor(new Date(publishedIso).getTime() / 1000);

    let domain = '';
    try {
      domain = new URL(sourceUrl).hostname.replace(/^www\./, '');
    } catch {
      domain = 'external';
    }

    results.push({
      id: cleanId,
      name,
      title,
      url: sourceUrl,
      permalink,
      domain,
      createdUtc,
      flair: 'Goal Clip',
    });
  }

  return results;
}
