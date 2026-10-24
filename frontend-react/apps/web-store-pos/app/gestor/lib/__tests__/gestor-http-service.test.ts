import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/shared/lib/http/api-client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

const okEnvelope = (data: unknown) => ({ data: { succeeded: true, data } });

describe('gestorHttpService — vista del gestor (T9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sus pedidos salen de GET /v1/sales-managers/orders', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.get).mockResolvedValue(okEnvelope([{ orderId: 'o1' }]) as never);

    const { gestorHttpService } = await import('../gestor-http-service');
    const result = await gestorHttpService.getOrders();

    expect(apiClient.get).toHaveBeenCalledWith('/v1/sales-managers/orders');
    expect(result.data).toHaveLength(1);
  });

  it('sus comisiones salen de GET /v1/sales-managers/commissions', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.get).mockResolvedValue(okEnvelope([{ id: 'c1' }]) as never);

    const { gestorHttpService } = await import('../gestor-http-service');
    const result = await gestorHttpService.getCommissions();

    expect(apiClient.get).toHaveBeenCalledWith('/v1/sales-managers/commissions');
    expect(result.data).toHaveLength(1);
  });

  it('los catálogos del Owner salen de GET /v1/sales-managers/stores', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.get).mockResolvedValue(okEnvelope([{ storeId: 's1' }]) as never);

    const { gestorHttpService } = await import('../gestor-http-service');
    const result = await gestorHttpService.getStores();

    expect(apiClient.get).toHaveBeenCalledWith('/v1/sales-managers/stores');
    expect(result.data).toHaveLength(1);
  });
});
