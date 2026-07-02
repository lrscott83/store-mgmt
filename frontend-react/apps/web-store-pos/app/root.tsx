import { useEffect } from 'react';
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from 'react-router';
import type { Route } from './+types/root';
import { I18nProvider } from '~/shared/lib/i18n/i18n-provider';
import { showUpdateAvailable } from '~/shared/lib/blocking-alert';

import '@store-mgmt/web-common/styles.css';

// PWA-01: register the service worker and wire the "new version available"
// prompt, matching Angular's `UpdateService` (SwUpdate → Swal confirm →
// activateUpdate + reload). `vite.config.ts` uses `registerType: 'prompt'` +
// `injectRegister: false`, which means NOTHING registers the service worker
// unless we call `virtual:pwa-register` ourselves — without this, the app's
// entire offline/precache machinery is inert. Client-only / SSR-safe: this
// only runs from a `useEffect` (never during any server-side module
// evaluation), and this app is SPA mode anyway (`ssr:false`,
// react-router.config.ts). Feature-detecting `'serviceWorker' in navigator`
// additionally keeps this inert in environments (and tests) without SW
// support.
function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  void import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({
      onNeedRefresh: () => {
        void showUpdateAvailable(() => {
          void updateSW(true);
        });
      },
      onOfflineReady: () => {
        // Angular's UpdateService has no offline-ready UI either — best-effort log only.
        console.info('App ready to work offline.');
      },
    });
  });
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <I18nProvider>{children}</I18nProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = 'Oops!';
  let details = 'An unexpected error occurred.';
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? '404' : 'Error';
    details =
      error.status === 404
        ? 'The requested page could not be found.'
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
