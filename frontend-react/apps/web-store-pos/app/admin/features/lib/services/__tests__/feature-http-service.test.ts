import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── HTTP-1 through HTTP-3 (feature activation) ────────────────────────────────

vi.mock('~/shared/lib/http/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('featureHttpService — HTTP-1: module exists as singleton', () => {
  it('exports a featureHttpService object', async () => {
    const mod = await import('../feature-http-service');
    expect(typeof mod.featureHttpService).toBe('object');
    expect(mod.featureHttpService).not.toBeNull();
  });
});

describe('featureHttpService.activateFeatures — HTTP-2: POST /v1/features/activate', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { succeeded: true, data: true, message: null, actionCode: null, errors: null },
    });
  });

  it('calls POST /v1/features/activate with empty body {}', async () => {
    const { featureHttpService } = await import('../feature-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    await featureHttpService.activateFeatures();
    expect(apiClient.post).toHaveBeenCalledWith('/v1/features/activate', {});
  });

  it('returns response.data (BaseResponseModel<boolean>)', async () => {
    const { featureHttpService } = await import('../feature-http-service');
    const result = await featureHttpService.activateFeatures();
    expect(result.succeeded).toBe(true);
    expect(result.data).toBe(true);
  });
});

describe('featureHttpService.activateFeatures — HTTP-3: propagates error on HTTP failure', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
  });

  it('throws when apiClient.post rejects', async () => {
    const { featureHttpService } = await import('../feature-http-service');
    await expect(featureHttpService.activateFeatures()).rejects.toThrow('Network error');
  });
});
