import { describe, it, expect, afterEach } from 'bun:test';
import {
  RedditPostDataSchema,
  RedditListingResponseSchema,
  fetchRedditPosts,
  clearTokenCache,
} from './reddit';

describe('Reddit Schemas', () => {
  it('validates a valid Reddit post item with z.url()', () => {
    const validPost = {
      id: 'abc123',
      name: 't3_abc123',
      title: "Arsenal [1] - 0 Chelsea - Bukayo Saka 45'",
      url: 'https://dubz.co/c/abc123',
      permalink: '/r/soccer/comments/abc123/arsenal_1_0_chelsea/',
      domain: 'dubz.co',
      score: 1250,
      created_utc: 1757424000,
      link_flair_text: 'Media',
      is_self: false,
      stickied: false,
    };

    const result = RedditPostDataSchema.safeParse(validPost);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('abc123');
      expect(result.data.url).toBe('https://dubz.co/c/abc123');
    }
  });

  it('rejects invalid URL structures', () => {
    const invalidPost = {
      id: 'abc123',
      name: 't3_abc123',
      title: "Arsenal [1] - 0 Chelsea - Bukayo Saka 45'",
      url: 'not-a-valid-url',
      permalink: '/r/soccer/comments/abc123/arsenal_1_0_chelsea/',
      domain: 'dubz.co',
      score: 1250,
      created_utc: 1757424000,
      link_flair_text: 'Media',
      is_self: false,
      stickied: false,
    };

    const result = RedditPostDataSchema.safeParse(invalidPost);
    expect(result.success).toBe(false);
  });

  it('validates a complete Reddit Listing response payload', () => {
    const listingPayload = {
      kind: 'Listing',
      data: {
        after: 't3_xyz',
        children: [
          {
            kind: 't3',
            data: {
              id: 'p1',
              name: 't3_p1',
              title: "Arsenal [1] - 0 Chelsea - Bukayo Saka 45'",
              url: 'https://dubz.co/c/p1',
              permalink: '/r/soccer/comments/p1/arsenal/',
              domain: 'dubz.co',
              score: 500,
              created_utc: 1757424000,
              link_flair_text: 'Media',
              is_self: false,
              stickied: false,
            },
          },
        ],
      },
    };

    const result = RedditListingResponseSchema.safeParse(listingPayload);
    expect(result.success).toBe(true);
  });
});

function createMockFetch(
  handler: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>,
): typeof fetch {
  return Object.assign(
    (input: string | URL | Request, init?: RequestInit) => handler(input, init),
    { preconnect: () => {} },
  );
}

