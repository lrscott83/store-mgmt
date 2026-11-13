import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { Sidebar } from './sidebar';
import { Navbar } from './navbar';
import { Breadcrumbs } from './breadcrumbs';
import { Footer } from './footer';
import { PaymentBanner } from './payment-banner';
import { authLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { OFFLINE_SESSION_TOKEN } from '~/shared/lib/offline/offline-session';
import { logClientError } from '~/shared/lib/diagnostics/client-log';
import messages from '~/shared/lib/i18n/es';
// Static import (design D5): a dynamic import inside the effect below would
// race cleanup — a timer could arm after unmount. For a guard that must
// NEVER fire on an online session, a static import of this zero-import,
// side-effect-free 15-line module is the safer trade.
import { createIdleTimer } from '~/shared/lib/offline/idle-timeout';

export const clientLoader = authLoader;

const MOBILE_BREAKPOINT = 1025;

/**
 * Sidebar defaults to COLLAPSED (user preference — overrides Angular's
 * expanded-by-default nav). Resize only ever auto-CLOSES the sidebar when
 * crossing into mobile width; it never force-opens it back on desktop,
 * since the collapsed default must survive resizes too.
 */
function useAutoCollapseSidebar(): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function handleResize() {
      if (window.innerWidth < MOBILE_BREAKPOINT) {
        setIsOpen(false);
      }
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return [isOpen, setIsOpen];
}

/**
 * auth-session spec: "Idle lock scoped strictly to offline sessions" (design
 * D5). Arms a 1-hour inactivity timer ONLY when the session's `authToken`
 * is the offline sentinel — every online session (`authToken !== 'offline-
 * session'`) never starts a timer or attaches listeners at all.
 */
function useOfflineIdleLock(): void {
  const authToken = useAuthStore((s) => s.user?.authToken); // selector — matches payment-banner.tsx:21

  useEffect(() => {
    if (authToken !== OFFLINE_SESSION_TOKEN) return; // online sessions: no timer, no listeners

    // Read via getState() inside the callback only (loaders.ts:9 convention)
    // — no stale closure, no extra effect dependency.
    const timer = createIdleTimer(() => useAuthStore.getState().logout());
    timer.start();

    const notify = () => timer.notifyActivity();
    const events = ['mousedown', 'keydown', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, notify));
    document.addEventListener('visibilitychange', notify);

    return () => {
      events.forEach((e) => window.removeEventListener(e, notify));
      document.removeEventListener('visibilitychange', notify);
      timer.stop();
    };
  }, [authToken]);
}

export function AppLayout() {
  useOfflineIdleLock();
  const [isSidebarOpen, setIsSidebarOpen] = useAutoCollapseSidebar();

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar — overlays content when open (fixed positioning), never pushes it */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main area — keeps full width regardless of sidebar state */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Navbar isSidebarOpen={isSidebarOpen} onSidebarToggle={() => setIsSidebarOpen((v) => !v)} />
        <PaymentBanner />
        <Breadcrumbs />
        {/* Angular .coded-content (pc-common.scss): top 16px->24px@md, sides 8px->48px@md,
            and NO bottom padding — so the vertical padding is top-only (pt-*), not py-*. */}
        <main className="flex-1 overflow-y-auto px-2 pt-4 md:px-12 md:pt-6">
          <Outlet />
          <Footer />
        </main>
      </div>
    </div>
  );
}

// React Router 7 renders a layout() route from the module's DEFAULT export.
// Without this the navbar/sidebar/breadcrumbs/footer chrome never mounts and
// child routes render bare.
export default AppLayout;

/**
 * Layout-scoped recovery screen.
 *
 * The router's data strategy can fail to resolve this layout's route
 * (`No result returned from dataStrategy for route app-layout`), and before
 * this boundary the only catch was root.tsx's static page — a dead end with no
 * way back. This boundary replaces the layout instead of rendering inside it:
 * the authenticated chrome never renders here, so a failed loader/strategy
 * cannot trap the user in a half-mounted shell. Retry reloads (the only way to
 * re-run the failed navigation from scratch); the secondary action goes home.
 *
 * Copy comes from the message map directly, like root.tsx's boundary, so the
 * screen still renders if it mounts outside I18nProvider.
 */
export function ErrorBoundary({ error }: { error: unknown }) {
  const navigate = useNavigate();

  // Effect, not render body: a side effect during render fires on discarded
  // renders too, and StrictMode would log the same failure twice.
  useEffect(() => {
    logClientError({
      level: 'error',
      message: error instanceof Error ? error.message : String(error),
      location: error instanceof Error ? error.stack : undefined,
    });
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
      <h1 className="text-2xl font-semibold text-gray-900">{messages['GENERAL.ERROR']}</h1>
      <p className="mt-2 max-w-md text-sm text-gray-600">
        {messages['GENERAL.RESPONSE.ERROR500_MESSAGE']}
      </p>
      {import.meta.env.DEV && error instanceof Error && (
        <pre className="mt-4 max-w-full overflow-x-auto rounded bg-white p-3 text-left text-xs text-gray-700">
          <code>{error.stack ?? error.message}</code>
        </pre>
      )}
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700"
        >
          {messages['GENERAL.RETRY']}
        </button>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
        >
          {messages['GENERAL.GO_HOME']}
        </button>
      </div>
    </main>
  );
}
