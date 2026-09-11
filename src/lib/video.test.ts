import { describe, it, expect } from 'bun:test';
import { resolveVideoEmbed } from './video';

describe('resolveVideoEmbed', () => {
  it('resolves dubz.co clip to iframe embed', () => {
    const result = resolveVideoEmbed('https://dubz.co/c/abc123');
    expect(result).toEqual({
      embedUrl: 'https://dubz.co/e/abc123',
      isIframe: true,
      directVideoUrl: null,
      fallbackUrl: 'https://dubz.co/c/abc123',
    });
  });

  it('resolves dubz.link clip to dubz.co iframe embed', () => {
    const result = resolveVideoEmbed('https://dubz.link/v/xyz789');
    expect(result).toEqual({
      embedUrl: 'https://dubz.co/e/xyz789',
      isIframe: true,
      directVideoUrl: null,
      fallbackUrl: 'https://dubz.link/v/xyz789',
    });
  });

  it('resolves streamin.one and streamin.link clips to direct video mp4', () => {
    const result = resolveVideoEmbed('https://streamin.one/v/stm456');
    expect(result).toEqual({
      embedUrl: 'https://c-cdn.streamin.top/uploads/stm456.mp4',
      isIframe: false,
      directVideoUrl: 'https://c-cdn.streamin.top/uploads/stm456.mp4',
      fallbackUrl: 'https://streamin.one/v/stm456',
    });

    const linkResult = resolveVideoEmbed('https://streamin.link/v/2d31f39b');
    expect(linkResult).toEqual({
      embedUrl: 'https://c-cdn.streamin.top/uploads/2d31f39b.mp4',
      isIframe: false,
      directVideoUrl: 'https://c-cdn.streamin.top/uploads/2d31f39b.mp4',
      fallbackUrl: 'https://streamin.link/v/2d31f39b',
    });
  });

  it('resolves streamin.me clip to direct video mp4', () => {
    const result = resolveVideoEmbed('https://streamin.me/e/stm789');
    expect(result).toEqual({
      embedUrl: 'https://c-cdn.streamin.top/uploads/stm789.mp4',
      isIframe: false,
      directVideoUrl: 'https://c-cdn.streamin.top/uploads/stm789.mp4',
      fallbackUrl: 'https://streamin.me/e/stm789',
    });
  });

  it('resolves streamff.com and streamff.pro clips to direct video mp4', () => {
    const result = resolveVideoEmbed('https://streamff.com/v/sff123');
    expect(result).toEqual({
      embedUrl: 'https://cdn.hostedhost.top/sff123.mp4',
      isIframe: false,
      directVideoUrl: 'https://cdn.hostedhost.top/sff123.mp4',
      fallbackUrl: 'https://streamff.com/v/sff123',
    });

    const proResult = resolveVideoEmbed('https://streamff.pro/v/87cb92e5');
    expect(proResult).toEqual({
      embedUrl: 'https://cdn.hostedhost.top/87cb92e5.mp4',
      isIframe: false,
      directVideoUrl: 'https://cdn.hostedhost.top/87cb92e5.mp4',
      fallbackUrl: 'https://streamff.pro/v/87cb92e5',
    });
  });

  it('resolves caulse.com clip to iframe embed', () => {
    const result = resolveVideoEmbed('https://caulse.com/v/cls456');
    expect(result).toEqual({
      embedUrl: 'https://caulse.com/e/cls456',
      isIframe: true,
      directVideoUrl: null,
      fallbackUrl: 'https://caulse.com/v/cls456',
    });
  });

  it('resolves clipse.cloud clip to iframe embed', () => {
    const result = resolveVideoEmbed('https://clipse.cloud/v/b60a279f');
    expect(result).toEqual({
      embedUrl: 'https://clipse.cloud/v/b60a279f',
      isIframe: true,
      directVideoUrl: null,
      fallbackUrl: 'https://clipse.cloud/v/b60a279f',
    });
  });

  it('resolves streamain.com and streama.in clips to iframe embed', () => {
    const result1 = resolveVideoEmbed(
      'https://streamain.com/en/NzwSmy4S1oaJDOh/watch',
    );
    expect(result1).toEqual({
      embedUrl: 'https://streamain.com/embed/NzwSmy4S1oaJDOh',
      isIframe: true,
      directVideoUrl: null,
      fallbackUrl: 'https://streamain.com/en/NzwSmy4S1oaJDOh/watch',
    });

    const result2 = resolveVideoEmbed(
      'https://streama.in/NzwSmy4S1oaJDOh/watch',
    );
    expect(result2).toEqual({
      embedUrl: 'https://streamain.com/embed/NzwSmy4S1oaJDOh',
      isIframe: true,
      directVideoUrl: null,
      fallbackUrl: 'https://streama.in/NzwSmy4S1oaJDOh/watch',
    });
  });

  it('resolves v.redd.it clip to reddit media embed when reddit permalink is provided', () => {
    const result = resolveVideoEmbed(
      'https://v.redd.it/20tv4kea1joh1',
      '/r/soccer/comments/1wbrlde/france_22_ecuador_aude_bizet_48_fifa_u20_womens/',
    );
    expect(result).toEqual({
      embedUrl: 'https://www.redditmedia.com/mediaembed/1wbrlde',
      isIframe: true,
      directVideoUrl: null,
      fallbackUrl: 'https://v.redd.it/20tv4kea1joh1',
    });
  });

  it('resolves direct reddit comments URL to mediaembed player', () => {
    const result = resolveVideoEmbed(
      'https://www.reddit.com/r/soccer/comments/1wbrlde/france_22_ecuador/',
    );
    expect(result).toEqual({
      embedUrl: 'https://www.redditmedia.com/mediaembed/1wbrlde',
      isIframe: true,
      directVideoUrl: null,
      fallbackUrl:
        'https://www.reddit.com/r/soccer/comments/1wbrlde/france_22_ecuador/',
    });
  });

  it('falls back cleanly for v.redd.it clip without reddit post context', () => {
    const result = resolveVideoEmbed('https://v.redd.it/rdt123');
    expect(result).toEqual({
      embedUrl: null,
      isIframe: false,
      directVideoUrl: null,
      fallbackUrl: 'https://v.redd.it/rdt123',
    });
  });

  it('falls back cleanly for unsupported domains', () => {
    const url = 'https://twitter.com/user/status/123';
    const result = resolveVideoEmbed(url);
    expect(result).toEqual({
      embedUrl: null,
      isIframe: false,
      directVideoUrl: null,
      fallbackUrl: url,
    });
  });

  it('handles empty or whitespace-only strings gracefully', () => {
    const result = resolveVideoEmbed('   ');
    expect(result).toEqual({
      embedUrl: null,
      isIframe: false,
      directVideoUrl: null,
      fallbackUrl: '',
    });
  });

  it('handles query parameters and hash fragments on supported hosts', () => {
    const result1 = resolveVideoEmbed(
      'https://dubz.co/c/abc123?autoplay=1&muted=true',
    );
    expect(result1).toEqual({
      embedUrl: 'https://dubz.co/e/abc123',
      isIframe: true,
      directVideoUrl: null,
      fallbackUrl: 'https://dubz.co/c/abc123?autoplay=1&muted=true',
    });

    const result2 = resolveVideoEmbed(
      'https://streamff.pro/v/rdt123?source=fallback#t=10',
    );
    expect(result2).toEqual({
      embedUrl: 'https://cdn.hostedhost.top/rdt123.mp4',
      isIframe: false,
      directVideoUrl: 'https://cdn.hostedhost.top/rdt123.mp4',
      fallbackUrl: 'https://streamff.pro/v/rdt123?source=fallback#t=10',
    });
  });

  it('handles case-insensitive domains', () => {
    const result = resolveVideoEmbed('HTTPS://WWW.STREAMIN.ONE/V/CAPS123');
    expect(result.embedUrl).toBe(
      'https://c-cdn.streamin.top/uploads/CAPS123.mp4',
    );
    expect(result.isIframe).toBe(false);
    expect(result.directVideoUrl).toBe(
      'https://c-cdn.streamin.top/uploads/CAPS123.mp4',
    );
  });

  it('falls back cleanly when domain matches but ID is missing', () => {
    const result = resolveVideoEmbed('https://dubz.co/c/');
    expect(result.embedUrl).toBeNull();
    expect(result.fallbackUrl).toBe('https://dubz.co/c/');
  });

  it('handles additional unsupported video hosting domains', () => {
    expect(
      resolveVideoEmbed('https://streamable.com/abcde').embedUrl,
    ).toBeNull();
    expect(
      resolveVideoEmbed('https://youtube.com/watch?v=12345').embedUrl,
    ).toBeNull();
    expect(
      resolveVideoEmbed('https://reddit.com/r/soccer').embedUrl,
    ).toBeNull();
  });
});
