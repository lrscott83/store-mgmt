import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';

// ── USAGE-1 through USAGE-3 (Stage 6 Slice C — Daily Store Activity Recording,
// Buffered POST With Mutex) ──────────────────────────────────────────────────
//
// Mirrors Angular's `StoreUsageTrackerService`
// (frontend/src/app/_services/usage-tracker/store-usage-tracker.service.ts):
// buffer key `lizoft.store-daily-usage-{userId}`, POST only unsaved days,
// module-level sending mutex (React port of the Angular singleton's
// `private sending: boolean` instance field — this app has exactly one
// tracker running per tab).

vi.mock('~/shared/lib/http/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const USER_ID = 'user-1';
const STORE_ID = 'store-1';
const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';
const STORAGE_KEY = `lizoft.store-daily-usage-${USER_ID}`;

function today(): string {
  return new Date().toISOString().split('T')[0]!;
}

// ── USAGE-7 (usage-dashboard-alignment): the buffered day must be the user's
// LOCAL calendar day, not the UTC instant's date. In UTC-4 (Cuba DST), a user
// connecting Sunday 2026-09-13 at 21:00 local is 2026-09-14T01:00Z — toISOString
// stamps "2026-09-14" (Monday) and the usage lands on the wrong day.
describe('registerStoreActivity — USAGE-7: buffers the LOCAL day, not UTC', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records the local calendar day when local date differs from UTC (late-night UTC-4)', async () => {
    // Sunday 2026-09-13 21:00 in UTC-4 → 2026-09-14T01:00Z.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 13, 21, 0, 0));
    const offsetMinutes = new Date().getTimezoneOffset();
    vi.useRealTimers();
    // This spec is meaningful only in a UTC- (west-of-Greenwich) sandbox; skip elsewhere.
    if (offsetMinutes <= 0) return;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 13, 21, 0, 0));
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { succeeded: true, data: [], message: '', actionCode: 0, errors: [] },
    });

    const { registerStoreActivity } = await import('../store-usage-tracker');
    registerStoreActivity(USER_ID, STORE_ID);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.activeDays).toEqual([{ day: '2026-09-13', saved: false }]);
  });

  it('records the UTC date unchanged when local date equals UTC date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 13, 10, 0, 0));
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { succeeded: true, data: [], message: '', actionCode: 0, errors: [] },
    });

    const { registerStoreActivity } = await import('../store-usage-tracker');
    registerStoreActivity(USER_ID, STORE_ID);

    const expected = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.activeDays).toEqual([{ day: expected, saved: false }]);
  });
});

