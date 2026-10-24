import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/shared/lib/http/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const okEnvelope = (data: unknown) => ({ data: { succeeded: true, data } });

describe('salesCommissionHttpService — configuración por producto (T8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lista la configuración desde GET /v1/ProductSalesCommissions', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    const configs = [{ productId: 'p1', type: 1, value: 10, currency: 0 }];
    vi.mocked(apiClient.get).mockResolvedValue(okEnvelope(configs) as never);

    const { salesCommissionHttpService } = await import('../sales-commission-http-service');
    const result = await salesCommissionHttpService.list();

    expect(apiClient.get).toHaveBeenCalledWith('/v1/ProductSalesCommissions');
    expect(result.data).toEqual(configs);
  });

  it('crea o actualiza con PUT al producto con el id en la ruta', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.put).mockResolvedValue(okEnvelope(true) as never);

    const { salesCommissionHttpService } = await import('../sales-commission-http-service');
    const payload = { type: 2 as const, value: 5, currency: 1 as const };
    const result = await salesCommissionHttpService.upsert('p 1', payload);

    // El id se codifica: un id con espacios no puede romper la ruta.
    expect(apiClient.put).toHaveBeenCalledWith(
      '/v1/ProductSalesCommissions/p%201',
      payload,
    );
    expect(result.data).toBe(true);
  });

  it('quita la comisión con DELETE al producto', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.delete).mockResolvedValue(okEnvelope(true) as never);

    const { salesCommissionHttpService } = await import('../sales-commission-http-service');
    const result = await salesCommissionHttpService.remove('p1');

    expect(apiClient.delete).toHaveBeenCalledWith('/v1/ProductSalesCommissions/p1');
    expect(result.data).toBe(true);
  });
});
