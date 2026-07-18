import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { cleanOldStoreUsage, isTrackingArmed, registerStoreActivity } from './store-usage-tracker';

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
    // Angular parity: the NavigationEnd subscription only exists when tracking
    // was armed by an explicit login (see `armTracking`). After a page reload it
    // is never re-armed, so the tracker stays dormant — no request on navigation,
    // matching Angular's empty network tab post-reload.
    if (!isTrackingArmed()) return;
    registerStoreActivity(userId, selectedStoreId);
  }, [pathname, userId, selectedStoreId]);

  // Mirrors Angular's unconditional `cleanOldData(30)` call at
  // `app.component.ts:53` (first statement of `ngOnInit`) — fires exactly
  // once on mount, never re-runs on login or store switch. The auth guard
  // lives inside `cleanOldStoreUsage` itself, not at this call-site.
  useEffect(() => {
    const { user } = useAuthStore.getState();
    cleanOldStoreUsage(user?.id ?? '', user?.selectedStoreId ?? '', 30);
  }, []);
}