describe('registerStoreActivity — USAGE-1: buffers today once per day', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('records today in the per-user buffer when authenticated with a store selected', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { succeeded: true, data: [], message: '', actionCode: 0, errors: [] },
    });

    const { registerStoreActivity } = await import('../store-usage-tracker');
    registerStoreActivity(USER_ID, STORE_ID);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.activeDays).toEqual([{ day: today(), saved: false }]);
  });

  it('does not push a second entry for the same day on repeated navigation', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { succeeded: true, data: [], message: '', actionCode: 0, errors: [] },
    });

    const { registerStoreActivity } = await import('../store-usage-tracker');
    registerStoreActivity(USER_ID, STORE_ID);
    registerStoreActivity(USER_ID, STORE_ID);
    registerStoreActivity(USER_ID, STORE_ID);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.activeDays).toHaveLength(1);
  });

  it('is a no-op when userId is missing (unauthenticated)', async () => {
    const { registerStoreActivity } = await import('../store-usage-tracker');
    registerStoreActivity('', STORE_ID);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('is a no-op when selectedStoreId is missing or the empty guid', async () => {
    const { registerStoreActivity } = await import('../store-usage-tracker');
    registerStoreActivity(USER_ID, '');
    registerStoreActivity(USER_ID, EMPTY_GUID);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('is a no-op when userId is the empty guid', async () => {
    const { registerStoreActivity } = await import('../store-usage-tracker');
    registerStoreActivity(EMPTY_GUID, STORE_ID);
    expect(localStorage.getItem(`lizoft.store-daily-usage-${EMPTY_GUID}`)).toBeNull();
  });
});

describe('registerStoreActivity — USAGE-2: POSTs only unsaved days', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('POSTs the buffered unsaved day to /v1/usages/store-daily-usage', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { succeeded: true, data: [], message: '', actionCode: 0, errors: [] },
    });

    const { registerStoreActivity } = await import('../store-usage-tracker');
    registerStoreActivity(USER_ID, STORE_ID);

    // Background telemetry: the POST must carry `skipLoading: true` so the axios
    // loading interceptor never drives the global overlay for it (silent sync).
    expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/usages/store-daily-usage',
      { activeDays: [{ day: today(), saved: false }] },
      { skipLoading: true },
    );
  });

  it('excludes already-saved days from the POST payload', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ activeDays: [{ day: '2020-01-01', saved: true }] }),
    );
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { succeeded: true, data: [], message: '', actionCode: 0, errors: [] },
    });

    const { registerStoreActivity } = await import('../store-usage-tracker');
    registerStoreActivity(USER_ID, STORE_ID);

    expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/usages/store-daily-usage',
      { activeDays: [{ day: today(), saved: false }] },
      { skipLoading: true },
    );
  });

  it('marks the buffered days saved on a successful response', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        succeeded: true,
        data: [{ day: today(), saved: true }],
        message: '',
        actionCode: 0,
        errors: [],
      },
    });

    const { registerStoreActivity } = await import('../store-usage-tracker');
    registerStoreActivity(USER_ID, STORE_ID);
    await vi.waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored.activeDays.every((d: { saved: boolean }) => d.saved)).toBe(true);
    });
  });

  it('skips the POST entirely when there are zero unsaved days', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ activeDays: [{ day: today(), saved: true }] }),
    );
    const { apiClient } = await import('~/shared/lib/http/api-client');

    const { registerStoreActivity } = await import('../store-usage-tracker');
    registerStoreActivity(USER_ID, STORE_ID);

    expect(apiClient.post).not.toHaveBeenCalled();
  });
});

describe('registerStoreActivity — USAGE-3: sending mutex blocks concurrent POSTs', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('does not issue a second POST while one is already in flight', async () => {
    let resolvePost!: (v: unknown) => void;
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePost = resolve;
        }),
    );

    const { registerStoreActivity } = await import('../store-usage-tracker');
    // First navigation kicks off a POST that never resolves synchronously.
    registerStoreActivity(USER_ID, STORE_ID);
    expect(apiClient.post).toHaveBeenCalledTimes(1);

    // Second navigation (same day, so no new buffered day) tries to flush again
    // while the first POST is still in flight — must be blocked by the mutex.
    registerStoreActivity(USER_ID, STORE_ID);
    expect(apiClient.post).toHaveBeenCalledTimes(1);

    // Resolve the in-flight POST — mutex releases, a following flush can post again.
    resolvePost({ data: { succeeded: true, data: [], message: '', actionCode: 0, errors: [] } });
    await vi.waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
  });
});

