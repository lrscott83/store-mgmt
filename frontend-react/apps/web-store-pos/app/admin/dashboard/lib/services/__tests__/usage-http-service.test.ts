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

  it('calls GET /v1/usages/stores-last-week', async () => {
    const { usageHttpService } = await import('../usage-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    await usageHttpService.getStoresLastWeek();
    expect(apiClient.get).toHaveBeenCalledWith('/v1/usages/stores-last-week');
  });

  it('returns response.data (BaseResponseModel<StoreUsages>)', async () => {
    const { usageHttpService } = await import('../usage-http-service');
    const result = await usageHttpService.getStoresLastWeek();
    expect(result.succeeded).toBe(true);
    expect(result.data.storeUsagesCountDays).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(result.data.activeStoreCount).toBe(42);
  });
});

describe('usageHttpService.getStoresLastMonth — HTTP-3: GET /v1/usages/stores-last-month', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
  });

  it('throws when apiClient.get rejects', async () => {
    const { usageHttpService } = await import('../usage-http-service');
    await expect(usageHttpService.getStoresLastMonth()).rejects.toThrow('Network error');
  });
});
