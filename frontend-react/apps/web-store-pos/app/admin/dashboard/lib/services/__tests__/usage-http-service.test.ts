import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── HTTP-1 through HTTP-3 (store usage) ───────────────────────────────────────

vi.mock('~/shared/lib/http/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

/** The `today` the service must send, rebuilt the same way the page would see it. */
function localToday(at: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

function utcToday(at: Date = new Date()): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}-${String(at.getUTCDate()).padStart(2, '0')}`;
}

/**
 * An instant whose LOCAL calendar day differs from its UTC calendar day, found for
 * whatever zone this machine runs in. Behind UTC it is the small hours; ahead of UTC
 * it is the late evening. Without such an instant a `today` assertion cannot tell a
 * local-date implementation from a UTC one.
 */
function instantWhereLocalAndUtcDaysDiffer(): Date {
  for (let hour = 0; hour < 24; hour += 1) {
    const candidate = new Date(Date.UTC(2026, 8, 30, hour, 30, 0));
    if (localToday(candidate) !== utcToday(candidate)) return candidate;
  }
  throw new Error('no instant separates the local day from the UTC day in this zone');
}

/** The `today` query param of the most recent apiClient.get call. */
async function lastTodayParam(): Promise<string | null> {
  const { apiClient } = await import('~/shared/lib/http/api-client');
  const url = apiClient.get.mock.calls.at(-1)?.[0] as string;
  return new URL(url, 'http://localhost').searchParams.get('today');
}

describe('usageHttpService — HTTP-1: module exists as singleton', () => {
  it('exports a usageHttpService object', async () => {
    const mod = await import('../usage-http-service');
    expect(typeof mod.usageHttpService).toBe('object');
    expect(mod.usageHttpService).not.toBeNull();
  });
});

describe('usageHttpService.getStoresLastWeek — HTTP-2: GET /v1/usages/stores-last-week', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        succeeded: true,
        data: { storeUsagesCountDays: [1, 2, 3, 4, 5, 6, 7], activeStoreCount: 42 },
        message: '',
        actionCode: 0,
        errors: [],
      },
    });
  });

  it('calls GET /v1/usages/stores-last-week with the local calendar day as `today`', async () => {
    const { usageHttpService } = await import('../usage-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    await usageHttpService.getStoresLastWeek();
    expect(apiClient.get).toHaveBeenCalledWith(
      `/v1/usages/stores-last-week?today=${localToday()}`,
    );
  });

  it('returns response.data (BaseResponseModel<StoreUsages>)', async () => {
    const { usageHttpService } = await import('../usage-http-service');
    const result = await usageHttpService.getStoresLastWeek();
    expect(result.succeeded).toBe(true);
    if (!result.succeeded) throw new Error('expected succeeded response');
    expect(result.data.storeUsagesCountDays).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(result.data.activeStoreCount).toBe(42);
  });

  // The reported bug: the window used to be anchored on the server's UTC clock, so a
  // user behind UTC saw the chart one day off from its own labels. `today` is what
  // lets the client declare the day its labels were built from — so it must be the
  // LOCAL day, never `toISOString()`.
  it('sends the LOCAL day, not the UTC day, when the two differ', async () => {
    const instant = instantWhereLocalAndUtcDaysDiffer();
    // Only Date is faked; the service's promise chain must keep running for real.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(instant);

      const { usageHttpService } = await import('../usage-http-service');
      await usageHttpService.getStoresLastWeek();

      expect(localToday()).not.toBe(utcToday());
      expect(await lastTodayParam()).toBe(localToday());
    } finally {
      vi.useRealTimers();
    }
  });

  it('never sends a toISOString() (UTC) day', async () => {
    const instant = instantWhereLocalAndUtcDaysDiffer();
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(instant);

      const { usageHttpService } = await import('../usage-http-service');
      await usageHttpService.getStoresLastWeek();

      expect(await lastTodayParam()).not.toBe(utcToday());
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('usageHttpService.getStoresLastMonth — HTTP-3: GET /v1/usages/stores-last-month', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it('calls GET /v1/usages/stores-last-month with the local calendar day as `today`', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        succeeded: true,
        data: {
          storeUsagesCountDays: Array.from({ length: 30 }, (_, i) => i + 1),
          activeStoreCount: 10,
        },
        message: '',
        actionCode: 0,
        errors: [],
      },
    });

    const { usageHttpService } = await import('../usage-http-service');
    const result = await usageHttpService.getStoresLastMonth();
    expect(apiClient.get).toHaveBeenCalledWith(
      `/v1/usages/stores-last-month?today=${localToday()}`,
    );
    expect(result.succeeded).toBe(true);
    if (!result.succeeded) throw new Error('expected succeeded response');
    expect(result.data.storeUsagesCountDays).toHaveLength(30);
    expect(result.data.activeStoreCount).toBe(10);
    expect(result.message).toBe('');
    expect(result.actionCode).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('sends the LOCAL day, not the UTC day, when the two differ', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { succeeded: true, data: { storeUsagesCountDays: [], activeStoreCount: 0 } },
    });

    const instant = instantWhereLocalAndUtcDaysDiffer();
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(instant);

      const { usageHttpService } = await import('../usage-http-service');
      await usageHttpService.getStoresLastMonth();

      expect(await lastTodayParam()).toBe(localToday());
    } finally {
      vi.useRealTimers();
    }
  });

  it('throws when apiClient.get rejects', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    const { usageHttpService } = await import('../usage-http-service');
    await expect(usageHttpService.getStoresLastMonth()).rejects.toThrow('Network error');
  });
});