describe('registerStoreActivity — USAGE-6: roster JWT bearer on the usage POST (offline-usage-fix)', () => {
  const ROSTER_KEY = 'lizoft.offline-roster';

  function seedRoster(users: unknown[]): void {
    localStorage.setItem(
      ROSTER_KEY,
      JSON.stringify({
        bundleId: 'bundle-1',
        issuedAt: Date.now() - 1000,
        expiresAt: Date.now() + 60_000,
        formatVersion: 3,
        storeId: STORE_ID,
        users,
      }),
    );
  }

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("attaches the roster user's offlineAuthToken as the Authorization bearer for this POST only", async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { succeeded: true, data: [], message: '', actionCode: 0, errors: [] },
    });

    seedRoster([
      {
        id: USER_ID,
        login: 'user-1',
        fullName: 'User One',
        isActive: true,
        roles: [],
        featureIds: [],
        storeModuleIds: [],
        isSuperAdmin: false,
        isOwnerAdmin: false,
        isReSeller: false,
        selectedStoreId: STORE_ID,
        verifier: null,
        offlineAuthToken: 'roster-jwt-abc',
      },
    ]);

    const { registerStoreActivity } = await import('../store-usage-tracker');
    registerStoreActivity(USER_ID, STORE_ID);

    expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/usages/store-daily-usage',
      { activeDays: [{ day: today(), saved: false }] },
      expect.objectContaining({
        skipLoading: true,
        headers: { Authorization: 'Bearer roster-jwt-abc' },
      }),
    );
  });

  it("falls back to today's behavior (no Authorization override) when the roster user has no offlineAuthToken", async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { succeeded: true, data: [], message: '', actionCode: 0, errors: [] },
    });

    seedRoster([
      {
        id: USER_ID,
        login: 'user-1',
        fullName: 'User One',
        isActive: true,
        roles: [],
        featureIds: [],
        storeModuleIds: [],
        isSuperAdmin: false,
        isOwnerAdmin: false,
        isReSeller: false,
        selectedStoreId: STORE_ID,
        verifier: null,
        // legacy bundle shape — no offlineAuthToken field
      },
    ]);

    const { registerStoreActivity } = await import('../store-usage-tracker');
    registerStoreActivity(USER_ID, STORE_ID);

    expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/usages/store-daily-usage',
      { activeDays: [{ day: today(), saved: false }] },
      { skipLoading: true },
    );
  });

  it('does not attach a roster JWT of a different roster user', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { succeeded: true, data: [], message: '', actionCode: 0, errors: [] },
    });

    seedRoster([
      {
        id: 'some-other-user',
        login: 'other',
        fullName: 'Other',
        isActive: true,
        roles: [],
        featureIds: [],
        storeModuleIds: [],
        isSuperAdmin: false,
        isOwnerAdmin: false,
        isReSeller: false,
        selectedStoreId: STORE_ID,
        verifier: null,
        offlineAuthToken: 'roster-jwt-other',
      },
    ]);

    const { registerStoreActivity } = await import('../store-usage-tracker');
    registerStoreActivity(USER_ID, STORE_ID);

    expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/usages/store-daily-usage',
      { activeDays: [{ day: today(), saved: false }] },
      { skipLoading: true },
    );
  });
});

// ── USAGE-4 (arm/disarm lifecycle — Angular parity) ─────────────────────────
// Mirrors Angular's `startTracking()`/`stopTracking()` (store-usage-tracker.service.ts):
// the NavigationEnd subscription is armed ONLY by an explicit login
// (login.component.ts:169-170), never at construction (AuthService seeds
// `currentUserValue = undefined` and leaves `getUserByToken()` commented). Since
// `armed` is module state, a page RELOAD resets it to false — so after a reload
// the tracker stays dormant exactly like Angular (no request on navigation).
describe('tracking arm lifecycle — USAGE-4', () => {
  beforeEach(async () => {
    const { disarmTracking } = await import('../store-usage-tracker');
    disarmTracking();
  });

  it('is disarmed by default (module load / page reload parity)', async () => {
    const { isTrackingArmed } = await import('../store-usage-tracker');
    expect(isTrackingArmed()).toBe(false);
  });

  it('arms on explicit login and disarms on request', async () => {
    const { armTracking, disarmTracking, isTrackingArmed } = await import('../store-usage-tracker');
    armTracking();
    expect(isTrackingArmed()).toBe(true);
    disarmTracking();
    expect(isTrackingArmed()).toBe(false);
  });
});

describe('registerStoreActivity — USAGE-4: scoped by userId + selectedStoreId', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('buffers activity for two different users under separate storage keys', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { succeeded: true, data: [], message: '', actionCode: 0, errors: [] },
    });

    const { registerStoreActivity } = await import('../store-usage-tracker');
    registerStoreActivity('user-a', STORE_ID);
    registerStoreActivity('user-b', STORE_ID);

    const userA = JSON.parse(localStorage.getItem('lizoft.store-daily-usage-user-a')!);
    const userB = JSON.parse(localStorage.getItem('lizoft.store-daily-usage-user-b')!);
    expect(userA.activeDays).toHaveLength(1);
    expect(userB.activeDays).toHaveLength(1);
  });
});

// ── USAGE-5 (Slice 5 — Fase 1 auth cluster, port of Angular `cleanOldData`)
// ──────────────────────────────────────────────────────────────────────────
//
// Mirrors Angular `StoreUsageTrackerService.cleanOldData`
// (store-usage-tracker.service.ts:119-136): guard-inside-method auth check,
// inclusive cutoff-date prune of `activeDays`, conditional write-back only
// when something was actually pruned.

