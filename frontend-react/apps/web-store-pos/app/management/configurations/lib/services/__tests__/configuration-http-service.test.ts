import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── HTTP-1 through HTTP-4 (ERR-5) ─────────────────────────────────────────────

vi.mock('~/shared/lib/http/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

describe('configurationHttpService — HTTP-1: module exists as singleton', () => {
  it('exports a configurationHttpService object', async () => {
    const mod = await import('../configuration-http-service');
    expect(typeof mod.configurationHttpService).toBe('object');
    expect(mod.configurationHttpService).not.toBeNull();
  });
});

describe('configurationHttpService.listConfigurations — HTTP-2: GET /v1/configurations', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: [{ id: '1', name: 'tax_rate', value: '0.15' }] },
    });
  });

  it('calls GET /v1/configurations', async () => {
    const { configurationHttpService } = await import('../configuration-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    await configurationHttpService.listConfigurations();
    expect(apiClient.get).toHaveBeenCalledWith('/v1/configurations');
  });

  it('returns the data array from the response', async () => {
    const { configurationHttpService } = await import('../configuration-http-service');
    const result = await configurationHttpService.listConfigurations();
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('tax_rate');
  });
});

describe('configurationHttpService.updateConfigurations — HTTP-3: PUT /v1/configurations', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: true },
    });
  });

  it('calls PUT /v1/configurations with full SystemConfiguration[] payload (DC3)', async () => {
    const { configurationHttpService } = await import('../configuration-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    const payload = [
      { id: '1', name: 'tax_rate', value: '0.15' },
      { id: '2', name: 'currency', value: 'USD' },
    ];
    await configurationHttpService.updateConfigurations(payload);
    expect(apiClient.put).toHaveBeenCalledWith('/v1/configurations', payload);
  });

  it('returns the boolean response data', async () => {
    const { configurationHttpService } = await import('../configuration-http-service');
    const result = await configurationHttpService.updateConfigurations([
      { id: '1', name: 'tax_rate', value: '0.20' },
    ]);
    expect(result.data).toBe(true);
  });
});
