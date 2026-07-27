import { beforeEach, describe, expect, it } from 'vitest';
import type { UserModel } from '@store-mgmt/domain';
import { StorageKeys } from '../../storage/storage-keys';
import { StorageService } from '../storage-service';

function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    id: 'u1',
    login: 'jdoe',
    fullName: 'Test User',
    cellPhone: '',
    email: 'jdoe@test.com',
    isActive: true,
    password: '',
    authToken: 'tok',
    refreshToken: 'ref',
    expiresIn: Date.now() + 1000000,
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

describe('StorageService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('token (key: token)', () => {
    it('round-trips a token through set/get', () => {
      StorageService.setTokenToLocalStorage('mytoken');
      expect(StorageService.getTokenFromLocalStorage()).toBe('mytoken');
      expect(localStorage.getItem(StorageKeys.TOKEN)).toBe('mytoken');
    });

    it('removes the token', () => {
      StorageService.setTokenToLocalStorage('mytoken');
      StorageService.removeTokenFromLocalStorage();
      expect(StorageService.getTokenFromLocalStorage()).toBeNull();
      expect(localStorage.getItem(StorageKeys.TOKEN)).toBeNull();
    });
  });

  describe('currentUser (key: currentUser)', () => {
    it('round-trips a user through set/get, writing only the currentUser key', () => {
      const user = makeUser({ login: 'jdoe' });
      StorageService.setCurrentUser(user);

      const stored = StorageService.getCurrentUser();
      expect(stored?.login).toBe('jdoe');
      expect(localStorage.getItem(StorageKeys.CURRENT_USER)).not.toBeNull();
      expect(localStorage.getItem(StorageKeys.AUTH_MODEL)).toBeNull();
    });

    it('does not touch AUTH_MODEL when a value already exists there', () => {
      localStorage.setItem(StorageKeys.AUTH_MODEL, JSON.stringify({ authToken: 'x', expiresIn: 1 }));
      StorageService.setCurrentUser(makeUser());
      expect(localStorage.getItem(StorageKeys.AUTH_MODEL)).toBe(
        JSON.stringify({ authToken: 'x', expiresIn: 1 }),
      );
    });

    it('removes the currentUser', () => {
      StorageService.setCurrentUser(makeUser());
      StorageService.removeCurrentUser();
      expect(StorageService.getCurrentUser()).toBeNull();
      expect(localStorage.getItem(StorageKeys.CURRENT_USER)).toBeNull();
    });

    it('strips a non-empty password before persisting', () => {
      StorageService.setCurrentUser(makeUser({ password: 'super-secret' }));

      const raw = localStorage.getItem(StorageKeys.CURRENT_USER);
      expect(raw).not.toContain('super-secret');

      const stored = StorageService.getCurrentUser();
      expect(stored?.password).toBe('');
    });
  });

  describe('removed members (no Angular correlate, rule-12)', () => {
    it('does not expose renamed/removed equivalents', () => {
      const service = StorageService as Record<string, unknown>;
      expect(service.getUser).toBeUndefined();
      expect(service.setUser).toBeUndefined();
      expect(service.removeUser).toBeUndefined();
      expect(service.getToken).toBeUndefined();
      expect(service.setToken).toBeUndefined();
      expect(service.removeToken).toBeUndefined();
    });

    it('does not expose cookie/clear members', () => {
      const service = StorageService as Record<string, unknown>;
      expect(service.setSessionCookie).toBeUndefined();
      expect(service.clearSessionCookie).toBeUndefined();
      expect(service.clear).toBeUndefined();
    });
  });
});
