export interface ResolvedMedia {
  embedUrl: string | null;
  isIframe: boolean;
  directVideoUrl: string | null;
  fallbackUrl: string;
}

interface HostResolver {
  name: string;
  pattern: RegExp;
  resolve: (
    id: string,
    originalUrl: string,
    redditUrl?: string,
  ) => ResolvedMedia;
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
      /(?:https?:\/\/)?(?:www\.)?streamin\.(?:one|me|link)\/(?:v\/|e\/)?([a-zA-Z0-9_-]+)/i,
    resolve: (id: string, originalUrl: string) => ({
      // streamin sends X-Frame-Options: SAMEORIGIN on its embed/video pages,
      // but exposes raw MP4 media directly on its c-cdn/w-cdn endpoints.
      embedUrl: `https://c-cdn.streamin.top/uploads/${id}.mp4`,
      isIframe: false,
      directVideoUrl: `https://c-cdn.streamin.top/uploads/${id}.mp4`,
      fallbackUrl: originalUrl,
    }),
  },
  {
    name: 'streamff',
    pattern:
      /(?:https?:\/\/)?(?:www\.)?streamff\.(?:com|link|pro)\/(?:v\/|e\/)?([a-zA-Z0-9_-]+)/i,
    resolve: (id: string, originalUrl: string) => ({
      // streamff hosts direct MP4 video on cdn.hostedhost.top without iframe restriction or 404 errors.
      embedUrl: `https://cdn.hostedhost.top/${id}.mp4`,
      isIframe: false,
      directVideoUrl: `https://cdn.hostedhost.top/${id}.mp4`,
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
    name: 'clipse',
    pattern:
      /(?:https?:\/\/)?(?:www\.)?clipse\.cloud\/(?:v\/|e\/)?([a-zA-Z0-9_-]+)/i,
    resolve: (id: string, originalUrl: string) => ({
      embedUrl: `https://clipse.cloud/v/${id}`,
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
    resolve: (_id: string, originalUrl: string, redditUrl?: string) => {
      // Reddit blocks direct DASH mp4 streams with 403 Forbidden and splits audio/video.
      // The official Reddit iframe embed player at www.redditmedia.com/mediaembed/<postId>
      // handles synchronized audio/video playback smoothly without CORS or authentication issues.
      const redditPostId = redditUrl?.match(
        /(?:comments|gallery)\/([a-zA-Z0-9]+)/i,
      )?.[1];

      if (redditPostId) {
        return {
          embedUrl: `https://www.redditmedia.com/mediaembed/${redditPostId}`,
          isIframe: true,
          directVideoUrl: null,
          fallbackUrl: originalUrl,
        };
      }

      return {
        embedUrl: null,
        isIframe: false,
        directVideoUrl: null,
        fallbackUrl: originalUrl,
      };
    },
  },
  {
    name: 'reddit',
    pattern:
      /(?:https?:\/\/)?(?:www\.)?reddit\.com\/r\/[a-zA-Z0-9_]+\/comments\/([a-zA-Z0-9]+)/i,
    resolve: (postId: string, originalUrl: string) => ({
      embedUrl: `https://www.redditmedia.com/mediaembed/${postId}`,
      isIframe: true,
      directVideoUrl: null,
      fallbackUrl: originalUrl,
    }),
  },
];

export function resolveVideoEmbed(
  rawUrl: string,
  redditUrl?: string,
): ResolvedMedia {
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
      return resolver.resolve(match[1], trimmedUrl, redditUrl);
    }
  }

  return {
    embedUrl: null,
    isIframe: false,
    directVideoUrl: null,
    fallbackUrl: trimmedUrl,
  };
}
