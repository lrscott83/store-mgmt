import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CsvProduct } from '@store-mgmt/domain';

// ProductOnlineService is reference-only (parity rule 1): NEVER hits a live backend — the
// apiClient is mocked exclusively. Mirrors owner-http-service.test.ts's pattern.
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
  const { ProductOnlineService } = await import('../product-online-service');
  return new ProductOnlineService();
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

describe('ProductOnlineService (reference-only, apiClient-mocked)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const api = await mockedApiClient();
    api.get.mockResolvedValue(envelope(null));
    api.post.mockResolvedValue(envelope(true));
    api.put.mockResolvedValue(envelope(true));
    api.delete.mockResolvedValue(envelope(true));
  });

  it('ONLINE-01: instantiable with no args', async () => {
    const svc = await getService();
    expect(svc).toBeTruthy();
  });

  // Consistency fix (parity-audit-remediation Slice 1): 8/12 URLs previously carried a literal
  // double-slash (API_URL ends with '/', method prepended another '/'). Normalized to a single
  // slash to match the sibling ProductCategoryOnlineService (already normalized, DG-1).

  it('ONLINE-02: hasAnyAvailableToSaleProduct → GET /v1/Products/hasAnyAvailableToSaleProduct', async () => {
    const svc = await getService();
    const api = await mockedApiClient();
    api.get.mockResolvedValue(envelope(true));
    const result = await svc.hasAnyAvailableToSaleProduct();
    expect(api.get).toHaveBeenCalledWith('/v1/Products/hasAnyAvailableToSaleProduct');
    expect(result.data).toBe(true);
  });

  it('ONLINE-03: getProductById → GET /v1/Products/:id (single slash)', async () => {
    const svc = await getService();
    const api = await mockedApiClient();
    await svc.getProductById('p1');
    expect(api.get).toHaveBeenCalledWith('/v1/Products/p1');
  });

  it('ONLINE-04: getProductByBarcode → GET /v1/Products/byBarcode/:barcode (SINGLE slash — asymmetry)', async () => {
    const svc = await getService();
    const api = await mockedApiClient();
    await svc.getProductByBarcode('ABC123');
    expect(api.get).toHaveBeenCalledWith('/v1/Products/byBarcode/ABC123');
  });

  it('ONLINE-05: getProductsToSelect → GET /v1/Products/toEntry (single slash)', async () => {
    const svc = await getService();
    const api = await mockedApiClient();
    await svc.getProductsToSelect();
    expect(api.get).toHaveBeenCalledWith('/v1/Products/toEntry');
  });

  it('ONLINE-06: getAvailableProductsByCategoryId → GET /v1/Products/availableByCategoryId/:id', async () => {
    const svc = await getService();
    const api = await mockedApiClient();
    await svc.getAvailableProductsByCategoryId('cat-1');
    expect(api.get).toHaveBeenCalledWith('/v1/Products/availableByCategoryId/cat-1');
  });

  it('ONLINE-07: getProductsToSaleByCategoryId → GET /v1/Products/toSaleByCategoryId/:id', async () => {
    const svc = await getService();
    const api = await mockedApiClient();
    await svc.getProductsToSaleByCategoryId('cat-1');
    expect(api.get).toHaveBeenCalledWith('/v1/Products/toSaleByCategoryId/cat-1');
  });

  it('ONLINE-08: deleteProduct → DELETE /v1/Products/:id (single slash)', async () => {
    const svc = await getService();
    const api = await mockedApiClient();
    await svc.deleteProduct('p1');
    expect(api.delete).toHaveBeenCalledWith('/v1/Products/p1');
  });

  it('ONLINE-09: createCsvProducts → POST /v1/Products/import with { csvProducts }', async () => {
    const svc = await getService();
    const api = await mockedApiClient();
    const csvProducts: CsvProduct[] = [{ category: 'Bebidas', name: 'Coca Cola', price: 1.5 }];
    await svc.createCsvProducts(csvProducts);
    expect(api.post).toHaveBeenCalledWith('/v1/Products/import', { csvProducts });
  });

  it('ONLINE-10: getMaxOrderByCategoryId → GET /v1/Products/maxOrderByCategoryId/:id', async () => {
    const svc = await getService();
    const api = await mockedApiClient();
    api.get.mockResolvedValue(envelope(5));
    const result = await svc.getMaxOrderByCategoryId('cat-1');
    expect(api.get).toHaveBeenCalledWith('/v1/Products/maxOrderByCategoryId/cat-1');
    expect(result.data).toBe(5);
  });

  // Req "Online createProduct Omits Barcode" (ANGULAR-BUG-SUSPECT #4): the POST body must NOT
  // carry a barcode key even when a barcode argument is supplied.
  it('ONLINE-11: createProduct → POST /v1/Products/ omitting barcode from the payload', async () => {
    const svc = await getService();
    const api = await mockedApiClient();
    await svc.createProduct('cat-1', 'Coca Cola', 1.5, 'biz-1', 2, true, true, false, 'BARCODE123');
    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe('/v1/Products/');
    expect(body).not.toHaveProperty('barcode');
    expect(body).toEqual({
      categoryId: 'cat-1',
      name: 'Coca Cola',
      price: 1.5,
      availableToSale: true,
      discountFromInvantory: false,
      order: 2,
      isActive: true,
      businessId: 'biz-1',
    });
  });

  // The asymmetry only affects createProduct — updateProduct DOES send barcode.
  it('ONLINE-12: updateProduct → PUT /v1/Products/:id including barcode in the payload', async () => {
    const svc = await getService();
    const api = await mockedApiClient();
    await svc.updateProduct('p1', 'cat-1', 'Coca Cola', 1.5, 'biz-1', 2, true, true, false, 'BARCODE123');
    expect(api.put).toHaveBeenCalledTimes(1);
    const [url, body] = api.put.mock.calls[0];
    expect(url).toBe('/v1/Products/p1');
    expect(body).toEqual({
      id: 'p1',
      categoryId: 'cat-1',
      name: 'Coca Cola',
      price: 1.5,
      barcode: 'BARCODE123',
      availableToSale: true,
      discountFromInvantory: false,
      order: 2,
      isActive: true,
      businessId: 'biz-1',
    });
  });

  it('ONLINE-13: createProducts → POST /v1/Products/createProducts with { categoryId, products }', async () => {
    const svc = await getService();
    const api = await mockedApiClient();
    const items = [{ name: 'A', price: 1 }, { name: 'B', price: 2 }];
    await svc.createProducts('cat-1', items);
    expect(api.post).toHaveBeenCalledWith('/v1/Products/createProducts', { categoryId: 'cat-1', products: items });
  });

  // Req "Offline-Only Public Methods (Offline/Online Asymmetry)": the online service must NOT
  // expose the offline-only extras (no Products/ endpoint exists for them).
  it('ONLINE-14: does NOT expose setDiscountFromInvantory / getProductsByCategoryId', async () => {
    const svc = await getService();
    expect((svc as unknown as Record<string, unknown>).setDiscountFromInvantory).toBeUndefined();
    expect((svc as unknown as Record<string, unknown>).getProductsByCategoryId).toBeUndefined();
  });

  it('ONLINE-15: propagates transport errors (no swallow) for GET and POST', async () => {
    const svc = await getService();
    const api = await mockedApiClient();
    api.get.mockRejectedValue(new Error('Network error'));
    api.post.mockRejectedValue(new Error('Network error'));
    await expect(svc.getProductById('p1')).rejects.toThrow('Network error');
    await expect(svc.createProduct('c', 'n', 1, '', 1, true, true, false)).rejects.toThrow('Network error');
  });
});
