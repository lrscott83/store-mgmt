import { describe, it, expect, vi, beforeEach } from 'vitest';

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

    expect(apiClient.post).toHaveBeenCalledWith('/v1/usages/store-daily-usage', {
      activeDays: [{ day: today(), saved: false }],
    });
  });

  it('excludes already-saved days from the POST payload', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ activeDays: [{ day: '2020-01-01', saved: true }] })
    );
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { succeeded: true, data: [], message: '', actionCode: 0, errors: [] },
    });

    const { registerStoreActivity } = await import('../store-usage-tracker');
    registerStoreActivity(USER_ID, STORE_ID);

    expect(apiClient.post).toHaveBeenCalledWith('/v1/usages/store-daily-usage', {
      activeDays: [{ day: today(), saved: false }],
    });
  });

  it('marks the buffered days saved on a successful response', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { succeeded: true, data: [{ day: today(), saved: true }], message: '', actionCode: 0, errors: [] },
    });

    const { registerStoreActivity } = await import('../store-usage-tracker');
    registerStoreActivity(USER_ID, STORE_ID);
    await vi.waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored.activeDays.every((d: { saved: boolean }) => d.saved)).toBe(true);
    });
  });

  it('skips the POST entirely when there are zero unsaved days', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ activeDays: [{ day: today(), saved: true }] }));
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
        })
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
