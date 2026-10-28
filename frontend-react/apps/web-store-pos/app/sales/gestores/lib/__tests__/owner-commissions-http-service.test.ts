import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/shared/lib/http/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const okEnvelope = (data: unknown) => ({ data: { succeeded: true, data } });

describe('ownerCommissionsHttpService — lista y pago del Owner (T10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lista sin filtros contra GET /v1/SalesCommissions', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.get).mockResolvedValue(okEnvelope([{ id: 'c1' }]) as never);

    const { ownerCommissionsHttpService } = await import('../owner-commissions-http-service');
    const result = await ownerCommissionsHttpService.list();

    expect(apiClient.get).toHaveBeenCalledWith('/v1/SalesCommissions', { params: {} });
    expect(result.data).toHaveLength(1);
  });

  it('manda estado y gestor como query params', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.get).mockResolvedValue(okEnvelope([]) as never);

    const { ownerCommissionsHttpService } = await import('../owner-commissions-http-service');
    await ownerCommissionsHttpService.list({ status: 1, salesManagerId: 'm1' });

    expect(apiClient.get).toHaveBeenCalledWith('/v1/SalesCommissions', {
      params: { status: 1, salesManagerId: 'm1' },
    });
  });

  it('registra el pago completo con POST al id codificado', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.post).mockResolvedValue(okEnvelope(true) as never);

    const { ownerCommissionsHttpService } = await import('../owner-commissions-http-service');
    const result = await ownerCommissionsHttpService.pay('c 1', 'nota');

    expect(apiClient.post).toHaveBeenCalledWith('/v1/SalesCommissions/c%201/pay', {
      note: 'nota',
    });
    expect(result.data).toBe(true);
  });

  it('carga los gestores del Owner para el filtro', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.get).mockResolvedValue(okEnvelope([{ id: 'm1', fullName: 'Ana' }]) as never);

    const { ownerCommissionsHttpService } = await import('../owner-commissions-http-service');
    const result = await ownerCommissionsHttpService.getManagers();

    expect(apiClient.get).toHaveBeenCalledWith('/v1/SalesManagers/all/true');
    expect(result.data).toHaveLength(1);
  });
});
