import { useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import { Sidebar } from './sidebar';
import { Navbar } from './navbar';
import { Breadcrumbs } from './breadcrumbs';
import { Footer } from './footer';
import { PaymentBanner } from './payment-banner';
import { authLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { OFFLINE_SESSION_TOKEN } from '~/shared/lib/offline/offline-session';
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
        </main>
        <Footer />
      </div>
    </div>
  );
}

// React Router 7 renders a layout() route from the module's DEFAULT export.
// Without this the navbar/sidebar/breadcrumbs/footer chrome never mounts and
// child routes render bare.
export default AppLayout;
