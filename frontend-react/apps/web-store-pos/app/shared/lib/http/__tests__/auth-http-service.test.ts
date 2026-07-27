import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('~/shared/lib/http/api-client', () => ({
  apiClient: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

describe('authHttpService.register — POST /v1/auth/register (registerOwner parity)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: true, succeeded: true, message: '', actionCode: 0, errors: [] },
    });
  });

  it('sends exactly fullName/login/password/cellPhone/email/storeName/code — no passwordConfirmation — when code is non-empty', async () => {
    const { authHttpService } = await import('../auth-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');

    await authHttpService.register({
      fullName: 'Jane Doe',
      login: 'janedoe',
      password: 'Passw0rd!',
      cellPhone: '+5491100000',
      email: 'jane@test.com',
      storeName: 'Jane Store',
      code: 'ABC123',
      // stray property that must never leak to the wire, even if passed in carelessly
      passwordConfirmation: 'Passw0rd!',
    } as never);

    expect(apiClient.post).toHaveBeenCalledWith('/v1/auth/register', {
      fullName: 'Jane Doe',
      login: 'janedoe',
      password: 'Passw0rd!',
      cellPhone: '+5491100000',
      email: 'jane@test.com',
      storeName: 'Jane Store',
      code: 'ABC123',
    });
  });

  it('omits the code key entirely when code is an empty string', async () => {
    const { authHttpService } = await import('../auth-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');

    await authHttpService.register({
      fullName: 'Jane Doe',
      login: 'janedoe',
      password: 'Passw0rd!',
      cellPhone: '+5491100000',
      email: 'jane@test.com',
      storeName: 'Jane Store',
      code: '',
    });

    expect(apiClient.post).toHaveBeenCalledWith('/v1/auth/register', {
      fullName: 'Jane Doe',
      login: 'janedoe',
      password: 'Passw0rd!',
      cellPhone: '+5491100000',
      email: 'jane@test.com',
      storeName: 'Jane Store',
    });
    const body = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(body).not.toHaveProperty('code');
  });

  it('omits the code key entirely when code is whitespace-only', async () => {
    const { authHttpService } = await import('../auth-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');

    await authHttpService.register({
      fullName: 'Jane Doe',
      login: 'janedoe',
      password: 'Passw0rd!',
      cellPhone: '+5491100000',
      email: 'jane@test.com',
      storeName: 'Jane Store',
      code: '   ',
    });

    const body = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(body).not.toHaveProperty('code');
  });

  it('never leaks passwordConfirmation to the wire body', async () => {
    const { authHttpService } = await import('../auth-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');

    await authHttpService.register({
      fullName: 'Jane Doe',
      login: 'janedoe',
      password: 'Passw0rd!',
      cellPhone: '+5491100000',
      email: 'jane@test.com',
      storeName: 'Jane Store',
      passwordConfirmation: 'Passw0rd!',
    } as never);

    const body = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(body).not.toHaveProperty('passwordConfirmation');
  });

  it('returns the envelope typed as BaseResponseModel<boolean>', async () => {
    const { authHttpService } = await import('../auth-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: true, succeeded: true, message: '', actionCode: 0, errors: [] },
    });

    const result = await authHttpService.register({
      fullName: 'Jane Doe',
      login: 'janedoe',
      password: 'Passw0rd!',
      cellPhone: '+5491100000',
      email: 'jane@test.com',
      storeName: 'Jane Store',
    });

    expect(result).toHaveProperty('succeeded', true);
    expect(result).toHaveProperty('errors');
    expect(typeof result.data).toBe('boolean');
  });
});

describe('authHttpService.getMe — GET /v1/auth/me (billing fields passthrough)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('carries paymentDueDate/isInTrial/paymentStatus through unchanged', async () => {
    const { authHttpService } = await import('../auth-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        data: {
          id: 'user-1',
          login: 'janedoe',
          paymentDueDate: '2026-08-15',
          isInTrial: true,
          paymentStatus: 'PorVencer',
        },
      },
    });

    const result = await authHttpService.getMe();

    expect(result).toMatchObject({
      paymentDueDate: '2026-08-15',
      isInTrial: true,
      paymentStatus: 'PorVencer',
    });
  });

  it('carries a null paymentDueDate and a different paymentStatus through unchanged (triangulation)', async () => {
    const { authHttpService } = await import('../auth-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        data: {
          id: 'user-2',
          login: 'johndoe',
          paymentDueDate: null,
          isInTrial: false,
          paymentStatus: 'AlDia',
        },
      },
    });

    const result = await authHttpService.getMe();

    expect(result).toMatchObject({
      paymentDueDate: null,
      isInTrial: false,
      paymentStatus: 'AlDia',
    });
  });
});
