import { describe, it, expect } from 'vitest';
import {
  isUserAuthorized,
  isSuperAdmin,
  isOwnerAdmin,
  isReSeller,
  isModuleAvailable,
  hasExpensesModuleAvailable,
  hasCreditsModuleAvailable,
} from '../authorization-service';
import { EModules } from '@store-mgmt/domain';
import type { UserModel } from '@store-mgmt/domain';

function makeUser(overrides: Partial<UserModel>): UserModel {
  return {
    id: 'u1',
    login: 'user@test.com',
    fullName: 'Test User',
    cellPhone: '+1234567890',
    email: 'user@test.com',
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
    selectedStoreId: '',
    ...overrides,
  };
}

describe('AuthorizationService', () => {
  describe('isSuperAdmin', () => {
    it('returns true when isSuperAdmin flag is set', () => {
      expect(isSuperAdmin(makeUser({ isSuperAdmin: true }))).toBe(true);
    });

    it('returns false for regular user', () => {
      expect(isSuperAdmin(makeUser({}))).toBe(false);
    });
  });

  describe('isOwnerAdmin', () => {
    it('returns true when isOwnerAdmin flag is set', () => {
      expect(isOwnerAdmin(makeUser({ isOwnerAdmin: true }))).toBe(true);
    });
  });

  describe('isReSeller', () => {
    it('returns true when isReSeller flag is set', () => {
      expect(isReSeller(makeUser({ isReSeller: true }))).toBe(true);
    });
  });

  describe('isUserAuthorized', () => {
    it('SuperAdmin always passes — bypasses all feature checks', () => {
      const user = makeUser({ isSuperAdmin: true });
      expect(isUserAuthorized(user, [21, 22], 's1')).toBe(true);
      expect(isUserAuthorized(user, [999], undefined)).toBe(true);
    });

    it('ReSeller with matching featureIds returns true', () => {
      const user = makeUser({ isReSeller: true, featureIds: [11, 12, 13] });
      expect(isUserAuthorized(user, [11], undefined)).toBe(true);
      expect(isUserAuthorized(user, [11, 12], undefined)).toBe(true);
    });

    it('ReSeller with ANY of the required featureIds returns true (Angular .some semantics)', () => {
      const user = makeUser({ isReSeller: true, featureIds: [11] });
      expect(isUserAuthorized(user, [11, 12], undefined)).toBe(true);
    });

    it('ReSeller with NONE of the required featureIds returns false', () => {
      const user = makeUser({ isReSeller: true, featureIds: [11] });
      expect(isUserAuthorized(user, [12, 13], undefined)).toBe(false);
    });

    it('OwnerAdmin with matching featureIds returns true', () => {
      const user = makeUser({ isOwnerAdmin: true, featureIds: [20, 21] });
      expect(isUserAuthorized(user, [20], undefined)).toBe(true);
    });

    it('OwnerAdmin missing required featureId returns false', () => {
      const user = makeUser({ isOwnerAdmin: true, featureIds: [20] });
      expect(isUserAuthorized(user, [21], undefined)).toBe(false);
    });

    it('StoreUser with correct storeId and featureIds returns true', () => {
      const user = makeUser({
        roles: [
          { storeId: 's1', storeName: 'Store 1', moduleId: 2, featureIds: [21, 22] },
        ],
      });
      expect(isUserAuthorized(user, [21], 's1')).toBe(true);
    });

    it('StoreUser wrong store returns false — AUTH-05 scenario', () => {
      const user = makeUser({
        roles: [
          { storeId: 's1', storeName: 'Store 1', moduleId: 2, featureIds: [21, 22] },
        ],
      });
      expect(isUserAuthorized(user, [21], 's2')).toBe(false);
    });

    it('StoreUser with correct store but missing featureId returns false', () => {
      const user = makeUser({
        roles: [
          { storeId: 's1', storeName: 'Store 1', moduleId: 2, featureIds: [21] },
        ],
      });
      expect(isUserAuthorized(user, [22], 's1')).toBe(false);
    });

    it('StoreUser no matching store role returns false', () => {
      const user = makeUser({ roles: [] });
      expect(isUserAuthorized(user, [21], 's1')).toBe(false);
    });

    it('empty featureIds required returns true for any authenticated user', () => {
      const user = makeUser({});
      expect(isUserAuthorized(user, [], undefined)).toBe(true);
    });

    it('StoreUser multiple role entries for same store — uses combined featureIds', () => {
      const user = makeUser({
        roles: [
          { storeId: 's1', storeName: 'Store 1', moduleId: 2, featureIds: [21] },
          { storeId: 's1', storeName: 'Store 1', moduleId: 3, featureIds: [31] },
        ],
      });
      expect(isUserAuthorized(user, [21], 's1')).toBe(true);
      expect(isUserAuthorized(user, [31], 's1')).toBe(true);
    });
  });

  describe('isModuleAvailable (Angular AuthorizationService.hasModuleAvailable 1:1 port)', () => {
    it('returns true when moduleId is present in storeModuleIds', () => {
      const user = makeUser({ storeModuleIds: [EModules.Sales, EModules.Expenses] });
      expect(isModuleAvailable(user, EModules.Expenses)).toBe(true);
    });

    it('returns false when moduleId is not present in storeModuleIds', () => {
      const user = makeUser({ storeModuleIds: [EModules.Sales] });
      expect(isModuleAvailable(user, EModules.Credits)).toBe(false);
    });

    it('returns false for an empty storeModuleIds list', () => {
      const user = makeUser({ storeModuleIds: [] });
      expect(isModuleAvailable(user, EModules.Expenses)).toBe(false);
    });
  });

  describe('hasExpensesModuleAvailable / hasCreditsModuleAvailable', () => {
    it('hasExpensesModuleAvailable returns true when EModules.Expenses is in storeModuleIds', () => {
      const user = makeUser({ storeModuleIds: [EModules.Expenses] });
      expect(hasExpensesModuleAvailable(user)).toBe(true);
    });

    it('hasExpensesModuleAvailable returns false otherwise', () => {
      const user = makeUser({ storeModuleIds: [EModules.Sales] });
      expect(hasExpensesModuleAvailable(user)).toBe(false);
    });

    it('hasCreditsModuleAvailable returns true when EModules.Credits is in storeModuleIds', () => {
      const user = makeUser({ storeModuleIds: [EModules.Credits] });
      expect(hasCreditsModuleAvailable(user)).toBe(true);
    });

    it('hasCreditsModuleAvailable returns false otherwise', () => {
      const user = makeUser({ storeModuleIds: [EModules.Sales] });
      expect(hasCreditsModuleAvailable(user)).toBe(false);
    });
  });
});
