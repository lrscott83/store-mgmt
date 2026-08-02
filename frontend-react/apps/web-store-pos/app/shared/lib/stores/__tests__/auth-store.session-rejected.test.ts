import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth-store';
import { StorageKeys } from '../../storage/storage-keys';
import type { UserModel } from '@store-mgmt/domain';

const THIRTY_FIVE_DAYS_MS = 35 * 24 * 60 * 60 * 1000;

const getMeMock = vi.fn();
vi.mock('../../http/auth-http-service', async () => {
  class SessionRejectedError extends Error {
    readonly name = 'SessionRejectedError';
  }
  return {
    SessionRejectedError,
    authHttpService: { getMe: () => getMeMock() },
  };
});

function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    id: 'u1',
    fullName: 'Test User',
    email: 'test@example.com',
    cellPhone: '',
    isActive: true,
    password: '',
    login: 'test@example.com',
    authToken: 'token123',
    refreshToken: 'refresh123',
    expiresIn: Date.now() + THIRTY_FIVE_DAYS_MS,
    roles: [],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: 's1',
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
    ...overrides,
  };
}

// `getUserByToken` only reaches its /me call when there is NO usable cached
// profile for the current token — a valid cache short-circuits before any
// network access (the offline-first branch). So: an AUTH_MODEL for one token,
// a CURRENT_USER cached under a DIFFERENT one.
function seedSessionWithoutUsableCache() {
  const expiresIn = Date.now() + THIRTY_FIVE_DAYS_MS;
  localStorage.setItem(
    StorageKeys.AUTH_MODEL,
    JSON.stringify({ authToken: 'token123', expiresIn })
  );
  localStorage.setItem(
    StorageKeys.CURRENT_USER,
    JSON.stringify(makeUser({ authToken: 'a-different-token' }))
  );
}

describe('getUserByToken — authoritative rejection vs transport failure', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false, error: null });
  });

  it('ends the session when /me rejects the session, instead of leaving a gutted user authenticated', async () => {
    const { SessionRejectedError } = await import('../../http/auth-http-service');
    seedSessionWithoutUsableCache();
    getMeMock.mockRejectedValue(new SessionRejectedError('La cuenta está inactiva.'));

    const result = await useAuthStore.getState().getUserByToken();

    expect(result).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
    // The backend blacklisted this token before answering — it must not survive.
    expect(localStorage.getItem(StorageKeys.AUTH_MODEL)).toBeNull();
  });

  it('ends the session on an HTTP 401 — the shape the backend will send once it maps status', async () => {
    seedSessionWithoutUsableCache();
    getMeMock.mockRejectedValue({ response: { status: 401 } });

    const result = await useAuthStore.getState().getUserByToken();

    expect(result).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('ends the session on an HTTP 404 — the status GetMeQuery already passes for AccountInactive', async () => {
    seedSessionWithoutUsableCache();
    getMeMock.mockRejectedValue({ response: { status: 404 } });

    const result = await useAuthStore.getState().getUserByToken();

    expect(result).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('REGRESSION — a network failure keeps the user signed in, which is the whole point of this catch', async () => {
    seedSessionWithoutUsableCache();
    // No `response` field: axios could not reach anyone.
    getMeMock.mockRejectedValue(new Error('Network Error'));

    const result = await useAuthStore.getState().getUserByToken();

    expect(result).not.toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(localStorage.getItem(StorageKeys.AUTH_MODEL)).not.toBeNull();
  });

  it('REGRESSION — a 500 is a server fault, not a verdict on the session, so the user stays signed in', async () => {
    seedSessionWithoutUsableCache();
    getMeMock.mockRejectedValue({ response: { status: 500 } });

    const result = await useAuthStore.getState().getUserByToken();

    expect(result).not.toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('never persists a profile built from a rejected /me', async () => {
    const { SessionRejectedError } = await import('../../http/auth-http-service');
    seedSessionWithoutUsableCache();
    const cachedBefore = localStorage.getItem(StorageKeys.CURRENT_USER);
    getMeMock.mockRejectedValue(new SessionRejectedError('La cuenta está inactiva.'));

    await useAuthStore.getState().getUserByToken();

    // The old code spread a null into {} and wrote that over the cache.
    expect(localStorage.getItem(StorageKeys.CURRENT_USER)).toBe(cachedBefore);
  });
});
