export interface ResolvedMedia {
  embedUrl: string | null;
  isIframe: boolean;
  directVideoUrl: string | null;
  fallbackUrl: string;
}

interface HostResolver {
  name: string;
  pattern: RegExp;
  resolve: (id: string, originalUrl: string) => ResolvedMedia;
}

const HOST_RESOLVERS: HostResolver[] = [
  {
    name: 'dubz',
    pattern:
      /(?:https?:\/\/)?(?:www\.)?dubz\.(?:co|link)\/(?:c|v|e)\/([a-zA-Z0-9_-]+)/i,
    resolve: (id: string, originalUrl: string) => ({
      embedUrl: `https://dubz.co/e/${id}`,
      isIframe: true,
      directVideoUrl: null,
      fallbackUrl: originalUrl,
    }),
  },
  {
    name: 'streamin',
    pattern:
      /(?:https?:\/\/)?(?:www\.)?streamin\.(?:one|me|link)\/(?:v|e)\/([a-zA-Z0-9_-]+)/i,
    resolve: (id: string, originalUrl: string) => ({
      embedUrl: `https://streamin.one/e/${id}`,
      isIframe: true,
      directVideoUrl: null,
      fallbackUrl: originalUrl,
    }),
  },
  {
    name: 'streamff',
    pattern:
      /(?:https?:\/\/)?(?:www\.)?streamff\.(?:com|link|pro)\/(?:v|e)\/([a-zA-Z0-9_-]+)/i,
    resolve: (id: string, originalUrl: string) => ({
      embedUrl: `https://streamff.com/e/${id}`,
      isIframe: true,
      directVideoUrl: null,
      fallbackUrl: originalUrl,
    }),
  },
  {
    name: 'caulse',
    pattern:
      /(?:https?:\/\/)?(?:www\.)?caulse\.com\/(?:v|e)\/([a-zA-Z0-9_-]+)/i,
    resolve: (id: string, originalUrl: string) => ({
      embedUrl: `https://caulse.com/e/${id}`,
      isIframe: true,
      directVideoUrl: null,
      fallbackUrl: originalUrl,
    }),
  },
  {
    name: 'streamain',
    pattern:
      /(?:https?:\/\/)?(?:www\.)?(?:streamain\.com(?:\/[a-z]{2})?|streama\.in)\/(?:watch\/|embed\/|v\/)?([a-zA-Z0-9_-]+)(?:\/watch)?/i,
    resolve: (id: string, originalUrl: string) => ({
      embedUrl: `https://streamain.com/embed/${id}`,
      isIframe: true,
      directVideoUrl: null,
      fallbackUrl: originalUrl,
    }),
  },
  {
    name: 'v.redd.it',
    pattern: /(?:https?:\/\/)?v\.redd\.it\/([a-zA-Z0-9_-]+)/i,
    resolve: (id: string, originalUrl: string) => ({
      embedUrl: `https://v.redd.it/${id}/DASH_720.mp4`,
      isIframe: false,
      directVideoUrl: `https://v.redd.it/${id}/DASH_720.mp4`,
      fallbackUrl: originalUrl,
    }),
  },
];

export function resolveVideoEmbed(rawUrl: string): ResolvedMedia {
  const trimmedUrl = rawUrl.trim();

  if (!trimmedUrl) {
    return {
      embedUrl: null,
      isIframe: false,
      directVideoUrl: null,
      fallbackUrl: '',
    };
  }

  for (const resolver of HOST_RESOLVERS) {
    const match = trimmedUrl.match(resolver.pattern);
    if (match && match[1]) {
      return resolver.resolve(match[1], trimmedUrl);
    }
  }

  return {
    embedUrl: null,
    isIframe: false,
    directVideoUrl: null,
    fallbackUrl: trimmedUrl,
  };
}
