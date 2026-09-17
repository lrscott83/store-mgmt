import { describe, it, expect, vi, beforeEach } from 'vitest';

const getMeMock = vi.fn();
vi.mock('../../http/auth-http-service', () => ({
  authHttpService: { getMe: () => getMeMock() },
}));

const updateUserMock = vi.fn();
const logoutMock = vi.fn();
vi.mock('../auth-store', () => ({
  useAuthStore: {
    getState: () => ({ updateUser: updateUserMock, logout: logoutMock }),
  },
}));

import { softRefreshSession } from '../soft-refresh-session';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('softRefreshSession', () => {
  it('asks /me and hands the fresh profile to updateUser', async () => {
    const fresh = { id: 'u1', featureIds: [36], storeModuleIds: [13] };
    getMeMock.mockResolvedValue(fresh);

    await expect(softRefreshSession()).resolves.toBe(true);

    expect(getMeMock).toHaveBeenCalledTimes(1);
    expect(updateUserMock).toHaveBeenCalledTimes(1);
    expect(updateUserMock).toHaveBeenCalledWith(fresh);
  });

  // The whole point of the flow: the caller already persisted the plan change,
  // so a failed refresh is a non-event -- and it must NOT be turned into a
  // session-destroying logout (CLAUDE.md:93-100: a valid session never lands on
  // /login).
  it('keeps the cached session and never logs out when the refresh fails', async () => {
    getMeMock.mockRejectedValue(new Error('network down'));

    await expect(softRefreshSession()).resolves.toBe(false);

    expect(updateUserMock).not.toHaveBeenCalled();
    expect(logoutMock).not.toHaveBeenCalled();
  });

  it('treats an empty answer as no refresh rather than writing a broken profile', async () => {
    getMeMock.mockResolvedValue(undefined);

    await expect(softRefreshSession()).resolves.toBe(false);

    expect(updateUserMock).not.toHaveBeenCalled();
  });
});
