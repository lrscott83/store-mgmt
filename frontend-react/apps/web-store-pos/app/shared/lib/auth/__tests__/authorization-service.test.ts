import { describe, it, expect, vi } from 'vitest';
import {
  isUserAuthorized,
  isSuperAdmin,
  isOwnerAdmin,
  isReSeller,
  isModuleAvailable,
  hasExpensesModuleAvailable,
  hasCreditsModuleAvailable,
  hasInventoryModuleAvailable,
  hasOwnersAvailableFeature,
} from '../authorization-service';
import { EModules, EFeatures } from '@store-mgmt/domain';
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

    it('empty featureIds returns false for a non-superAdmin (no empty-array short-circuit, Angular parity)', () => {
      expect(isUserAuthorized(makeUser({}), [], undefined)).toBe(false);
    });

    // companion (ordering): superAdmin still short-circuits before the (now-denying) store path
    it('empty featureIds still returns true for superAdmin', () => {
      expect(isUserAuthorized(makeUser({ isSuperAdmin: true }), [], undefined)).toBe(true);
    });

    it('denies when expired — expiry guard precedes even superAdmin (Angular :18 before :21)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);
      expect(
        isUserAuthorized(makeUser({ isSuperAdmin: true, expiresIn: 999 }), [21], 's1')
      ).toBe(false);
      vi.useRealTimers();
    });

    it('boundary: expiresIn === now is NOT expired (< exclusive, not <=)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);
      expect(
        isUserAuthorized(makeUser({ isSuperAdmin: true, expiresIn: 1000 }), [21], 's1')
      ).toBe(true);
      vi.useRealTimers();
    });

    it('ReSeller falls through to store-user check when featureIds do not grant (Angular fall-through)', () => {
      const user = makeUser({
        isReSeller: true,
        featureIds: [11],
        selectedStoreId: 's1',
        roles: [{ storeId: 's1', storeName: 'S1', moduleId: 2, featureIds: [21] }],
      });
      expect(isUserAuthorized(user, [21], 's1')).toBe(true); // old early-return => false
    });

    it('OwnerAdmin falls through to store-user check when featureIds do not grant', () => {
      const user = makeUser({
        isOwnerAdmin: true,
        featureIds: [11],
        selectedStoreId: 's1',
        roles: [{ storeId: 's1', storeName: 'S1', moduleId: 2, featureIds: [21] }],
      });
      expect(isUserAuthorized(user, [21], 's1')).toBe(true);
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

  describe('hasOwnersAvailableFeature (Angular AuthorizationService.hasOwnersAvailableFeature 1:1 port)', () => {
    it('returns true when user has the Owners feature via featureIds', () => {
      const user = makeUser({ isReSeller: true, featureIds: [EFeatures.Owners] });
      expect(hasOwnersAvailableFeature(user)).toBe(true);
    });

    it('returns false when user lacks the Owners feature', () => {
      const user = makeUser({ isReSeller: true, featureIds: [] });
      expect(hasOwnersAvailableFeature(user)).toBe(false);
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

    // 1:1 port of Angular's AuthorizationService.hasInventoryModuleAvailable
    // (frontend/src/app/_services/authorization/authorization.service.ts:53-55), used by
    // InventoryOfflineService.hasAvailableProductToSale's stock-check gate.
    it('hasInventoryModuleAvailable returns true when EModules.Inventory is in storeModuleIds', () => {
      const user = makeUser({ storeModuleIds: [EModules.Inventory] });
      expect(hasInventoryModuleAvailable(user)).toBe(true);
    });

    it('hasInventoryModuleAvailable returns false otherwise', () => {
      const user = makeUser({ storeModuleIds: [EModules.Sales] });
      expect(hasInventoryModuleAvailable(user)).toBe(false);
    });
  });
});