describe('cleanOldStoreUsage — USAGE-5: retention prune on mount (parity)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // Pinned to UTC midnight: `new Date('YYYY-MM-DD')` parses as UTC midnight,
    // and this sandbox's local timezone offset is 0 (UTC), so pinning system
    // time to UTC midnight keeps `cutoff`'s time-of-day aligned with the
    // parsed `day` values for a deterministic inclusive `>=` boundary.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is a no-op when userId is missing (invalid tracking context)', async () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    const { cleanOldStoreUsage } = await import('../store-usage-tracker');
    expect(() => cleanOldStoreUsage('', STORE_ID, 30)).not.toThrow();

    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('is a no-op when selectedStoreId is missing or the empty guid', async () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    const { cleanOldStoreUsage } = await import('../store-usage-tracker');
    expect(() => cleanOldStoreUsage(USER_ID, '', 30)).not.toThrow();
    expect(() => cleanOldStoreUsage(USER_ID, EMPTY_GUID, 30)).not.toThrow();

    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('prunes an entry strictly before the cutoff date', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ activeDays: [{ day: '2026-06-12', saved: true }] }),
    );

    const { cleanOldStoreUsage } = await import('../store-usage-tracker');
    cleanOldStoreUsage(USER_ID, STORE_ID, 30);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.activeDays).toEqual([]);
  });

  it('keeps an entry exactly at the cutoff date (inclusive >= boundary)', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ activeDays: [{ day: '2026-06-13', saved: true }] }),
    );

    const { cleanOldStoreUsage } = await import('../store-usage-tracker');
    cleanOldStoreUsage(USER_ID, STORE_ID, 30);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.activeDays).toEqual([{ day: '2026-06-13', saved: true }]);
  });

  it('keeps an entry after the cutoff date', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ activeDays: [{ day: '2026-07-01', saved: true }] }),
    );

    const { cleanOldStoreUsage } = await import('../store-usage-tracker');
    cleanOldStoreUsage(USER_ID, STORE_ID, 30);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.activeDays).toEqual([{ day: '2026-07-01', saved: true }]);
  });

  it('does not write to storage when nothing is pruned (no-op write)', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ activeDays: [{ day: '2026-07-01', saved: true }] }),
    );
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    const { cleanOldStoreUsage } = await import('../store-usage-tracker');
    cleanOldStoreUsage(USER_ID, STORE_ID, 30);

    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('writes the filtered activeDays back once, under the unchanged storage key, when pruning occurs', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        activeDays: [
          { day: '2026-06-12', saved: true },
          { day: '2026-07-01', saved: true },
        ],
      }),
    );
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    const { cleanOldStoreUsage } = await import('../store-usage-tracker');
    cleanOldStoreUsage(USER_ID, STORE_ID, 30);

    expect(setItemSpy).toHaveBeenCalledTimes(1);
    expect(setItemSpy).toHaveBeenCalledWith(
      STORAGE_KEY,
      JSON.stringify({ activeDays: [{ day: '2026-07-01', saved: true }] }),
    );
  });
});

