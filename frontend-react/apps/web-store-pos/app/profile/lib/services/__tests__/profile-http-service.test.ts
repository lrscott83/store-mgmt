import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── HTTP-1 through HTTP-5 ────────────────────────────────────────────────────

vi.mock('~/shared/lib/http/api-client', () => ({
  apiClient: {
    put: vi.fn(),
    post: vi.fn(),
  },
}));

describe('profileHttpService — HTTP-1: module exists as singleton', () => {
  it('exports a profileHttpService object', async () => {
    const mod = await import('../profile-http-service');
    expect(typeof mod.profileHttpService).toBe('object');
    expect(mod.profileHttpService).not.toBeNull();
  });
});

describe('profileHttpService.updateProfile — HTTP-2: PUT /v1/users/{id}', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'u1', fullName: 'Updated Name' } },
    });
  });

  it('calls PUT /v1/users/{userId} with the correct payload', async () => {
    const { profileHttpService } = await import('../profile-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');

    const payload = {
      fullName: 'María García',
      cellPhone: '+54911',
      email: 'maria@test.com',
      isActive: true,
    };

    await profileHttpService.updateProfile('u1', payload);

    expect(apiClient.put).toHaveBeenCalledWith('/v1/users/u1', payload);
  });

  it('returns the response data from the apiClient', async () => {
    const { profileHttpService } = await import('../profile-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'u1', fullName: 'María García' } },
    });

    const result = await profileHttpService.updateProfile('u1', {
      fullName: 'María García',
      cellPhone: '',
      email: '',
      isActive: true,
    });

    expect(result.data.fullName).toBe('María García');
  });
});

describe('profileHttpService.changePassword — HTTP-3: POST /v1/users/change-password/{id}', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: null },
    });
  });

  it('calls POST /v1/users/change-password/{userId} with oldPassword and newPassword', async () => {
    const { profileHttpService } = await import('../profile-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');

    await profileHttpService.changePassword('u1', {
      oldPassword: 'OldPass1',
      newPassword: 'NewPass2',
    });

    expect(apiClient.post).toHaveBeenCalledWith('/v1/users/change-password/u1', {
      oldPassword: 'OldPass1',
      newPassword: 'NewPass2',
    });
  });

  it('returns the response from the apiClient for changePassword', async () => {
    const { profileHttpService } = await import('../profile-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true },
    });

    const result = await profileHttpService.changePassword('u2', {
      oldPassword: 'Old1',
      newPassword: 'NewPass2',
    });

    expect(result.success).toBe(true);
  });
});
