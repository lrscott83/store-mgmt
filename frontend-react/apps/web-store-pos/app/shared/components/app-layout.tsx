import { useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import { Sidebar } from './sidebar';
import { Navbar } from './navbar';
import { Breadcrumbs } from './breadcrumbs';
import { Footer } from './footer';
import { authLoader } from '~/auth/routes/loaders';

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

export function AppLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useAutoCollapseSidebar();

  useEffect(() => {
    // PWA-02: post-auth precaching of remaining route chunks
    // Trigger service worker to precache all app chunks after auth
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'PRECACHE_APP_CHUNKS' });
    }
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar — overlays content when open (fixed positioning), never pushes it */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main area — keeps full width regardless of sidebar state */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Navbar isSidebarOpen={isSidebarOpen} onSidebarToggle={() => setIsSidebarOpen((v) => !v)} />
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