// ── USAGE-8 (store-usage-tracker re-arm fix, 2026-09-14): readiness is ALSO
// derived from the PERSISTED session, so after a reload or a version update
// the tracker keeps working (buffer + POST logic live in localStorage — only
// the in-memory `armed` flag was lost). Unlike the `armed` flag, this is a
// DELIBERATE divergence from Angular's dormant-after-reload behavior. Expiry
// is deliberately NOT re-checked here: the auth store owns session expiry, and
// the hook only ever calls this with a live, hydrated `userId`/
// `selectedStoreId`.
describe('tracking readiness — USAGE-8: persisted session re-arms after reload', () => {
  beforeEach(async () => {
    localStorage.clear();
    const { disarmTracking } = await import('../store-usage-tracker');
    disarmTracking();
  });

  it('is NOT ready when disarmed and no session is persisted (anonymous / first boot)', async () => {
    const { isTrackingReady } = await import('../store-usage-tracker');
    expect(isTrackingReady()).toBe(false);
  });

  it('is ready when a persisted session with id + selectedStoreId exists (reload re-arm)', async () => {
    localStorage.setItem(
      StorageKeys.CURRENT_USER,
      JSON.stringify({ id: USER_ID, selectedStoreId: STORE_ID }),
    );

    const { isTrackingReady } = await import('../store-usage-tracker');
    expect(isTrackingReady()).toBe(true);
  });

  it('is NOT ready when the persisted session has no selectedStoreId', async () => {
    localStorage.setItem(
      StorageKeys.CURRENT_USER,
      JSON.stringify({ id: USER_ID, selectedStoreId: '' }),
    );

    const { isTrackingReady } = await import('../store-usage-tracker');
    expect(isTrackingReady()).toBe(false);
  });

  it('is NOT ready when the persisted session has the empty-guid selectedStoreId (no store assigned)', async () => {
    localStorage.setItem(
      StorageKeys.CURRENT_USER,
      JSON.stringify({ id: USER_ID, selectedStoreId: EMPTY_GUID }),
    );

    const { isTrackingReady } = await import('../store-usage-tracker');
    expect(isTrackingReady()).toBe(false);
  });

  it('is NOT ready when the persisted session has no userId', async () => {
    localStorage.setItem(
      StorageKeys.CURRENT_USER,
      JSON.stringify({ id: '', selectedStoreId: STORE_ID }),
    );

    const { isTrackingReady } = await import('../store-usage-tracker');
    expect(isTrackingReady()).toBe(false);
  });

  it('is ready after an explicit armTracking() even without a persisted session (post-login path)', async () => {
    const { armTracking, disarmTracking, isTrackingReady } = await import('../store-usage-tracker');
    armTracking();
    expect(isTrackingReady()).toBe(true);
    disarmTracking();
    expect(isTrackingReady()).toBe(false);
  });

  it('leaves the armed flag untouched: isTrackingArmed() stays a pure mirror', async () => {
    // A persisted session alone must NOT flip the Angular-parity `armed` flag —
    // only armTracking() does (explicit-login semantics preserved).
    localStorage.setItem(
      StorageKeys.CURRENT_USER,
      JSON.stringify({ id: USER_ID, selectedStoreId: STORE_ID }),
    );

    const { isTrackingArmed, isTrackingReady } = await import('../store-usage-tracker');
    expect(isTrackingArmed()).toBe(false);
    expect(isTrackingReady()).toBe(true);
  });
});

// ── USAGE-9 (version-survival): the usage buffer key must NEVER be
// version-prefixed. `StorageKeys.AUTH_MODEL` is `${APP_VERSION}-auth...`
// (storage-keys.ts) — sessions are isolated per deployment BY DESIGN, but the
// usage buffer lives across versions on purpose: a version bump that orphaned
// `lizoft.store-daily-usage-{userId}` would silently lose unsent usage days
// (and no production code clears the key). Pin the raw key here so a future
// "fix" cannot adopt the AUTH_MODEL prefix pattern.
describe('registerStoreActivity — USAGE-9: buffer key is NOT version-prefixed', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('buffers under the literal lizoft.store-daily-usage-{userId} key (no APP_VERSION segment)', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { succeeded: true, data: [], message: '', actionCode: 0, errors: [] },
    });

    const { registerStoreActivity } = await import('../store-usage-tracker');
    registerStoreActivity(USER_ID, STORE_ID);

    // THE PIN: the unsent buffer must be found under exactly this unprefixed
    // key — a version bump must never orphan it.
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });
});

// ── USAGE-10 (store-usage-tracker re-arm fix, 2026-09-14): `flushUsage` is
// public so the hook can flush pending days on readiness without stamping.
// Same mutex + unsaved-only semantics as the flush inside `registerStoreActivity`.
describe('flushUsage — USAGE-10: flushes unsaved days on demand (readiness flush)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('POSTs only the unsaved days and marks them saved on success', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        activeDays: [
          { day: '2026-09-10', saved: true },
          { day: '2026-09-13', saved: false },
        ],
      }),
    );
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        succeeded: true,
        data: [{ day: '2026-09-13', saved: true }],
        message: '',
        actionCode: 0,
        errors: [],
      },
    });

    const { flushUsage } = await import('../store-usage-tracker');
    flushUsage(USER_ID);

    expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/usages/store-daily-usage',
      { activeDays: [{ day: '2026-09-13', saved: false }] },
      { skipLoading: true },
    );
    await vi.waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored.activeDays.every((d: { saved: boolean }) => d.saved)).toBe(true);
    });
  });

  it('is a no-op when the buffer has no unsaved days', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ activeDays: [{ day: '2026-09-10', saved: true }] }),
    );
    const { apiClient } = await import('~/shared/lib/http/api-client');

    const { flushUsage } = await import('../store-usage-tracker');
    flushUsage(USER_ID);

    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
