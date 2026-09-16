import type { BaseResponseModel } from '@store-mgmt/domain';
import { apiClient } from '~/shared/lib/http/api-client';
import { StorageService } from '../auth/storage-service';
import { getRoster } from '../offline/roster-store';

/**
 * Client-side write-side of the daily store-usage tracker. Mirrors Angular's
 * `StoreUsageTrackerService`
 * (`frontend/src/app/_services/usage-tracker/store-usage-tracker.service.ts`):
 * buffers "store active today" per authenticated user in localStorage, then
 * POSTs unsaved days to the backend, guarded by a sending mutex.
 *
 * Framework-agnostic on purpose — the React Router navigation trigger lives in
 * `use-store-usage-tracker.ts`, this module only owns the buffer/POST logic so
 * it can be unit-tested without rendering React.
 */

const STORE_DAILY_USAGE_KEY_PREFIX = 'lizoft.store-daily-usage-';

// Guid.EMPTY from Angular's `guid-typescript` — same all-zero sentinel used to
// mean "no id assigned yet".
const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

export interface DailyUsage {
  day: string;
  saved: boolean;
}

export interface Usage {
  activeDays: DailyUsage[];
}

// React port of Angular's `private sending: boolean` instance field. Module
// scope is equivalent here because exactly one tracker runs per tab (the
// Angular service is a root-provided singleton too).
let sending = false;

// React port of Angular's NavigationEnd-subscription lifecycle
// (`startTracking()`/`stopTracking()`, store-usage-tracker.service.ts). Angular
// only subscribes to navigation when `isUserAuthenticated()` is true AT THE
// MOMENT `startTracking()` runs — and since AuthService seeds
// `currentUserValue = undefined` at construction (getUserByToken() commented
// out), the ONLY place tracking actually arms is an explicit login
// (login.component.ts:169-170). On a page reload the subscription is never
// re-armed, so Angular's tracker stays dormant for the whole session.
//
// `armed` keeps those exact semantics: module state that resets to false on
// every page reload and is set ONLY by the explicit post-login `armTracking()`.
// DELIBERATE DIVERGENCE from Angular (store-usage-tracker re-arm fix,
// 2026-09-14): the hook no longer gates on `isTrackingArmed()` alone — it
// consults `isTrackingReady()`, which ALSO accepts a persisted session with a
// valid tracking context (see below), so after a reload or a version update
// with a still-valid session the tracker keeps registering and flushing
// instead of staying dormant until the next explicit login.
let armed = false;

/** Mirror of Angular `startTracking()` — called on explicit login only
 *  (login.tsx:183 offline, :209 online). Readiness also accepts a persisted
 *  session — see `isTrackingReady()`. */
export function armTracking(): void {
  armed = true;
}

/** Mirror of Angular `stopTracking()`. */
export function disarmTracking(): void {
  armed = false;
}

export function isTrackingArmed(): boolean {
  return armed;
}

/**
 * Readiness gate the hook consults before stamping (see
 * `use-store-usage-tracker.ts`): ready when the tracker was explicitly armed by
 * a login (`armTracking()`) OR a persisted session exists in `currentUser`
 * (`StorageService.getCurrentUser()`) with a valid tracking context — the
 * reload/version-update re-arm. `auth-store` hydrates `user` synchronously
 * from that same `currentUser` on module evaluation (getUserByToken), so after
 * a reload with a valid, unexpired session the tracker is ready again without
 * a re-login.
 *
 * Session expiry/verdicts are deliberately NOT re-checked here: the auth store
 * owns that logic (getUserByToken ends expired/rejected sessions), and the
 * hook only calls this with a live `userId`/`selectedStoreId` from the store —
 * which are null after a logout even though the stale `currentUser` may linger
 * (Angular-parity logout keeps it). Readiness alone never stamps; the missing
 * live ids block every stamping path.
 */
export function isTrackingReady(): boolean {
  if (armed) return true;
  const persisted = StorageService.getCurrentUser();
  return isTrackingContextValid(persisted?.id ?? '', persisted?.selectedStoreId ?? '');
}

