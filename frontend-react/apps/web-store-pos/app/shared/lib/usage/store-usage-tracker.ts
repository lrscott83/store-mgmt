import type { BaseResponseModel } from '@store-mgmt/domain';
import { apiClient } from '~/shared/lib/http/api-client';

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

function getToday(): string {
  return new Date().toISOString().split('T')[0]!;
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
  return Boolean(userId && userId !== EMPTY_GUID && selectedStoreId && selectedStoreId !== EMPTY_GUID);
}

function flushUsage(userId: string): void {
  if (sending) return;

  const usage = readUsage(userId);
  const unsavedDays = usage.activeDays.filter((day) => !day.saved);
  if (unsavedDays.length === 0) return;

  sending = true;
  void apiClient
    .post<BaseResponseModel<DailyUsage[]>>('/v1/usages/store-daily-usage', {
      activeDays: unsavedDays,
    })
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
 * Public entry point, called on every route navigation (see
 * `use-store-usage-tracker.ts`). Mirrors Angular's `registerActivity()`:
 * buffers today once, then attempts to flush all unsaved days.
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
