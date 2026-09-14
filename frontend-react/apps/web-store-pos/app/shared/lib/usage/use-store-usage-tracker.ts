import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import {
  cleanOldStoreUsage,
  flushUsage,
  isTrackingReady,
  registerStoreActivity,
} from './store-usage-tracker';

/**
 * Stamp-rate limit for the window-level activity listener (STAMPING, not
 * POSTing — the day-level buffer dedups per day and the backend contract is
 * idempotent per store+user+day, so a stamp is a no-op once today is
 * buffered). Prevents every pointer/keyboard event from turning into a
 * localStorage read; the buffer dedup + `flushUsage`'s unsaved-only filter
 * bound network traffic.
 */
const STORE_USAGE_ACTIVITY_THROTTLE_MS = 5 * 60_000;

/**
 * Route-navigation + user-activity trigger for the daily store-usage tracker.
 * Two stamping seams, both gated on `isTrackingReady()` and a live tracking
 * context:
 *
 * 1. Route navigation — mirrors Angular's `router.events.pipe(filter(event =>
 *    event instanceof NavigationEnd)).subscribe(() => this.registerActivity())`;
 *    every route change (re)registers today's activity.
 * 2. Pointer/keyboard activity — stamps today when a user works a single
 *    screen all day (e.g. POS sales) with no navigation, throttled to at most
 *    one stamp per 5 minutes per `userId:selectedStoreId`.
 *
 * PLUS a readiness flush: as soon as a valid context exists, unsaved days left
 * in the buffer (e.g. a failed sync before a reload) are pushed without
 * waiting for the next navigation (reload/version-update re-arm — the tracker
 * is ready again from the persisted session, see `isTrackingReady`).
 *
 * Mounted once from `root.tsx`, inside the router context. Every path is a
 * no-op when unauthenticated or no store is selected (guarded inside
 * `registerStoreActivity`/`flushUsage` too — no anonymous telemetry).
 */
export function useStoreUsageTracker(): void {
  const { pathname } = useLocation();
  const userId = useAuthStore((state) => state.user?.id);
  const selectedStoreId = useAuthStore((state) => state.user?.selectedStoreId);
  // Last stamp timestamp per `userId:selectedStoreId`, so a store switch (or a
  // user switch) never inherits another context's throttle window.
  const lastActivityStamp = useRef(new Map<string, number>());

  // Navigation seam (existing behavior; the armed-only gate is extended to
  // readiness so a persisted session re-arms the tracker after a reload).
  useEffect(() => {
    if (!userId || !selectedStoreId) return;
    if (!isTrackingReady()) return;
    registerStoreActivity(userId, selectedStoreId);
  }, [pathname, userId, selectedStoreId]);

  // Activity seam: any pointer/keyboard interaction while a valid tracking
  // context exists stamps today, at most once every
  // STORE_USAGE_ACTIVITY_THROTTLE_MS per context. Attached/detached on
  // mount/unmount only — never module scope.
  useEffect(() => {
    if (!userId || !selectedStoreId) return;
    if (!isTrackingReady()) return;

    const onUserActivity = () => {
      const throttleKey = `${userId}:${selectedStoreId}`;
      const now = Date.now();
      const last = lastActivityStamp.current.get(throttleKey) ?? 0;
      if (now - last < STORE_USAGE_ACTIVITY_THROTTLE_MS) return;
      lastActivityStamp.current.set(throttleKey, now);
      registerStoreActivity(userId, selectedStoreId);
    };

    window.addEventListener('pointerdown', onUserActivity);
    window.addEventListener('keydown', onUserActivity);
    return () => {
      window.removeEventListener('pointerdown', onUserActivity);
      window.removeEventListener('keydown', onUserActivity);
    };
  }, [userId, selectedStoreId]);

  // Readiness flush: push pending days the moment a valid context exists
  // (covers reload / version-update re-arm), not only on navigation.
  // `flushUsage` no-ops on an empty buffer and respects the `sending` mutex.
  useEffect(() => {
    if (!userId || !selectedStoreId) return;
    if (!isTrackingReady()) return;
    flushUsage(userId);
  }, [userId, selectedStoreId]);

  // Mirrors Angular's unconditional `cleanOldData(30)` call at
  // `app.component.ts:53` (first statement of `ngOnInit`) — fires exactly
  // once on mount, never re-runs on login or store switch. The auth guard
  // lives inside `cleanOldStoreUsage` itself, not at this call-site.
  useEffect(() => {
    const { user } = useAuthStore.getState();
    cleanOldStoreUsage(user?.id ?? '', user?.selectedStoreId ?? '', 30);
  }, []);
}
