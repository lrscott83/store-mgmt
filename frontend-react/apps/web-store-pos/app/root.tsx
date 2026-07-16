import { useEffect } from 'react';
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useNavigate,
} from 'react-router';
import type { Route } from './+types/root';
import { I18nProvider } from '~/shared/lib/i18n/i18n-provider';
import { registerServiceWorker } from '~/shared/lib/pwa/service-worker-registration';
import { useStoreUsageTracker } from '~/shared/lib/usage/use-store-usage-tracker';
import { registerAuthRedirect } from '~/shared/lib/stores/auth-store';
import { useLoadingStore } from '~/shared/lib/stores/loading-store';
import { LoadingOverlay } from '@store-mgmt/web-common/client';
import { InstallAppButton } from '~/shared/components/install-app-button';

import '@store-mgmt/web-common/styles.css';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* PWA manifest — mirrors Angular index.html's `<link rel="manifest">`.
            Required for the browser to consider the app installable and fire
            `beforeinstallprompt`; the file lives at public/manifest.webmanifest. */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#22d3ee" />
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
  const navigate = useNavigate();
  const isLoading = useLoadingStore((state) => state.isLoading);

  useEffect(() => {
    registerServiceWorker();
  }, []);

  // Decision 2 (auth-service-parity, Slice 3): give the framework-agnostic
  // auth-store a way to trigger a route change on logout, without the store
  // ever importing react-router directly (mirrors Angular DI-injecting
  // Router into AuthService).
  useEffect(() => {
    registerAuthRedirect(navigate);
  }, [navigate]);

  // Stage 6 Slice C: client-side daily store-usage tracker, mirroring
  // Angular's `StoreUsageTrackerService` nav hook (see
  // `~/shared/lib/usage/store-usage-tracker.ts`).
  useStoreUsageTracker();

  return (
    <>
      {/* Angular app.component.html:2-6 — global overlay renders above the
          router outlet whenever loadingService's request count > 0. */}
      {isLoading && <LoadingOverlay />}
      <Outlet />
      {/* Angular app.component.html — the "Instalar App" pwa-install-btn is
          hosted by AppComponent, which renders <router-outlet> for the WHOLE
          app (landing, login, register, and every authenticated route). This
          root is RR7's true equivalent of AppComponent, so it must mount here
          — not in app-layout.tsx, which only wraps authenticated routes. */}
      <InstallAppButton />
    </>
  );
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
