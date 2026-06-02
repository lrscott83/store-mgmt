import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── S-ADMIN-OWNERS-HTTP-1 through 6 ────────────────────────────────────────────

vi.mock('~/shared/lib/http/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('ownerHttpService — HTTP-1: module exists as singleton', () => {
  it('exports an ownerHttpService object', async () => {
    const mod = await import('../owner-http-service');
    expect(typeof mod.ownerHttpService).toBe('object');
    expect(mod.ownerHttpService).not.toBeNull();
  });
});

describe('ownerHttpService.listOwners — HTTP-2: GET /v1/owners/all/true', () => {
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

  it('calls GET /v1/owners/all/true', async () => {
    const { ownerHttpService } = await import('../owner-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    await ownerHttpService.listOwners();
    expect(apiClient.get).toHaveBeenCalledWith('/v1/owners/all/true');
  });

  it('returns response.data (BaseResponseModel<Owner[]>)', async () => {
    const { ownerHttpService } = await import('../owner-http-service');
    const result = await ownerHttpService.listOwners();
    expect(result.succeeded).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.message).toBe('');
    expect(result.actionCode).toBe(0);
    expect(result.errors).toEqual([]);
  });
});

describe('ownerHttpService.getOwner — HTTP-3: GET /v1/owners/:id', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        succeeded: true,
        data: {
          id: 'o1',
          userId: 'u1',
          fullName: 'John Owner',
          cellPhone: '+53 5 123-4567',
          email: 'john@example.com',
          description: 'An owner',
          guest: false,
          isActive: true,
          reSellerId: '',
          reSellerName: 'ADMIN',
          approved: true,
          storeModules: [],
          createdDate: new Date(),
          createdByName: 'admin',
        },
        message: '',
        actionCode: 0,
        errors: [],
      },
    });
  });

  it('calls GET /v1/owners/:id', async () => {
    const { ownerHttpService } = await import('../owner-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    await ownerHttpService.getOwner('o1');
    expect(apiClient.get).toHaveBeenCalledWith('/v1/owners/o1');
  });

  it('returns response.data (BaseResponseModel<Owner>)', async () => {
    const { ownerHttpService } = await import('../owner-http-service');
    const result = await ownerHttpService.getOwner('o1');
    expect(result.succeeded).toBe(true);
    expect(result.data.fullName).toBe('John Owner');
    expect(result.message).toBe('');
    expect(result.actionCode).toBe(0);
    expect(result.errors).toEqual([]);
  });
});

describe('ownerHttpService.createOwner — HTTP-4: POST /v1/owners/', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        succeeded: true,
        data: '',
        message: '',
        actionCode: 0,
        errors: [],
      },
    });
  });

  it('calls POST /v1/owners/ with payload', async () => {
    const { ownerHttpService } = await import('../owner-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    const payload = {
      fullName: 'Jane',
      login: 'jane',
      password: 'Pass1word',
      cellPhone: '+53 5 123-4567',
      email: 'jane@example.com',
      description: '',
      reSellerId: '',
    };
    await ownerHttpService.createOwner(payload);
    expect(apiClient.post).toHaveBeenCalledWith('/v1/owners/', payload);
  });

  it('returns response.data with non-nullable string (BaseResponseModel<string>)', async () => {
    const { ownerHttpService } = await import('../owner-http-service');
    const result = await ownerHttpService.createOwner({
      fullName: 'Jane',
      login: 'jane',
      password: 'Pass1word',
      cellPhone: '+53 5 123-4567',
      email: 'jane@example.com',
      description: '',
      reSellerId: '',
    });
    expect(result.succeeded).toBe(true);
    expect(result.data).toBe('');
    expect(result.message).toBe('');
    expect(result.actionCode).toBe(0);
    expect(result.errors).toEqual([]);
  });
});

describe('ownerHttpService.updateOwner — HTTP-5: PUT /v1/owners/:id', () => {
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

  it('calls PUT /v1/owners/:id with payload', async () => {
    const { ownerHttpService } = await import('../owner-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    const payload = {
      fullName: 'Jane Updated',
      cellPhone: '+53 5 123-4567',
      email: 'jane@example.com',
      guest: false,
      isActive: true,
      description: '',
      reSellerId: '',
    };
    await ownerHttpService.updateOwner('o1', payload);
    expect(apiClient.put).toHaveBeenCalledWith('/v1/owners/o1', payload);
  });

  it('returns response.data (BaseResponseModel<boolean>)', async () => {
    const { ownerHttpService } = await import('../owner-http-service');
    const result = await ownerHttpService.updateOwner('o1', {
      fullName: 'Jane Updated',
      cellPhone: '+53 5 123-4567',
      email: 'jane@example.com',
      guest: false,
      isActive: true,
      description: '',
      reSellerId: '',
    });
    expect(result.succeeded).toBe(true);
    expect(result.message).toBe('');
    expect(result.actionCode).toBe(0);
    expect(result.errors).toEqual([]);
  });
});

describe('ownerHttpService.deleteOwner — HTTP-6: DELETE /v1/owners/:id', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        succeeded: true,
        data: true,
        message: '',
        actionCode: 0,
        errors: [],
      },
    });
  });

  it('calls DELETE /v1/owners/:id', async () => {
    const { ownerHttpService } = await import('../owner-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    await ownerHttpService.deleteOwner('o1');
    expect(apiClient.delete).toHaveBeenCalledWith('/v1/owners/o1');
  });

  it('returns response.data (BaseResponseModel<boolean>)', async () => {
    const { ownerHttpService } = await import('../owner-http-service');
    const result = await ownerHttpService.deleteOwner('o1');
    expect(result.succeeded).toBe(true);
    expect(result.message).toBe('');
    expect(result.actionCode).toBe(0);
    expect(result.errors).toEqual([]);
  });
});

describe('ownerHttpService — propagates error on HTTP failure', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    (apiClient.post as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    (apiClient.put as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    (apiClient.delete as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
  });

  it('listOwners throws when apiClient.get rejects', async () => {
    const { ownerHttpService } = await import('../owner-http-service');
    await expect(ownerHttpService.listOwners()).rejects.toThrow('Network error');
  });

  it('getOwner throws when apiClient.get rejects', async () => {
    const { ownerHttpService } = await import('../owner-http-service');
    await expect(ownerHttpService.getOwner('o1')).rejects.toThrow('Network error');
  });

  it('createOwner throws when apiClient.post rejects', async () => {
    const { ownerHttpService } = await import('../owner-http-service');
    await expect(
      ownerHttpService.createOwner({
        fullName: 'x',
        login: 'x',
        password: 'x',
        cellPhone: 'x',
        email: 'x',
        description: '',
        reSellerId: '',
      })
    ).rejects.toThrow('Network error');
  });

  it('updateOwner throws when apiClient.put rejects', async () => {
    const { ownerHttpService } = await import('../owner-http-service');
    await expect(
      ownerHttpService.updateOwner('o1', {
        fullName: 'x',
        cellPhone: 'x',
        email: 'x',
        guest: false,
        isActive: true,
        description: '',
        reSellerId: '',
      })
    ).rejects.toThrow('Network error');
  });

  it('deleteOwner throws when apiClient.delete rejects', async () => {
    const { ownerHttpService } = await import('../owner-http-service');
    await expect(ownerHttpService.deleteOwner('o1')).rejects.toThrow('Network error');
  });
});