function getToday(): string {
  // Local calendar day (usage-dashboard-alignment): toISOString() would stamp the
  // UTC instant's date — a user connecting Sunday 21:00 in UTC-4 lands as "Monday"
  // and the usage is counted on the wrong day. en-CA locale yields YYYY-MM-DD.
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function getStorageKey(userId: string): string {
  return `${STORE_DAILY_USAGE_KEY_PREFIX}${userId}`;
}

function readUsage(userId: string): Usage {
  const raw = localStorage.getItem(getStorageKey(userId));
  if (!raw) return { activeDays: [] };
  try {
    const parsed = JSON.parse(raw) as Usage;
    return parsed && Array.isArray(parsed.activeDays) ? parsed : { activeDays: [] };
  } catch {
    return { activeDays: [] };
  }
}

function writeUsage(userId: string, usage: Usage): void {
  localStorage.setItem(getStorageKey(userId), JSON.stringify(usage));
}

/**
 * Mirrors Angular's `isUserAuthenticated()` guard: both a non-empty userId
 * and a non-empty selectedStoreId are required before any buffering or POST
 * happens (scopes tracking to an authenticated user with a store selected).
 */
function isTrackingContextValid(userId: string, selectedStoreId: string): boolean {
  return Boolean(
    userId && userId !== EMPTY_GUID && selectedStoreId && selectedStoreId !== EMPTY_GUID,
  );
}

/**
 * Posts every unsaved buffered day for `userId`, guarded by the module-level
 * `sending` mutex. Public so the hook can flush pending days on readiness (see
 * `use-store-usage-tracker.ts`) — `registerStoreActivity()` is "stamp today +
 * flush", this is the flush alone. Both are no-ops on an empty buffer; callers
 * must hold a valid tracking context (the hook guards before calling).
 */
export function flushUsage(userId: string): void {
  if (sending) return;

  const usage = readUsage(userId);
  const unsavedDays = usage.activeDays.filter((day) => !day.saved);
  if (unsavedDays.length === 0) return;

  // Offline-first (offline-usage-fix): an offline login stores the non-JWT
  // 'offline-session' sentinel as its token (auth-store), which the API
  // rejects with 401. The roster's per-user JWT (`offlineAuthToken`, valid
  // until the bundle expiresAt) is the bearer the backend accepts — sent
  // ONLY on this telemetry POST, never stored into the session. `getRoster()`
  // returns null when the bundle is absent or expired → identical behavior
  // to today (api-client.ts attaches the session token, if any). Match by the
  // roster user's `id`, which is the same id offline-auth-service maps into
  // `UserModel.id` and therefore the `userId` this function receives.
  const offlineAuthToken = getRoster()?.users.find((u) => u.id === userId)?.offlineAuthToken;

  sending = true;
  void apiClient
    .post<BaseResponseModel<DailyUsage[]>>(
      '/v1/usages/store-daily-usage',
      { activeDays: unsavedDays },
      // Background telemetry: never drive the global loading overlay (see
      // api-client.ts skipLoading). Deliberate divergence from Angular's
      // always-loading LoadingInterceptor.
      {
        skipLoading: true,
        // Per-request bearer override: api-client.ts only sets Authorization
        // when none is already present, so the roster JWT wins over the
        // session token here — and only for this request.
        ...(offlineAuthToken ? { headers: { Authorization: `Bearer ${offlineAuthToken}` } } : {}),
      },
    )
    .then((response) => {
      if (response.data?.succeeded && response.data.data) {
        const current = readUsage(userId);
        current.activeDays.forEach((day) => {
          day.saved = true;
        });
        writeUsage(userId, current);
      }
    })
    .catch(() => {
      // Best-effort background sync — mirrors Angular's silent-to-the-UI
      // failure (no Swal/error banner on a failed usage POST).
    })
    .finally(() => {
      sending = false;
    });
}

/**
 * Public entry point, called on route navigation AND on throttled pointer /
 * keyboard activity (see `use-store-usage-tracker.ts`). Mirrors Angular's
 * `registerActivity()`: buffers today once, then attempts to flush all unsaved
 * days.
 */
export function registerStoreActivity(userId: string, selectedStoreId: string): void {
  if (!isTrackingContextValid(userId, selectedStoreId)) return;

  const usage = readUsage(userId);
  const today = getToday();
  if (!usage.activeDays.some((day) => day.day === today)) {
    usage.activeDays.push({ day: today, saved: false });
    writeUsage(userId, usage);
  }
  flushUsage(userId);
}

/**
 * Retention cleanup, called once on mount (see `use-store-usage-tracker.ts`).
 * Mirrors Angular's `cleanOldData(daysToKeep)`
 * (store-usage-tracker.service.ts:119-136): prunes `activeDays` entries older
 * than `daysToKeep` days, keeping the entry exactly at the cutoff (inclusive
 * `>=`), and writes back only when something was actually pruned.
 */
export function cleanOldStoreUsage(
  userId: string,
  selectedStoreId: string,
  daysToKeep: number,
): void {
  if (!isTrackingContextValid(userId, selectedStoreId)) return;

  const usage = readUsage(userId);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysToKeep);

  const filtered = usage.activeDays.filter((day) => new Date(day.day) >= cutoff);
  if (filtered.length !== usage.activeDays.length) {
    writeUsage(userId, { activeDays: filtered });
  }
}
