import { describe, it, expect, vi, beforeEach } from 'vitest';

// ProductCategoryOnlineService pulls in apiClient — mock it so construction never touches a
// live backend.
vi.mock('~/shared/lib/http/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

describe('createProductCategoryService — GlobalConfig.USE_ONLINE_SERVICE gate (Angular productCategoryServiceFactory parity)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('CAT-FACT-01: returns a ProductCategoryOfflineService when USE_ONLINE_SERVICE is false (default)', async () => {
    vi.doMock('~/shared/lib/config/global-config', () => ({
      GlobalConfig: { USE_ONLINE_SERVICE: false },
    }));
    const { createProductCategoryService } = await import('../product-category-service.factory');
    const { ProductCategoryOfflineService } = await import('../product-category-offline-service');
    const svc = createProductCategoryService('s1');
    expect(svc).toBeInstanceOf(ProductCategoryOfflineService);
  });

  it('CAT-FACT-02: returns a ProductCategoryOnlineService when USE_ONLINE_SERVICE is true', async () => {
    vi.doMock('~/shared/lib/config/global-config', () => ({
      GlobalConfig: { USE_ONLINE_SERVICE: true },
    }));
    const { createProductCategoryService } = await import('../product-category-service.factory');
    const { ProductCategoryOnlineService } = await import('../product-category-online-service');
    const svc = createProductCategoryService('s1');
    expect(svc).toBeInstanceOf(ProductCategoryOnlineService);
  });

  it('CAT-FACT-03: exposes the async surface (e.g. getMaxOrder) on the returned service', async () => {
    vi.doMock('~/shared/lib/config/global-config', () => ({
      GlobalConfig: { USE_ONLINE_SERVICE: false },
    }));
    const { createProductCategoryService } = await import('../product-category-service.factory');
    const svc = createProductCategoryService('s1');
    expect(typeof svc.getMaxOrder).toBe('function');
  });
});
