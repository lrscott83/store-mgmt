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

import '@store-mgmt/web-common/styles.css';

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
  const navigate = useNavigate();

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
