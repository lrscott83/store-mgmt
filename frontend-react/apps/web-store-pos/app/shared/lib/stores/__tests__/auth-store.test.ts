import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth-store';
import { StorageKeys } from '../../storage/storage-keys';
import type { UserModel } from '@store-mgmt/domain';

const THIRTY_FIVE_DAYS_MS = 35 * 24 * 60 * 60 * 1000;

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
    ...overrides,
  };
}

describe('useAuthStore', () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie = 'hasSession=; Max-Age=0; path=/';
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  });

  describe('AUTH-03: Valid token on startup', () => {
    it('restores session when a valid non-expired user is in localStorage', () => {
      const user = makeUser();
      localStorage.setItem(StorageKeys.AUTH_MODEL, JSON.stringify(user));

      useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.id).toBe('u1');
    });
  });

  describe('AUTH-03: Expired token on startup', () => {
    it('clears session when expiresIn is in the past', () => {
      const user = makeUser({ expiresIn: Date.now() - 1000 });
      localStorage.setItem(StorageKeys.AUTH_MODEL, JSON.stringify(user));

      useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(localStorage.getItem(StorageKeys.TOKEN)).toBeNull();
      expect(localStorage.getItem(StorageKeys.AUTH_MODEL)).toBeNull();
    });
  });

  describe('AUTH-03: Corrupted JSON in localStorage', () => {
    it('clears corrupted key and sets unauthenticated state without throwing', () => {
      localStorage.setItem(StorageKeys.AUTH_MODEL, '{invalid json{{');

      expect(() => useAuthStore.getState().initialize()).not.toThrow();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(localStorage.getItem(StorageKeys.AUTH_MODEL)).toBeNull();
    });
  });

  describe('setUser', () => {
    it('stores user and token and sets isAuthenticated', () => {
      const user = makeUser();
      useAuthStore.getState().setUser(user, 'mytoken');

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.id).toBe('u1');
      expect(localStorage.getItem(StorageKeys.TOKEN)).toBe('mytoken');
    });

    it('overrides expiresIn to 35 days from now', () => {
      const before = Date.now();
      const user = makeUser({ expiresIn: 0 });
      useAuthStore.getState().setUser(user, 'tok');

      const stored = JSON.parse(localStorage.getItem(StorageKeys.AUTH_MODEL)!);
      expect(stored.expiresIn).toBeGreaterThan(before + THIRTY_FIVE_DAYS_MS - 1000);
    });
  });

  describe('logout', () => {
    it('clears user, token, and auth model from localStorage', () => {
      const user = makeUser();
      useAuthStore.getState().setUser(user, 'tok');
      useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(localStorage.getItem(StorageKeys.TOKEN)).toBeNull();
      expect(localStorage.getItem(StorageKeys.AUTH_MODEL)).toBeNull();
    });
  });

  describe('updateUser — STORE-1 through STORE-4, S-STORE-1', () => {
    it('writes updated user to StorageKeys.AUTH_MODEL', () => {
      const user = makeUser({ fullName: 'Original Name' });
      useAuthStore.setState({ user, isAuthenticated: true });

      const updatedUser = makeUser({ fullName: 'María García', password: '' });
      useAuthStore.getState().updateUser(updatedUser);

      const stored = JSON.parse(localStorage.getItem(StorageKeys.AUTH_MODEL)!);
      expect(stored.fullName).toBe('María García');
    });

    it('writes updated user to StorageKeys.CURRENT_USER', () => {
      const user = makeUser({ fullName: 'Original Name' });
      useAuthStore.setState({ user, isAuthenticated: true });

      const updatedUser = makeUser({ fullName: 'María García', password: '' });
      useAuthStore.getState().updateUser(updatedUser);

      const currentUser = JSON.parse(localStorage.getItem(StorageKeys.CURRENT_USER)!);
      expect(currentUser.fullName).toBe('María García');
    });

    it('updates Zustand state.user with the new user', () => {
      const user = makeUser({ fullName: 'Original Name' });
      useAuthStore.setState({ user, isAuthenticated: true });

      const updatedUser = makeUser({ fullName: 'María García' });
      useAuthStore.getState().updateUser(updatedUser);

      expect(useAuthStore.getState().user?.fullName).toBe('María García');
    });

    it('forces password to empty string in stored user', () => {
      const user = makeUser({ password: 'somepass' });
      useAuthStore.setState({ user, isAuthenticated: true });

      const updatedUser = makeUser({ password: 'ShouldBeCleared' });
      useAuthStore.getState().updateUser(updatedUser);

      const stored = JSON.parse(localStorage.getItem(StorageKeys.AUTH_MODEL)!);
      expect(stored.password).toBe('');
      expect(useAuthStore.getState().user?.password).toBe('');
    });

    it('does NOT mutate isAuthenticated, isLoading, or error', () => {
      const user = makeUser();
      useAuthStore.setState({
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });

      useAuthStore.getState().updateUser(makeUser({ fullName: 'New Name' }));

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('keeps a valid session expiry when the updated user has no expiresIn (e.g. from /me)', () => {
      // /v1/auth/me returns a profile UserModel without expiresIn; updateUser
      // must not wipe the session expiry or the next reload would log the user out.
      const sessionExpiry = Date.now() + THIRTY_FIVE_DAYS_MS;
      const user = makeUser({ expiresIn: sessionExpiry });
      useAuthStore.setState({ user, isAuthenticated: true });

      const { expiresIn: _omit, ...fromMe } = makeUser({ fullName: 'Refreshed' });
      useAuthStore.getState().updateUser(fromMe as UserModel);

      const stored = JSON.parse(localStorage.getItem(StorageKeys.AUTH_MODEL)!);
      expect(stored.fullName).toBe('Refreshed');
      expect(stored.expiresIn).toBe(sessionExpiry);
    });
  });

  describe('AUTH-03: Background /me on startup', () => {
    it('fires background /me call when online and token exists — does not block render', async () => {
      const user = makeUser();
      localStorage.setItem(StorageKeys.AUTH_MODEL, JSON.stringify(user));
      localStorage.setItem(StorageKeys.TOKEN, 'token123');

      // Mock apiClient before initialize
      const mockGet = vi.fn().mockResolvedValue({ data: { data: { ...user, fullName: 'Updated Name' } } });
      vi.doMock('~/shared/lib/http/api-client', () => ({ apiClient: { get: mockGet } }));

      // Mock navigator.onLine as true (jsdom default)
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

      useAuthStore.getState().initialize();

      // Initialize must be synchronous — state is set immediately
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.id).toBe('u1');
    });

    it('does not throw when /me fails (offline) — AUTH-03 background /me fail scenario', async () => {
      const user = makeUser();
      localStorage.setItem(StorageKeys.AUTH_MODEL, JSON.stringify(user));
      localStorage.setItem(StorageKeys.TOKEN, 'token123');

      // Mock navigator.onLine as false
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

      expect(() => useAuthStore.getState().initialize()).not.toThrow();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true); // still authenticated from cache
    });
  });
});
