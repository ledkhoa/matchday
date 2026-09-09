import { z } from 'zod';
import { parseRedditTitle } from '../lib/parser';

export const RedditPostDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  url: z.url(),
  permalink: z.string(),
  domain: z.string(),
  score: z.number().default(0),
  created_utc: z.number(),
  link_flair_text: z.string().nullable().optional(),
  is_self: z.boolean().default(false),
  stickied: z.boolean().default(false),
});

export const RedditListingResponseSchema = z.object({
  kind: z.literal('Listing'),
  data: z.object({
    after: z.string().nullable().optional(),
    children: z.array(
      z.object({
        kind: z.literal('t3'),
        data: RedditPostDataSchema,
      }),
    ),
  }),
});

const OAuthTokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
});

export type RawRedditPost = z.infer<typeof RedditPostDataSchema>;

export interface HighlightPost {
  id: string;
  name: string;
  title: string;
  url: string;
  permalink: string;
  domain: string;
  score: number;
  createdUtc: number;
  flair: string | null;
}

export interface RedditClientConfig {
  clientId?: string;
  clientSecret?: string;
  userAgent?: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

let inMemoryTokenCache: CachedToken | null = null;

const DEFAULT_USER_AGENT = 'web:matchday-bot:v1.0.0 (by /u/matchday_app)';

async function getOAuthToken(
  clientId: string,
  clientSecret: string,
  userAgent: string,
): Promise<string | null> {
  const now = Date.now();
  if (inMemoryTokenCache && inMemoryTokenCache.expiresAt > now + 60_000) {
    return inMemoryTokenCache.token;
  }

  const credentials = btoa(`${clientId}:${clientSecret}`);

  try {
    const response = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': userAgent,
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      console.warn(
        `[REDDIT_CLIENT] OAuth token request failed with status: ${response.status}`,
      );
      return null;
    }

    const rawJson: unknown = await response.json();
    const parsed = OAuthTokenResponseSchema.safeParse(rawJson);

    if (!parsed.success) {
      return null;
    }

    inMemoryTokenCache = {
      token: parsed.data.access_token,
      expiresAt: now + parsed.data.expires_in * 1000,
    };

    return inMemoryTokenCache.token;
  } catch (error) {
    console.error('[REDDIT_CLIENT] Failed to obtain OAuth token:', error);
    return null;
  }
}

export async function fetchRedditPosts(
  config?: RedditClientConfig,
): Promise<HighlightPost[]> {
  const userAgent = config?.userAgent || DEFAULT_USER_AGENT;
  const clientId = config?.clientId;
  const clientSecret = config?.clientSecret;

  let endpoint = 'https://www.reddit.com/r/soccer/new.json?limit=100';
  const headers = new Headers({
    'User-Agent': userAgent,
  });

  // Attempt OAuth if credentials are provided
  if (clientId && clientSecret) {
    const token = await getOAuthToken(clientId, clientSecret, userAgent);
    if (token) {
      endpoint = 'https://oauth.reddit.com/r/soccer/new?limit=100';
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const response = await fetch(endpoint, { headers });

  if (response.status === 429) {
    const reset = response.headers.get('x-ratelimit-reset') ?? 'unknown';
    console.warn(`[REDDIT_CLIENT] Rate limited (429). Reset in ${reset}s.`);
    return [];
  }

  if (!response.ok) {
    console.error(
      `[REDDIT_CLIENT] Failed to fetch feed. Status: ${response.status} ${response.statusText}`,
    );
    return [];
  }

  const rawJson: unknown = await response.json();
  const parsed = RedditListingResponseSchema.safeParse(rawJson);

  if (!parsed.success) {
    console.error(
      '[REDDIT_CLIENT] Reddit listing schema validation error:',
      parsed.error.format(),
    );
    return [];
  }

  const posts = parsed.data.data.children.map((child) => child.data);

  // Filter candidate posts:
  // 1. Must not be self-posts or stickied threads
  // 2. Flair must be "Media" or "Highlight", OR title must parse cleanly as a goal
  return posts
    .filter((post) => {
      if (post.is_self || post.stickied) return false;

      const flair = post.link_flair_text?.toLowerCase() ?? '';
      const isMediaFlair =
        flair.includes('media') || flair.includes('highlight');
      const isGoalTitle = parseRedditTitle(post.title) !== null;

      return isMediaFlair || isGoalTitle;
    })
    .map((post) => ({
      id: post.id,
      name: post.name,
      title: post.title,
      url: post.url,
      permalink: `https://reddit.com${post.permalink}`,
      domain: post.domain,
      score: post.score,
      createdUtc: post.created_utc,
      flair: post.link_flair_text ?? null,
    }));
}
