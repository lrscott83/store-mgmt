import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product, ProductCategory, UserModel, WholesaleConfig } from '@store-mgmt/domain';
import { ProductRepository } from '../product-repository';
import { ProductCategoryRepository } from '../product-category-repository';
import { useAuthStore } from '~/shared/lib/stores/auth-store';

const storeId = 's1';

function makeProduct(id: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    name: `Product ${id}`,
    categoryId: 'cat-1',
    categoryName: 'Cat 1',
    price: 10,
    order: 0,
    availableToSale: true,
    discountFromInvantory: true,
    businessId: '',
    isActive: true,
    createdDate: new Date('2024-01-01T00:00:00.000Z'),
    createdByName: 'test',
    ...overrides,
  };
}

function makeCategory(id: string, overrides: Partial<ProductCategory> = {}): ProductCategory {
  return {
    id,
    name: `Category ${id}`,
    order: 0,
    isActive: true,
    ...overrides,
  };
}

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
    selectedStoreId: storeId,
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
    ...overrides,
  };
}

function seedCategories(storeId: string, categories: ProductCategory[]): void {
  const entries = categories.map((c) => [c.id, c] as [string, ProductCategory]);
  localStorage.setItem(`lizoft.store-product-categories-${storeId}`, JSON.stringify(entries));
}

function readStoredProducts(storeId: string): Product[] {
  const raw = localStorage.getItem(`lizoft.store-products-${storeId}`);
  if (!raw) return [];
  const entries: [string, Product][] = JSON.parse(raw);
  return entries.map(([, p]) => p);
}

const config: WholesaleConfig = {
  packSize: 24,
  tiers: [
    { minPacks: 1, pricePerUnit: 680 },
    { minPacks: 11, pricePerUnit: 660 },
  ],
};

describe('ProductRepository — persistence de la config mayorista', () => {
  let repo: ProductRepository;

  beforeEach(() => {
    localStorage.clear();
    seedCategories(storeId, [makeCategory('cat-1')]);
    useAuthStore.setState({ user: makeUser({ login: 'jdoe' }), isAuthenticated: true, isLoading: false, error: null });
    repo = new ProductRepository(storeId, new ProductCategoryRepository(storeId));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('addProductData persiste la config mayorista pasada como parámetro final', () => {
    const result = repo.addProductData(
      'p1',
      'cat-1',
      'Cerveza',
      700,
      '',
      0,
      true,
      true,
      true,
      undefined,
      config,
    );
    expect(result.succeeded).toBe(true);
    const stored = readStoredProducts(storeId)[0];
    expect(stored.wholesaleEnabled).toBe(true);
    expect(stored.wholesalePackSize).toBe(24);
    expect(stored.wholesaleTiers).toEqual(config.tiers);
  });

  it('addProduct persiste la config mayorista (sin barcode)', () => {
    const result = repo.addProduct('cat-1', 'Ron', 800, '', 0, true, true, true, undefined, config);
    expect(result.succeeded).toBe(true);
    const stored = readStoredProducts(storeId)[0];
    expect(stored.wholesaleEnabled).toBe(true);
    expect(stored.wholesalePackSize).toBe(24);
  });

  it('updateProduct actualiza la config mayorista', () => {
    repo.addProduct('cat-1', 'Cerveza', 700, '', 0, true, true, true);
    const product = readStoredProducts(storeId)[0];
    const result = repo.updateProduct(
      product.id,
      'cat-1',
      'Cerveza',
      700,
      '',
      0,
      true,
      true,
      true,
      undefined,
      undefined,
      undefined,
      config,
    );
    expect(result.succeeded).toBe(true);
    const updated = readStoredProducts(storeId)[0];
    expect(updated.wholesaleEnabled).toBe(true);
    expect(updated.wholesaleTiers?.[1]).toEqual({ minPacks: 11, pricePerUnit: 660 });
  });

  it('updateProduct sin config no borra la config existente', () => {
    repo.addProduct('cat-1', 'Cerveza', 700, '', 0, true, true, true, undefined, config);
    const product = readStoredProducts(storeId)[0];
    repo.updateProduct(product.id, 'cat-1', 'Cerveza', 710, '', 0, true, true, true);
    const updated = readStoredProducts(storeId)[0];
    expect(updated.price).toBe(710);
    expect(updated.wholesaleEnabled).toBe(true);
    expect(updated.wholesaleTiers).toEqual(config.tiers);
  });
});