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

  it('resolves streamin.one clip to iframe embed', () => {
    const result = resolveVideoEmbed('https://streamin.one/v/stm456');
    expect(result).toEqual({
      embedUrl: 'https://streamin.one/e/stm456',
      isIframe: true,
      directVideoUrl: null,
      fallbackUrl: 'https://streamin.one/v/stm456',
    });
  });

  it('resolves streamin.me clip to streamin.one iframe embed', () => {
    const result = resolveVideoEmbed('https://streamin.me/e/stm789');
    expect(result).toEqual({
      embedUrl: 'https://streamin.one/e/stm789',
      isIframe: true,
      directVideoUrl: null,
      fallbackUrl: 'https://streamin.me/e/stm789',
    });
  });

  it('resolves streamff.com clip to iframe embed', () => {
    const result = resolveVideoEmbed('https://streamff.com/v/sff123');
    expect(result).toEqual({
      embedUrl: 'https://streamff.com/e/sff123',
      isIframe: true,
      directVideoUrl: null,
      fallbackUrl: 'https://streamff.com/v/sff123',
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

  it('resolves v.redd.it clip to direct video player format', () => {
    const result = resolveVideoEmbed('https://v.redd.it/rdt123');
    expect(result).toEqual({
      embedUrl: 'https://v.redd.it/rdt123/DASH_720.mp4',
      isIframe: false,
      directVideoUrl: 'https://v.redd.it/rdt123/DASH_720.mp4',
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
      'https://v.redd.it/rdt123?source=fallback#t=10',
    );
    expect(result2).toEqual({
      embedUrl: 'https://v.redd.it/rdt123/DASH_720.mp4',
      isIframe: false,
      directVideoUrl: 'https://v.redd.it/rdt123/DASH_720.mp4',
      fallbackUrl: 'https://v.redd.it/rdt123?source=fallback#t=10',
    });
  });

  it('handles case-insensitive domains', () => {
    const result = resolveVideoEmbed('HTTPS://WWW.STREAMIN.ONE/V/CAPS123');
    expect(result.embedUrl).toBe('https://streamin.one/e/CAPS123');
    expect(result.isIframe).toBe(true);
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
