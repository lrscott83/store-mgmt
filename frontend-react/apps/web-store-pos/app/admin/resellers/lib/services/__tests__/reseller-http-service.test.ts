import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── S-ADMIN-RESELLERS-HTTP-1 through 5 ─────────────────────────────────────────

vi.mock('~/shared/lib/http/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('resellerHttpService — HTTP-1: module exists as singleton', () => {
  it('exports a resellerHttpService object', async () => {
    const mod = await import('../reseller-http-service');
    expect(typeof mod.resellerHttpService).toBe('object');
    expect(mod.resellerHttpService).not.toBeNull();
  });
});

describe('resellerHttpService.listResellers — HTTP-2: GET /v1/reSellers/all/true', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        succeeded: true,
        data: [],
        message: '',
        actionCode: 0,
        errors: [],
      },
    });
  });

  it('calls GET /v1/reSellers/all/true', async () => {
    const { resellerHttpService } = await import('../reseller-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    await resellerHttpService.listResellers();
    expect(apiClient.get).toHaveBeenCalledWith('/v1/reSellers/all/true');
  });

  it('returns response.data (BaseResponseModel<ReSeller[]>)', async () => {
    const { resellerHttpService } = await import('../reseller-http-service');
    const result = await resellerHttpService.listResellers();
    expect(result.succeeded).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.message).toBe('');
    expect(result.actionCode).toBe(0);
    expect(result.errors).toEqual([]);
  });
});

describe('resellerHttpService.getReseller — HTTP-3: GET /v1/reSellers/:id', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        succeeded: true,
        data: {
          id: 'r1',
          userId: 'u1',
          fullName: 'John Reseller',
          percentDiscountPrice: 10,
          discountPrice: 5,
          cellPhone: '+53 5 123-4567',
          email: 'john@example.com',
          description: 'A reseller',
          guest: false,
          isActive: true,
          createdDate: new Date(),
          createdByName: 'admin',
        },
        message: '',
        actionCode: 0,
        errors: [],
      },
    });
  });

  it('calls GET /v1/reSellers/:id', async () => {
    const { resellerHttpService } = await import('../reseller-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    await resellerHttpService.getReseller('r1');
    expect(apiClient.get).toHaveBeenCalledWith('/v1/reSellers/r1');
  });

  it('returns response.data (BaseResponseModel<ReSeller>)', async () => {
    const { resellerHttpService } = await import('../reseller-http-service');
    const result = await resellerHttpService.getReseller('r1');
    expect(result.succeeded).toBe(true);
    expect(result.data.fullName).toBe('John Reseller');
    expect(result.message).toBe('');
    expect(result.actionCode).toBe(0);
    expect(result.errors).toEqual([]);
  });
});

describe('resellerHttpService.createReseller — HTTP-4: POST /v1/reSellers/', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        succeeded: true,
        data: true,
        message: '',
        actionCode: 0,
        errors: [],
      },
    });
  });

  it('calls POST /v1/reSellers/ with payload', async () => {
    const { resellerHttpService } = await import('../reseller-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    const payload = {
      fullName: 'Jane',
      login: 'jane',
      password: 'Pass1word',
      cellPhone: '+53 5 123-4567',
      email: 'jane@example.com',
      description: '',
    };
    await resellerHttpService.createReseller(payload);
    expect(apiClient.post).toHaveBeenCalledWith('/v1/reSellers/', payload);
  });

  it('returns response.data (BaseResponseModel<boolean>)', async () => {
    const { resellerHttpService } = await import('../reseller-http-service');
    const result = await resellerHttpService.createReseller({
      fullName: 'Jane',
      login: 'jane',
      password: 'Pass1word',
      cellPhone: '+53 5 123-4567',
      email: 'jane@example.com',
      description: '',
    });
    expect(result.succeeded).toBe(true);
    expect(result.message).toBe('');
    expect(result.actionCode).toBe(0);
    expect(result.errors).toEqual([]);
  });
});

describe('resellerHttpService.updateReseller — HTTP-5: PUT /v1/reSellers/:id', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        succeeded: true,
        data: true,
        message: '',
        actionCode: 0,
        errors: [],
      },
    });
  });

  it('calls PUT /v1/reSellers/:id with payload', async () => {
    const { resellerHttpService } = await import('../reseller-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    const payload = {
      fullName: 'Jane Updated',
      cellPhone: '+53 5 123-4567',
      email: 'jane@example.com',
      percentDiscountPrice: 10,
      discountPrice: 5,
      isActive: true,
      description: '',
    };
    await resellerHttpService.updateReseller('r1', payload);
    expect(apiClient.put).toHaveBeenCalledWith('/v1/reSellers/r1', payload);
  });

  it('returns response.data (BaseResponseModel<boolean>)', async () => {
    const { resellerHttpService } = await import('../reseller-http-service');
    const result = await resellerHttpService.updateReseller('r1', {
      fullName: 'Jane Updated',
      cellPhone: '+53 5 123-4567',
      email: 'jane@example.com',
      percentDiscountPrice: 10,
      discountPrice: 5,
      isActive: true,
      description: '',
    });
    expect(result.succeeded).toBe(true);
    expect(result.message).toBe('');
    expect(result.actionCode).toBe(0);
    expect(result.errors).toEqual([]);
  });
});

describe('resellerHttpService — propagates error on HTTP failure', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    (apiClient.post as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    (apiClient.put as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
  });

  it('listResellers throws when apiClient.get rejects', async () => {
    const { resellerHttpService } = await import('../reseller-http-service');
    await expect(resellerHttpService.listResellers()).rejects.toThrow('Network error');
  });

  it('getReseller throws when apiClient.get rejects', async () => {
    const { resellerHttpService } = await import('../reseller-http-service');
    await expect(resellerHttpService.getReseller('r1')).rejects.toThrow('Network error');
  });

  it('createReseller throws when apiClient.post rejects', async () => {
    const { resellerHttpService } = await import('../reseller-http-service');
    await expect(
      resellerHttpService.createReseller({
        fullName: 'x',
        login: 'x',
        password: 'x',
        cellPhone: 'x',
        email: 'x',
        description: '',
      })
    ).rejects.toThrow('Network error');
  });

  it('updateReseller throws when apiClient.put rejects', async () => {
    const { resellerHttpService } = await import('../reseller-http-service');
    await expect(
      resellerHttpService.updateReseller('r1', {
        fullName: 'x',
        cellPhone: 'x',
        email: 'x',
        percentDiscountPrice: 0,
        discountPrice: 0,
        isActive: true,
        description: '',
      })
    ).rejects.toThrow('Network error');
  });
});
