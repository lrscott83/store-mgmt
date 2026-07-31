import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── HTTP-1 through HTTP-11 ────────────────────────────────────────────────────

vi.mock('~/shared/lib/http/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('storeHttpService — HTTP-1: module exists as singleton', () => {
  it('exports a storeHttpService object', async () => {
    const mod = await import('../store-http-service');
    expect(typeof mod.storeHttpService).toBe('object');
    expect(mod.storeHttpService).not.toBeNull();
  });
});

describe('storeHttpService.listStores — HTTP-2: GET /v1/stores/by-current-user', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { succeeded: true, data: [{ id: 's1', name: 'Store One' }] },
    });
  });

  it('calls GET /v1/stores/by-current-user', async () => {
    const { storeHttpService } = await import('../store-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    await storeHttpService.listStores();
    expect(apiClient.get).toHaveBeenCalledWith('/v1/stores/by-current-user');
  });

  it('returns the data array from the response', async () => {
    const { storeHttpService } = await import('../store-http-service');
    const result = await storeHttpService.listStores();
    if (!result.succeeded) throw new Error('expected succeeded response');
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('Store One');
  });
});

describe('storeHttpService.getStore — HTTP-3: GET /v1/stores/:id', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { succeeded: true, data: { id: 's1', name: 'Store One' } },
    });
  });

  it('calls GET /v1/stores/:id with correct id', async () => {
    const { storeHttpService } = await import('../store-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    await storeHttpService.getStore('s1');
    expect(apiClient.get).toHaveBeenCalledWith('/v1/stores/s1');
  });

  it('returns the store from the response', async () => {
    const { storeHttpService } = await import('../store-http-service');
    const result = await storeHttpService.getStore('s1');
    if (!result.succeeded) throw new Error('expected succeeded response');
    expect(result.data.name).toBe('Store One');
  });

  it('passes paymentStartDate through unchanged when it is an ISO string', async () => {
    const { storeHttpService } = await import('../store-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { succeeded: true, data: { id: 's1', name: 'Store One', paymentStartDate: '2026-03-10' } },
    });
    const result = await storeHttpService.getStore('s1');
    if (!result.succeeded) throw new Error('expected succeeded response');
    expect(result.data.paymentStartDate).toBe('2026-03-10');
  });

  it('passes paymentStartDate through unchanged when it is null', async () => {
    const { storeHttpService } = await import('../store-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { succeeded: true, data: { id: 's1', name: 'Store One', paymentStartDate: null } },
    });
    const result = await storeHttpService.getStore('s1');
    if (!result.succeeded) throw new Error('expected succeeded response');
    expect(result.data.paymentStartDate).toBeNull();
  });
});

describe('storeHttpService.createStore — HTTP-4: POST /v1/stores', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { succeeded: true, data: { id: 'new-s', name: 'New Store' } },
    });
  });

  it('calls POST /v1/stores with payload including moduleIds', async () => {
    const { storeHttpService } = await import('../store-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    const payload = {
      ownerId: 'o1',
      name: 'New Store',
      address: '123 Main St',
      description: 'A store',
      approved: false,
      moduleIds: [1, 2],
    };
    await storeHttpService.createStore(payload);
    expect(apiClient.post).toHaveBeenCalledWith('/v1/stores', payload);
  });

  it('returns the created store from the response', async () => {
    const { storeHttpService } = await import('../store-http-service');
    const result = await storeHttpService.createStore({
      ownerId: 'o1',
      name: 'New Store',
      address: '123',
      description: '',
      approved: false,
      moduleIds: [],
    });
    if (!result.succeeded) throw new Error('expected succeeded response');
    expect(result.data.name).toBe('New Store');
  });
});

describe('storeHttpService.updateStore — HTTP-5: PUT /v1/stores/:id', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: true },
    });
  });

  it('calls PUT /v1/stores/:id with payload including moduleIds', async () => {
    const { storeHttpService } = await import('../store-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    const payload = {
      id: 's1',
      name: 'Updated',
      address: '456 St',
      description: 'desc',
      approved: true,
      paymentStartDate: '2024-01-01',
      moduleIds: [1, 3],
      isActive: true,
    };
    await storeHttpService.updateStore('s1', payload);
    expect(apiClient.put).toHaveBeenCalledWith('/v1/stores/s1', payload);
  });

  it('returns the boolean response data', async () => {
    const { storeHttpService } = await import('../store-http-service');
    const result = await storeHttpService.updateStore('s1', {
      id: 's1',
      name: 'X',
      address: 'Y',
      description: '',
      approved: true,
      paymentStartDate: '',
      moduleIds: [],
      isActive: true,
    });
    expect(result.data).toBe(true);
  });
});

describe('storeHttpService.activateStore — HTTP-6: POST /v1/stores/activate', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: true } });
  });

  it('calls POST /v1/stores/activate with {id}', async () => {
    const { storeHttpService } = await import('../store-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    await storeHttpService.activateStore('s1');
    expect(apiClient.post).toHaveBeenCalledWith('/v1/stores/activate', { id: 's1' });
  });
});

