import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { registerStoreActivity } from './store-usage-tracker';

/**
 * Route-navigation trigger for the daily store-usage tracker. Mirrors
 * Angular's `router.events.pipe(filter(event => event instanceof
 * NavigationEnd)).subscribe(() => this.registerActivity())` — every route
 * change (re)registers today's activity for the current user + selected
 * store, no-op when unauthenticated or no store is selected (guarded inside
 * `registerStoreActivity`).
 *
 * Mounted once from `root.tsx`, inside the router context.
 */
export function useStoreUsageTracker(): void {
  const { pathname } = useLocation();
  const userId = useAuthStore((state) => state.user?.id);
  const selectedStoreId = useAuthStore((state) => state.user?.selectedStoreId);

  useEffect(() => {
    if (!userId || !selectedStoreId) return;
    registerStoreActivity(userId, selectedStoreId);
  }, [pathname, userId, selectedStoreId]);
}
