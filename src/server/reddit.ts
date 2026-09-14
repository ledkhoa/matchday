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

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

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
 * Parses Reddit Atom XML feed using a lightweight streaming regex scanner.
 * Avoids the heavy CPU penalty of full DOM/XML parsers and Zod schemas, keeping
 * Cloudflare Workers cron execution well within the 10ms CPU quota.
 */
export function parseAtomFeed(xmlText: string): HighlightPost[] {
  const results: HighlightPost[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(xmlText)) !== null) {
    const entryXml = match[1];

    const titleMatch = entryXml.match(/<title(?:[^>]*)>([\s\S]*?)<\/title>/i);
    if (!titleMatch) continue;
    const title = decodeXmlEntities(titleMatch[1].trim());
    if (!title) continue;

    // Filter out non-goal post titles immediately
    if (!parseRedditTitle(title)) {
      continue;
    }

    const contentMatch = entryXml.match(
      /<content(?:[^>]*)>([\s\S]*?)<\/content>/i,
    );
    const contentStr = contentMatch ? contentMatch[1] : '';
    const sourceUrl = extractMediaUrlFromAtomContent(contentStr);
    if (!sourceUrl || sourceUrl.includes('reddit.com/r/soccer/comments')) {
      continue;
    }

    // Canonical Reddit ID (e.g. "t3_1wc7ce0" -> id: "1wc7ce0", name: "t3_1wc7ce0")
    const idMatch = entryXml.match(/<id(?:[^>]*)>([\s\S]*?)<\/id>/i);
    const rawId = idMatch ? idMatch[1].trim() : '';
    const cleanId = rawId.startsWith('t3_')
      ? rawId.slice(3)
      : rawId.replace(/^.*\/comments\//, '').split('/')[0] || rawId;
    const name = cleanId.startsWith('t3_') ? cleanId : `t3_${cleanId}`;

    const linkMatch = entryXml.match(/<link\s+[^>]*href=["']([^"']+)["']/i);
    const permalink = linkMatch ? linkMatch[1] : '';

    const pubMatch =
      entryXml.match(/<published(?:[^>]*)>([\s\S]*?)<\/published>/i) ||
      entryXml.match(/<updated(?:[^>]*)>([\s\S]*?)<\/updated>/i);
    const publishedIso = pubMatch ? pubMatch[1].trim() : '';
    const createdUtc = publishedIso
      ? Math.floor(new Date(publishedIso).getTime() / 1000)
      : Math.floor(Date.now() / 1000);

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
  return parseAtomFeed(xmlText);
}