describe('storeHttpService.approveStore — HTTP-7: POST /v1/stores/approve', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: true } });
  });

  it('calls POST /v1/stores/approve with {id}', async () => {
    const { storeHttpService } = await import('../store-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    await storeHttpService.approveStore('s1');
    expect(apiClient.post).toHaveBeenCalledWith('/v1/stores/approve', { id: 's1' });
  });
});

describe('storeHttpService.disapproveStore — HTTP-8: POST /v1/stores/disapprove', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: true } });
  });

  it('calls POST /v1/stores/disapprove with {id}', async () => {
    const { storeHttpService } = await import('../store-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    await storeHttpService.disapproveStore('s1');
    expect(apiClient.post).toHaveBeenCalledWith('/v1/stores/disapprove', { id: 's1' });
  });
});

describe('storeHttpService.getStoresToCollect — HTTP-12: GET /v1/stores/to-collect', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        succeeded: true,
        data: [
          {
            storeId: 's1',
            storeName: 'Store One',
            ownerName: 'Owner One',
            amount: 25,
            nextDueDate: '2026-08-15',
            status: 'PorVencer',
          },
        ],
      },
    });
  });

  it('calls GET /v1/stores/to-collect', async () => {
    const { storeHttpService } = await import('../store-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    await storeHttpService.getStoresToCollect();
    expect(apiClient.get).toHaveBeenCalledWith('/v1/stores/to-collect');
  });

  it('returns the raw response.data (no mapping)', async () => {
    const { storeHttpService } = await import('../store-http-service');
    const result = await storeHttpService.getStoresToCollect();
    if (!result.succeeded) throw new Error('expected succeeded response');
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual({
      storeId: 's1',
      storeName: 'Store One',
      ownerName: 'Owner One',
      amount: 25,
      nextDueDate: '2026-08-15',
      status: 'PorVencer',
    });
  });
});

describe('storeHttpService.registerStorePayment — HTTP-13: POST /v1/stores/:id/payments', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: true } });
  });

  it('calls POST /v1/stores/:id/payments with no body', async () => {
    const { storeHttpService } = await import('../store-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    await storeHttpService.registerStorePayment('s1');
    expect(apiClient.post).toHaveBeenCalledWith('/v1/stores/s1/payments');
  });

  it('returns the raw boolean response.data', async () => {
    const { storeHttpService } = await import('../store-http-service');
    const result = await storeHttpService.registerStorePayment('s1');
    expect(result.data).toBe(true);
  });
});

describe('storeHttpService.getReSellerCommissions — HTTP-14: GET /v1/stores/reseller-commissions', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { succeeded: true, data: [{ year: 2026, month: 7, paymentCount: 3, totalCommission: 90 }] },
    });
  });

  it('calls GET /v1/stores/reseller-commissions', async () => {
    const { storeHttpService } = await import('../store-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    await storeHttpService.getReSellerCommissions();
    expect(apiClient.get).toHaveBeenCalledWith('/v1/stores/reseller-commissions');
  });

  it('returns the raw response.data (no mapping)', async () => {
    const { storeHttpService } = await import('../store-http-service');
    const result = await storeHttpService.getReSellerCommissions();
    if (!result.succeeded) throw new Error('expected succeeded response');
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual({ year: 2026, month: 7, paymentCount: 3, totalCommission: 90 });
  });
});

describe('storeHttpService.getModulesToStore — HTTP-11: GET /v1/modules/ToStore', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { succeeded: true, data: [{ id: 1, name: 'Module A', price: 10, currentPrice: 8, priceIncluded: false, discountText: '', selected: false }] },
    });
  });

  it('calls GET /v1/modules/ToStore', async () => {
    const { storeHttpService } = await import('../store-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    await storeHttpService.getModulesToStore();
    expect(apiClient.get).toHaveBeenCalledWith('/v1/modules/ToStore');
  });

  it('returns module array from response', async () => {
    const { storeHttpService } = await import('../store-http-service');
    const result = await storeHttpService.getModulesToStore();
    if (!result.succeeded) throw new Error('expected succeeded response');
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('Module A');
  });
});

describe('storeHttpService.listOwners — OWNER-1: GET /v1/owners/all/true', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { succeeded: true, data: [{ id: 'o1', fullName: 'Owner One' }] },
    });
  });

  it('calls GET /v1/owners/all/true', async () => {
    const { storeHttpService } = await import('../store-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    await storeHttpService.listOwners();
    expect(apiClient.get).toHaveBeenCalledWith('/v1/owners/all/true');
  });

  it('returns owner array from response', async () => {
    const { storeHttpService } = await import('../store-http-service');
    const result = await storeHttpService.listOwners();
    if (!result.succeeded) throw new Error('expected succeeded response');
    expect(result.data).toHaveLength(1);
    expect(result.data[0].fullName).toBe('Owner One');
  });
});
