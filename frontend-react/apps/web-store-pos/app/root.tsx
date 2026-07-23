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
import messages from '~/shared/lib/i18n/es';
import { registerServiceWorker } from '~/shared/lib/pwa/service-worker-registration';
import { useStoreUsageTracker } from '~/shared/lib/usage/use-store-usage-tracker';
import { registerAuthRedirect } from '~/shared/lib/stores/auth-store';
import { useLoadingStore } from '~/shared/lib/stores/loading-store';
import { LoadingOverlay } from '@store-mgmt/web-common/client';
import { InstallAppButton } from '~/shared/components/install-app-button';
import { ToastContainer } from 'react-toastify';

import '@store-mgmt/web-common/styles.css';
import 'react-toastify/ReactToastify.css';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Capture `beforeinstallprompt` from an inline classic script that
            runs DURING head parse — before the deferred `type=module` app
            bundle (entry.client.tsx) executes. Chrome fires this event once,
            does not re-dispatch it, and once the service worker + manifest are
            warm it fires before the bundle runs, so the module-scope listener
            in pwa-install-prompt.ts misses it and the "Instalar App" button
            stays disabled. Parking the event on `window.__pwaInstallPrompt`
            lets `initPwaInstallCapture()` adopt it once the bundle loads. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__pwaInstallPrompt=e;});window.addEventListener('appinstalled',function(){window.__pwaInstallPrompt=null;});",
          }}
        />
        {/* Browser tab / bookmark favicon — mirrors Angular index.html's
            `<link rel="icon" type="image/png" href="assets/favicon.png" />`.
            Lives at public/favicon.png. */}
        <link rel="icon" type="image/png" href="/favicon.png" />
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
        {/* Mirrors Angular's ToastrModule.forRoot({ closeButton: true, timeOut: 1000,
            positionClass: 'toast-top-right', preventDuplicates: true }) (app.module.ts:50-55).
            Single global container — react-toastify's event bus fires toasts from anywhere
            in the tree, so mounting more than one here would double-render. Duplicate
            prevention is enforced via a message-keyed `toastId` in `shared/lib/toast.tsx`,
            not a container prop. */}
        <ToastContainer position="top-right" autoClose={1000} closeButton />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const navigate = useNavigate();
  const isLoading = useLoadingStore((state) => state.isLoading);

  // Mirrors Angular's `app.component.ts:57` — `setTimeout(() => updateService.init(), 5000)`:
  // the service-worker update flow (new-version prompt + 15-min poll) starts 5s after boot,
  // not immediately, so it doesn't compete with initial app startup.
  useEffect(() => {
    const timer = setTimeout(() => registerServiceWorker(), 5000);
    return () => clearTimeout(timer);
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
  // ErrorBoundary can render on paths that never reach I18nProvider (e.g. a
  // root-level render error), so it reads the Spanish catalog directly
  // instead of useIntl (view-text-parity).
  let message: string = messages['GENERAL.ERROR'];
  let details: string = messages['GENERAL.RESPONSE.ERROR500_MESSAGE'];
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      message = '404';
      details = messages['GENERAL.RESPONSE.ERROR404_MESSAGE'];
    }
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    // DEV-only stack trace/error.message — technical, not user copy, stays unchanged.
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
