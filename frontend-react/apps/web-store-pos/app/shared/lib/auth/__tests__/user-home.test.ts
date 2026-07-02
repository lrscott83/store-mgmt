import { describe, it, expect, beforeEach, vi } from 'vitest';

const getAllCategories = vi.fn();
const getAllProducts = vi.fn();

vi.mock('~/sales/lib/services/product-category-offline-service', () => ({
  ProductCategoryOfflineService: vi.fn().mockImplementation(() => ({ getAll: getAllCategories })),
}));
vi.mock('~/sales/lib/services/product-offline-service', () => ({
  ProductOfflineService: vi.fn().mockImplementation(() => ({ getAll: getAllProducts })),
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

// Mirrors Angular's login.component.ts navigateToUserHome():
// resellers/superadmins -> owners admin; other users -> the sale screen when the
// store can sell (active category AND active sellable product), else products.
describe('resolveUserHomePath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllCategories.mockReturnValue([]);
    getAllProducts.mockReturnValue([]);
  });

  it('sends a reseller to /admin/owners', () => {
    expect(resolveUserHomePath(makeUser({ isReSeller: true }))).toBe('/admin/owners');
  });

  it('sends a superadmin to /admin/owners', () => {
    expect(resolveUserHomePath(makeUser({ isSuperAdmin: true }))).toBe('/admin/owners');
  });

  it('sends a normal user with no sellable products to /sales/products', () => {
    getAllCategories.mockReturnValue([{ isActive: true }]);
    getAllProducts.mockReturnValue([]);
    expect(resolveUserHomePath(makeUser())).toBe('/sales/products');
  });

  it('sends a normal user with an active category and a sellable product to /sales/new', () => {
    getAllCategories.mockReturnValue([{ isActive: true }]);
    getAllProducts.mockReturnValue([{ isActive: true, availableToSale: true }]);
    expect(resolveUserHomePath(makeUser())).toBe('/sales/new');
  });

  it('requires an ACTIVE category — sellable product with no active category still goes to /sales/products', () => {
    getAllCategories.mockReturnValue([{ isActive: false }]);
    getAllProducts.mockReturnValue([{ isActive: true, availableToSale: true }]);
    expect(resolveUserHomePath(makeUser())).toBe('/sales/products');
  });
});
