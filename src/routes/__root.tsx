import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { TanStackDevtools } from '@tanstack/react-devtools';
import { ExternalLink } from 'lucide-react';

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools';
import { TooltipProvider } from '#/components/ui/tooltip';

import appCss from '../styles.css?url';

import type { QueryClient } from '@tanstack/react-query';

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'MatchDay - Football Highlights Digest',
      },
    ],
    links: [
      {
        rel: 'icon',
        type: 'image/webp',
        href: '/matchday.webp',
      },
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var tz=Intl.DateTimeFormat().resolvedOptions().timeZone;if(tz&&!document.cookie.includes('tz='+encodeURIComponent(tz))){document.cookie='tz='+encodeURIComponent(tz)+';path=/;max-age=31536000;SameSite=Lax';}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-yellow-400/30 selection:text-yellow-200 antialiased font-sans">
        <TooltipProvider>
          <div className="flex min-h-screen flex-col">
            <header className="sticky top-0 z-40 w-full border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur-md">
              <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
                {/* Brand Identity */}
                <Link
                  to="/"
                  className="flex items-center gap-2.5 transition-opacity hover:opacity-90"
                >
                  <img
                    src="/matchday.webp"
                    alt="MatchDay"
                    width={36}
                    height={36}
                    className="h-9 w-9 object-contain"
                  />
                  <span className="text-lg font-black tracking-tight text-zinc-100">
                    MatchDay
                  </span>
                </Link>

                {/* External Links */}
                <div className="flex items-center gap-3">
                  <a
                    href="https://reddit.com/r/soccer"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-100"
                    aria-label="Visit r/soccer on Reddit"
                  >
                    <span>r/soccer</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            </header>

            <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
              {children}
            </main>

            <footer className="mx-auto w-full max-w-4xl border-t border-zinc-900 px-4 py-8 text-center text-xs text-zinc-600">
              MatchDay &copy; {new Date().getFullYear()} &mdash; Automated
              digest from r/soccer. Not affiliated with Reddit.
            </footer>
          </div>

          <TanStackDevtools
            config={{
              position: 'bottom-right',
            }}
            plugins={[
              {
                name: 'Tanstack Router',
                render: <TanStackRouterDevtoolsPanel />,
              },
              TanStackQueryDevtools,
            ]}
          />
        </TooltipProvider>
        <Scripts />
      </body>
    </html>
  );
}
