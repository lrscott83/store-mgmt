import { describe, it, expect, vi, beforeEach } from 'vitest';

// ProductOnlineService pulls in apiClient — mock it so construction never touches a live backend.
vi.mock('~/shared/lib/http/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

describe('createProductService — GlobalConfig.USE_ONLINE_SERVICE gate (Angular productServiceFactory parity)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('FACT-01: returns a ProductOfflineService when USE_ONLINE_SERVICE is false (default)', async () => {
    vi.doMock('~/shared/lib/config/global-config', () => ({
      GlobalConfig: { USE_ONLINE_SERVICE: false },
    }));
    const { createProductService } = await import('../product-service.factory');
    const { ProductOfflineService } = await import('../product-offline-service');
    const svc = createProductService('s1');
    expect(svc).toBeInstanceOf(ProductOfflineService);
  });

  it('FACT-02: returns a ProductOnlineService when USE_ONLINE_SERVICE is true', async () => {
    vi.doMock('~/shared/lib/config/global-config', () => ({
      GlobalConfig: { USE_ONLINE_SERVICE: true },
    }));
    const { createProductService } = await import('../product-service.factory');
    const { ProductOnlineService } = await import('../product-online-service');
    const svc = createProductService('s1');
    expect(svc).toBeInstanceOf(ProductOnlineService);
  });

  it('FACT-03: exposes the async surface (e.g. hasAnyAvailableToSaleProduct) on the returned service', async () => {
    vi.doMock('~/shared/lib/config/global-config', () => ({
      GlobalConfig: { USE_ONLINE_SERVICE: false },
    }));
    const { createProductService } = await import('../product-service.factory');
    const svc = createProductService('s1');
    expect(typeof svc.hasAnyAvailableToSaleProduct).toBe('function');
  });
});
