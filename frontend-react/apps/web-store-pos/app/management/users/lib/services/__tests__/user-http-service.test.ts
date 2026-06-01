import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── HTTP-1 through HTTP-8 (CRED-1) ────────────────────────────────────────────

vi.mock('~/shared/lib/http/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('userHttpService — HTTP-1: module exists as singleton', () => {
  it('exports a userHttpService object', async () => {
    const mod = await import('../user-http-service');
    expect(typeof mod.userHttpService).toBe('object');
    expect(mod.userHttpService).not.toBeNull();
  });
});

describe('userHttpService.listUsers — HTTP-2: GET /v1/storeusers/list/true', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: [{ id: 'u1', fullName: 'User One', login: 'user1', isActive: true }] },
    });
  });

  it('calls GET /v1/storeusers/list/true (not /users/all/true)', async () => {
    const { userHttpService } = await import('../user-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    await userHttpService.listUsers();
    expect(apiClient.get).toHaveBeenCalledWith('/v1/storeusers/list/true');
  });

  it('returns the data array from the response', async () => {
    const { userHttpService } = await import('../user-http-service');
    const result = await userHttpService.listUsers();
    expect(result.data).toHaveLength(1);
    expect(result.data[0].fullName).toBe('User One');
  });
});

describe('userHttpService.getUser — HTTP-3: GET /v1/storeusers/:id', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'u1', fullName: 'User One' } },
    });
  });

  it('calls GET /v1/storeusers/:id with correct id', async () => {
    const { userHttpService } = await import('../user-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    await userHttpService.getUser('u1');
    expect(apiClient.get).toHaveBeenCalledWith('/v1/storeusers/u1');
  });

  it('returns the user from the response', async () => {
    const { userHttpService } = await import('../user-http-service');
    const result = await userHttpService.getUser('u1');
    expect(result.data.fullName).toBe('User One');
  });
});

describe('userHttpService.createUser — HTTP-4: POST /v1/storeusers', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: true },
    });
  });

  it('calls POST /v1/storeusers with payload including roleIds:[3]', async () => {
    const { userHttpService } = await import('../user-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    const payload = {
      storeId: 's1',
      fullName: 'New User',
      login: 'newuser',
      password: 'Pass1word1',
      cellPhone: '+123',
      email: 'new@test.com',
      roleIds: [3],
    };
    await userHttpService.createUser(payload);
    expect(apiClient.post).toHaveBeenCalledWith('/v1/storeusers', payload);
  });

  it('returns the boolean response data', async () => {
    const { userHttpService } = await import('../user-http-service');
    const result = await userHttpService.createUser({
      storeId: 's1',
      fullName: 'User',
      login: 'u',
      password: 'P1',
      cellPhone: '+1',
      email: '',
      roleIds: [3],
    });
    expect(result.data).toBe(true);
  });
});

describe('userHttpService.updateUserDetails — HTTP-5: PUT /v1/users/:id', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: true },
    });
  });

  it('calls PUT /v1/users/:id with payload including isActive', async () => {
    const { userHttpService } = await import('../user-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    const payload = { fullName: 'Updated User', cellPhone: '+456', email: 'u@test.com', isActive: true };
    await userHttpService.updateUserDetails('u1', payload);
    expect(apiClient.put).toHaveBeenCalledWith('/v1/users/u1', payload);
  });

  it('returns the boolean response data', async () => {
    const { userHttpService } = await import('../user-http-service');
    const result = await userHttpService.updateUserDetails('u1', {
      fullName: 'X', cellPhone: '', email: '', isActive: false,
    });
    expect(result.data).toBe(true);
  });
});

describe('userHttpService.activateUser — HTTP-6: POST /v1/users/activate', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: true } });
  });

  it('calls POST /v1/users/activate with {id, isActive:true}', async () => {
    const { userHttpService } = await import('../user-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    await userHttpService.activateUser('u1');
    expect(apiClient.post).toHaveBeenCalledWith('/v1/users/activate', { id: 'u1', isActive: true });
  });
});

describe('userHttpService.deactivateUser — HTTP-7: DELETE /v1/users/:id', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: true } });
  });

  it('calls DELETE /v1/users/:id', async () => {
    const { userHttpService } = await import('../user-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    await userHttpService.deactivateUser('u1');
    expect(apiClient.delete).toHaveBeenCalledWith('/v1/users/u1');
  });
});

describe('userHttpService.changePassword — CRED-1: POST /v1/users/change-password/:id', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: true } });
  });

  it('calls POST /v1/users/change-password/:id with {oldPassword, newPassword}', async () => {
    const { userHttpService } = await import('../user-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    await userHttpService.changePassword('u1', { oldPassword: 'OldPass1', newPassword: 'NewPass1' });
    expect(apiClient.post).toHaveBeenCalledWith('/v1/users/change-password/u1', {
      oldPassword: 'OldPass1',
      newPassword: 'NewPass1',
    });
  });

  it('returns boolean result from response', async () => {
    const { userHttpService } = await import('../user-http-service');
    const result = await userHttpService.changePassword('u1', { oldPassword: 'old', newPassword: 'new' });
    expect(result.data).toBe(true);
  });
});