describe('fetchRedditPosts', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearTokenCache();
  });

  it('returns empty array when rate limited (429)', async () => {
    globalThis.fetch = createMockFetch(
      async () =>
        new Response(null, {
          status: 429,
          headers: { 'x-ratelimit-reset': '30' },
        }),
    );

    const posts = await fetchRedditPosts();
    expect(posts).toEqual([]);
  });

  it('filters out self-posts, stickied posts, and non-goal/non-media posts', async () => {
    const mockListing = {
      kind: 'Listing',
      data: {
        children: [
          {
            kind: 't3',
            data: {
              id: 'goal1',
              name: 't3_goal1',
              title: "Arsenal [1] - 0 Chelsea - Bukayo Saka 45'",
              url: 'https://dubz.co/c/goal1',
              permalink: '/r/soccer/comments/goal1/arsenal/',
              domain: 'dubz.co',
              score: 1000,
              created_utc: 1757424000,
              link_flair_text: null,
              is_self: false,
              stickied: false,
            },
          },
          {
            kind: 't3',
            data: {
              id: 'stickied1',
              name: 't3_stickied1',
              title: "Arsenal [2] - 0 Chelsea - Martinelli 60'",
              url: 'https://dubz.co/c/stickied1',
              permalink: '/r/soccer/comments/stickied1/arsenal/',
              domain: 'dubz.co',
              score: 2000,
              created_utc: 1757424000,
              link_flair_text: 'Media',
              is_self: false,
              stickied: true,
            },
          },
          {
            kind: 't3',
            data: {
              id: 'self1',
              name: 't3_self1',
              title: 'Match Thread: Arsenal vs Chelsea',
              url: 'https://reddit.com/r/soccer/comments/self1/',
              permalink: '/r/soccer/comments/self1/',
              domain: 'self.soccer',
              score: 300,
              created_utc: 1757424000,
              link_flair_text: 'Match Thread',
              is_self: true,
              stickied: false,
            },
          },
          {
            kind: 't3',
            data: {
              id: 'other1',
              name: 't3_other1',
              title: 'Fabrizio Romano update on transfer saga',
              url: 'https://twitter.com/fabrizio/status/1',
              permalink: '/r/soccer/comments/other1/',
              domain: 'twitter.com',
              score: 80,
              created_utc: 1757424000,
              link_flair_text: 'News',
              is_self: false,
              stickied: false,
            },
          },
        ],
      },
    };

    globalThis.fetch = createMockFetch(
      async () =>
        new Response(JSON.stringify(mockListing), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

    const posts = await fetchRedditPosts();
    expect(posts.length).toBe(1);
    expect(posts[0].id).toBe('goal1');
    expect(posts[0].permalink).toBe(
      'https://reddit.com/r/soccer/comments/goal1/arsenal/',
    );
  });

  it('authenticates via OAuth when client credentials are provided', async () => {
    let oauthTokenRequested = false;
    let listingAuthorizationHeader = '';

    globalThis.fetch = createMockFetch(
      async (input: string | URL | Request, init?: RequestInit) => {
        const urlStr =
          input instanceof Request
            ? input.url
            : input instanceof URL
              ? input.href
              : String(input);

        if (urlStr.includes('/api/v1/access_token')) {
          oauthTokenRequested = true;
          return new Response(
            JSON.stringify({
              access_token: 'test_token_123',
              expires_in: 3600,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        if (urlStr.includes('oauth.reddit.com')) {
          listingAuthorizationHeader =
            new Headers(init?.headers).get('Authorization') ?? '';
          return new Response(
            JSON.stringify({
              kind: 'Listing',
              data: {
                children: [
                  {
                    kind: 't3',
                    data: {
                      id: 'oauth_post1',
                      name: 't3_oauth_post1',
                      title: "Arsenal [1] - 0 Chelsea - Saka 10'",
                      url: 'https://dubz.co/c/oauth1',
                      permalink: '/r/soccer/comments/oauth1/',
                      domain: 'dubz.co',
                      score: 999,
                      created_utc: 1757424000,
                      link_flair_text: 'Media',
                      is_self: false,
                      stickied: false,
                    },
                  },
                ],
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        return new Response(null, { status: 404 });
      },
    );

    const posts = await fetchRedditPosts({
      clientId: 'my_id',
      clientSecret: 'my_secret',
    });

    expect(oauthTokenRequested).toBe(true);
    expect(listingAuthorizationHeader).toBe('Bearer test_token_123');
    expect(posts.length).toBe(1);
    expect(posts[0].id).toBe('oauth_post1');
  });

  it('uses custom user agent when configured', async () => {
    let capturedUserAgent = '';

    globalThis.fetch = createMockFetch(
      async (_input: string | URL | Request, init?: RequestInit) => {
        capturedUserAgent = new Headers(init?.headers).get('User-Agent') ?? '';
        return new Response(
          JSON.stringify({ kind: 'Listing', data: { children: [] } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    );

    await fetchRedditPosts({ userAgent: 'CustomTestAgent/1.0' });
    expect(capturedUserAgent).toBe('CustomTestAgent/1.0');
  });

  it('handles 429 rate limit without x-ratelimit-reset header', async () => {
    globalThis.fetch = createMockFetch(
      async () =>
        new Response(null, {
          status: 429,
        }),
    );

    const posts = await fetchRedditPosts();
    expect(posts).toEqual([]);
  });

  it('handles HTTP error responses (500, 503) gracefully', async () => {
    globalThis.fetch = createMockFetch(
      async () =>
        new Response('Internal Server Error', {
          status: 500,
          statusText: 'Internal Server Error',
        }),
    );

    const posts = await fetchRedditPosts();
    expect(posts).toEqual([]);
  });

  it('handles malformed JSON or schema mismatches gracefully', async () => {
    globalThis.fetch = createMockFetch(
      async () =>
        new Response(JSON.stringify({ unexpected: 'format' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

    const posts = await fetchRedditPosts();
    expect(posts).toEqual([]);
  });

  it('includes posts with Highlight flair even if title is non-standard', async () => {
    const mockListing = {
      kind: 'Listing',
      data: {
        children: [
          {
            kind: 't3',
            data: {
              id: 'flair_post',
              name: 't3_flair_post',
              title: 'Great Skill / Build Up Play in Midfield',
              url: 'https://dubz.co/c/flair1',
              permalink: '/r/soccer/comments/flair1/',
              domain: 'dubz.co',
              score: 450,
              created_utc: 1757424000,
              link_flair_text: 'Highlight',
              is_self: false,
              stickied: false,
            },
          },
        ],
      },
    };

    globalThis.fetch = createMockFetch(
      async () =>
        new Response(JSON.stringify(mockListing), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

    const posts = await fetchRedditPosts();
    expect(posts.length).toBe(1);
    expect(posts[0].id).toBe('flair_post');
    expect(posts[0].flair).toBe('Highlight');
  });
});
