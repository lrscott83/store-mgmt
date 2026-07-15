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
      data: { data: [{ id: 's1', name: 'Store One' }] },
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
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('Store One');
  });
});

describe('storeHttpService.getStore — HTTP-3: GET /v1/stores/:id', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 's1', name: 'Store One' } },
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
    expect(result.data.name).toBe('Store One');
  });
});

describe('storeHttpService.createStore — HTTP-4: POST /v1/stores', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'new-s', name: 'New Store' } },
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

describe('storeHttpService.getModulesToStore — HTTP-11: GET /v1/modules/ToStore', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: [{ id: 1, name: 'Module A', price: 10, currentPrice: 8, priceIncluded: false, discountText: '', selected: false }] },
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
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('Module A');
  });
});

describe('storeHttpService.listOwners — OWNER-1: GET /v1/owners/all/true', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: [{ id: 'o1', fullName: 'Owner One' }] },
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
    expect(result.data).toHaveLength(1);
    expect(result.data[0].fullName).toBe('Owner One');
  });
});
