import { describe, it, expect, afterEach } from 'bun:test';
import {
  fetchRedditPosts,
  extractMediaUrlFromAtomContent,
  DEFAULT_BROWSER_USER_AGENT,
} from './reddit';

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

describe('extractMediaUrlFromAtomContent', () => {
  it('extracts URL from XML-escaped HTML content', () => {
    const xmlContent =
      '&amp;#32; submitted by &amp;#32; &lt;a href=&quot;https://www.reddit.com/user/akacesfan&quot;&gt; /u/akacesfan &lt;/a&gt; &lt;br/&gt; &lt;span&gt;&lt;a href=&quot;https://v.redd.it/6vaumedn2moh1&quot;&gt;[link]&lt;/a&gt;&lt;/span&gt;';
    const extracted = extractMediaUrlFromAtomContent(xmlContent);
    expect(extracted).toBe('https://v.redd.it/6vaumedn2moh1');
  });

  it('extracts URL from standard HTML content', () => {
    const htmlContent =
      '<span><a href="https://streamin.one/v/abc12345">[link]</a></span>';
    const extracted = extractMediaUrlFromAtomContent(htmlContent);
    expect(extracted).toBe('https://streamin.one/v/abc12345');
  });

  it('returns null if no [link] anchor tag exists', () => {
    const content = '<p>Just a discussion post without a media link</p>';
    expect(extractMediaUrlFromAtomContent(content)).toBeNull();
  });
});

describe('fetchRedditPosts (RSS Atom Client)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns empty array when rate limited (429)', async () => {
    globalThis.fetch = createMockFetch(
      async () =>
        new Response(null, {
          status: 429,
        }),
    );

    const posts = await fetchRedditPosts();
    expect(posts).toEqual([]);
  });

  it('throws when network error occurs', async () => {
    globalThis.fetch = createMockFetch(async () => {
      throw new Error('Network error');
    });

    expect(fetchRedditPosts()).rejects.toThrow('Network error');
  });

  it('parses valid Atom XML feed entries and extracts highlights', async () => {
    const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <id>t3_1wc7ce0</id>
        <title>DC United [2] - 0 Columbus Crew - Tai Baribo 37'</title>
        <published>2026-09-10T03:21:46+00:00</published>
        <link href="https://www.reddit.com/r/soccer/comments/1wc7ce0/dc_united_2_0_columbus_crew_tai_baribo_37/" />
        <content type="html">&lt;span&gt;&lt;a href=&quot;https://v.redd.it/6vaumedn2moh1&quot;&gt;[link]&lt;/a&gt;&lt;/span&gt;</content>
      </entry>
      <entry>
        <id>t3_non_goal</id>
        <title>Discussion Thread: Weekend Fixtures</title>
        <published>2026-09-10T03:20:00+00:00</published>
        <link href="https://www.reddit.com/r/soccer/comments/non_goal/discussion/" />
        <content type="html">&lt;span&gt;&lt;a href=&quot;https://v.redd.it/dummy&quot;&gt;[link]&lt;/a&gt;&lt;/span&gt;</content>
      </entry>
    </feed>`;

    globalThis.fetch = createMockFetch(
      async () =>
        new Response(mockXml, {
          status: 200,
          headers: { 'Content-Type': 'application/atom+xml' },
        }),
    );

    const posts = await fetchRedditPosts();
    expect(posts.length).toBe(1);
    expect(posts[0].id).toBe('1wc7ce0');
    expect(posts[0].name).toBe('t3_1wc7ce0');
    expect(posts[0].title).toBe(
      "DC United [2] - 0 Columbus Crew - Tai Baribo 37'",
    );
    expect(posts[0].url).toBe('https://v.redd.it/6vaumedn2moh1');
    expect(posts[0].domain).toBe('v.redd.it');
    expect(posts[0].permalink).toBe(
      'https://www.reddit.com/r/soccer/comments/1wc7ce0/dc_united_2_0_columbus_crew_tai_baribo_37/',
    );
  });

  it('uses default browser user agent when none configured', async () => {
    let capturedUserAgent = '';

    globalThis.fetch = createMockFetch(
      async (_input: string | URL | Request, init?: RequestInit) => {
        capturedUserAgent = new Headers(init?.headers).get('User-Agent') ?? '';
        return new Response('<feed></feed>', {
          status: 200,
          headers: { 'Content-Type': 'application/atom+xml' },
        });
      },
    );

    await fetchRedditPosts();
    expect(capturedUserAgent).toBe(DEFAULT_BROWSER_USER_AGENT);
  });
});
