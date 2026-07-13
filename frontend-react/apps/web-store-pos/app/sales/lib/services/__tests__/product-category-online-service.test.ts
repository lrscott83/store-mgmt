import { describe, it, expect, vi, beforeEach } from 'vitest';

// ProductCategoryOnlineService is reference-only (parity rule 1): NEVER hits a live backend —
// the apiClient is mocked exclusively. Mirrors product-online-service.test.ts's pattern.
vi.mock('~/shared/lib/http/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

function envelope<T>(data: T) {
  return { data: { succeeded: true, data, message: '', actionCode: 0, errors: [] } };
}

async function getService() {
  const { ProductCategoryOnlineService } = await import('../product-category-online-service');
  return new ProductCategoryOnlineService();
}

async function mockedApiClient() {
  const { apiClient } = await import('~/shared/lib/http/api-client');
  return apiClient as unknown as {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
}

describe('ProductCategoryOnlineService (reference-only, apiClient-mocked)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const api = await mockedApiClient();
    api.get.mockResolvedValue(envelope(null));
    api.post.mockResolvedValue(envelope(true));
    api.put.mockResolvedValue(envelope(true));
    api.delete.mockResolvedValue(envelope(true));
  });

  it('CAT-ONLINE-01: instantiable with no args', async () => {
    const svc = await getService();
    expect(svc).toBeTruthy();
  });

  it('CAT-ONLINE-02: getAvailableProductCategories → GET /v1/ProductCategories/all/false', async () => {
    const svc = await getService();
    const api = await mockedApiClient();
    const categories = [{ id: 'c1', name: 'Bebidas', order: 1, isActive: true }];
    api.get.mockResolvedValue(envelope(categories));
    const result = await svc.getAvailableProductCategories();
    expect(api.get).toHaveBeenCalledWith('/v1/ProductCategories/all/false');
    expect(result.data).toEqual(categories);
  });

  it('CAT-ONLINE-03: getProductCategoriesView → GET /v1/ProductCategories/catalog', async () => {
    const svc = await getService();
    const api = await mockedApiClient();
    const view = [{ id: 'c1', name: 'Bebidas', order: 1, isActive: true, productsCount: 3 }];
    api.get.mockResolvedValue(envelope(view));
    const result = await svc.getProductCategoriesView();
    expect(api.get).toHaveBeenCalledWith('/v1/ProductCategories/catalog');
    expect(result.data).toEqual(view);
  });

  it('CAT-ONLINE-04: createProductCategory → POST /v1/ProductCategories/ with { name, order, isActive }', async () => {
    const svc = await getService();
    const api = await mockedApiClient();
    await svc.createProductCategory('Bebidas', 1, true);
    expect(api.post).toHaveBeenCalledWith('/v1/ProductCategories/', {
      name: 'Bebidas',
      order: 1,
      isActive: true,
    });
  });

  // DG-1 (ratified, NORMALIZED — deviates from ProductOnlineService's mirrored double-slash):
  // Angular emits '/v1/ProductCategories//c1'; this port fixes the extra slash.
  it('CAT-ONLINE-05: updateProductCategory → PUT /v1/ProductCategories/:id (single slash, NOT //) with body', async () => {
    const svc = await getService();
    const api = await mockedApiClient();
    await svc.updateProductCategory('c1', 'Bebidas', 2, false);
    expect(api.put).toHaveBeenCalledWith('/v1/ProductCategories/c1', {
      id: 'c1',
      name: 'Bebidas',
      order: 2,
      isActive: false,
    });
  });

  it('CAT-ONLINE-06: getMaxOrder → GET /v1/ProductCategories/maxOrder (single slash, NOT //)', async () => {
    const svc = await getService();
    const api = await mockedApiClient();
    api.get.mockResolvedValue(envelope(5));
    const result = await svc.getMaxOrder();
    expect(api.get).toHaveBeenCalledWith('/v1/ProductCategories/maxOrder');
    expect(result.data).toBe(5);
  });

  it('CAT-ONLINE-07: propagates the full failure envelope verbatim (no flattening)', async () => {
    const svc = await getService();
    const api = await mockedApiClient();
    const failEnvelope = {
      data: {
        succeeded: false,
        data: null,
        message: 'Category name already exists',
        actionCode: 400,
        errors: [{ code: 'DUP', description: 'Category name already exists' }],
      },
    };
    api.post.mockResolvedValue(failEnvelope);
    const result = await svc.createProductCategory('Bebidas', 1, true);
    expect(result).toEqual(failEnvelope.data);
  });

  it('CAT-ONLINE-08: does NOT expose the offline-only getProductCategories()', async () => {
    const svc = await getService();
    expect((svc as unknown as Record<string, unknown>).getProductCategories).toBeUndefined();
  });

  it('CAT-ONLINE-09: propagates transport errors (no swallow) for GET and PUT', async () => {
    const svc = await getService();
    const api = await mockedApiClient();
    api.get.mockRejectedValue(new Error('Network error'));
    api.put.mockRejectedValue(new Error('Network error'));
    await expect(svc.getMaxOrder()).rejects.toThrow('Network error');
    await expect(svc.updateProductCategory('c1', 'n', 1, true)).rejects.toThrow('Network error');
  });
});
