import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/shared/lib/http/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

// ── getMe must guard `succeeded` ─────────────────────────────────────────────
// `AuthController.GetMeAsync` wraps the handler result in an unconditional
// `Ok(...)`, so `GetMeQuery`'s three failure paths — including the one that
// blacklists a deactivated user's token — arrive as HTTP 200 with
// `{ succeeded: false, data: null }`. axios resolves.
//
// getMe used to type that response as a hand-rolled `{ data: UserModel }`,
// which is why this call site escaped the response-envelope-nullability sweep:
// that change found its 43 call sites by flipping BaseResponseModel to a
// discriminated union and reading compiler errors, and an inline `{ data: X }`
// produces none. It returned `null` typed as `UserModel`.

describe('authHttpService.getMe — succeeded:false on an HTTP 200', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws SessionRejectedError instead of handing back a null typed as UserModel', async () => {
    const { authHttpService, SessionRejectedError } = await import('../auth-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        succeeded: false,
        data: null,
        message: null,
        actionCode: 404,
        errors: [{ code: 'User.AccountInactive', description: 'La cuenta está inactiva.' }],
      },
    });

    await expect(authHttpService.getMe()).rejects.toBeInstanceOf(SessionRejectedError);
  });

  it('still returns the user on a succeeded:true envelope', async () => {
    const { authHttpService } = await import('../auth-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        succeeded: true,
        data: { id: 'user-1', login: 'janedoe' },
        message: null,
        actionCode: 200,
        errors: [],
      },
    });

    const result = await authHttpService.getMe();

    expect(result).toMatchObject({ id: 'user-1', login: 'janedoe' });
  });

  it('carries the backend description so the rejection is diagnosable', async () => {
    const { authHttpService } = await import('../auth-http-service');
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        succeeded: false,
        data: null,
        message: null,
        actionCode: 404,
        errors: [{ code: 'User.AccountInactive', description: 'La cuenta está inactiva.' }],
      },
    });

    await expect(authHttpService.getMe()).rejects.toThrow('La cuenta está inactiva.');
  });
});
