import { describe, it, expect, beforeEach, vi } from 'vitest';

const hasAnyAvailableToSaleProduct = vi.fn();

vi.mock('~/sales/lib/services/product-offline-service', () => ({
  ProductOfflineService: vi.fn().mockImplementation(() => ({ hasAnyAvailableToSaleProduct })),
}));

import { resolveUserHomePath } from '../user-home';
import type { UserModel } from '@store-mgmt/domain';

function makeUser(overrides: Partial<UserModel> = {}): UserModel {
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
    selectedStoreId: 's1',
    ...overrides,
  };
}

function envelope(data: boolean) {
  return { data, succeeded: true, message: '', actionCode: 200, errors: [] };
}

// Mirrors Angular's login.component.ts navigateToUserHome():
// resellers/superadmins -> owners admin; other users -> the sale screen when the
// store can sell, else products. "Can sell" is now a single
// ProductOfflineService.hasAnyAvailableToSaleProduct() call (async, category-C) — the
// active-category + sellable-product logic lives inside ProductRepository (Phase 1).
describe('resolveUserHomePath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasAnyAvailableToSaleProduct.mockResolvedValue(envelope(false));
  });

  it('sends a reseller to /admin/owners (no product lookup)', async () => {
    await expect(resolveUserHomePath(makeUser({ isReSeller: true }))).resolves.toBe('/admin/owners');
    expect(hasAnyAvailableToSaleProduct).not.toHaveBeenCalled();
  });

  it('sends a superadmin to /admin/owners (no product lookup)', async () => {
    await expect(resolveUserHomePath(makeUser({ isSuperAdmin: true }))).resolves.toBe('/admin/owners');
    expect(hasAnyAvailableToSaleProduct).not.toHaveBeenCalled();
  });

  it('sends a normal user with no sellable products to /sales/products', async () => {
    hasAnyAvailableToSaleProduct.mockResolvedValue(envelope(false));
    await expect(resolveUserHomePath(makeUser())).resolves.toBe('/sales/products');
  });

  it('sends a normal user whose store can sell to /sales/new', async () => {
    hasAnyAvailableToSaleProduct.mockResolvedValue(envelope(true));
    await expect(resolveUserHomePath(makeUser())).resolves.toBe('/sales/new');
  });
});
