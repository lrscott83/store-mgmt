import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product, ProductCategory, UserModel } from '@store-mgmt/domain';
import { ProductRepository } from '../product-repository';
import { ProductCategoryRepository } from '../product-category-repository';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { MissingDataKeyError } from '~/shared/lib/storage/entity-crypto';

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

function seedProducts(storeId: string, products: Product[]): void {
  const entries = products.map((p) => [p.id, p] as [string, Product]);
  localStorage.setItem(`lizoft.store-products-${storeId}`, JSON.stringify(entries));
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

describe('ProductRepository (React mirror of Angular product.repository.ts lookup surface)', () => {
  let repo: ProductRepository;

  beforeEach(() => {
    localStorage.clear();
    repo = new ProductRepository(storeId, new ProductCategoryRepository(storeId));
  });

  // ─── Persistence — Map-entries wire-format, cache, auto-init (inlined, no BaseRepository; product.repository.ts:36-40) ─
  describe('Persistence — Map-entries wire-format, cache, auto-init (product.repository.ts:36-40)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('persists products on-disk as Map-entries ([[id, product], ...]), never a plain array of product objects', () => {
      const products = new Map<string, Product>([
        ['p1', makeProduct('p1', { name: 'Ron' })],
        ['p2', makeProduct('p2', { name: 'Vodka' })],
      ]);
      repo.updateProducts(products);

      const raw = localStorage.getItem(`lizoft.store-products-${storeId}`);
      const parsed = JSON.parse(raw!);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
      expect(parsed.every((entry: unknown) => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string')).toBe(
        true,
      );
    });

    it('auto-writes an empty Map-entries array on the first empty read, without throwing', () => {
      expect(() => repo.getStorageProductsMap()).not.toThrow();
      const raw = localStorage.getItem(`lizoft.store-products-${storeId}`);
      expect(raw).toBe('[]');
    });

    it('reuses the in-memory cache across two reads without an intervening write (localStorage.getItem hit once)', () => {
      seedProducts(storeId, [makeProduct('p1')]);
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');

      repo.getStorageProductsMap();
      repo.getStorageProductsMap();

      const callsForKey = getItemSpy.mock.calls.filter(([key]) => key === `lizoft.store-products-${storeId}`);
      expect(callsForKey).toHaveLength(1);
    });

    it('throws instead of returning an empty map when the stored products cannot be read', () => {
      localStorage.setItem('lizoft.store-products-s1', 'enc:v1:AAAA');
      const freshRepo = new ProductRepository('s1', new ProductCategoryRepository('s1'));
      expect(() => freshRepo.getStorageProductsMap()).toThrow(MissingDataKeyError);
    });

    it('leaves the unreadable bytes byte-for-byte intact', () => {
      const bytes = 'enc:v1:AAAA';
      localStorage.setItem('lizoft.store-products-s1', bytes);
      const freshRepo = new ProductRepository('s1', new ProductCategoryRepository('s1'));
      expect(() => freshRepo.getStorageProductsMap()).toThrow();
      expect(localStorage.getItem('lizoft.store-products-s1')).toBe(bytes);
    });

    it('does NOT revive createdDate/updatedDate to Date instances on a fresh instance re-read (Angular repo revives no dates)', () => {
      seedProducts(storeId, [
        makeProduct('p1', { createdDate: new Date('2024-01-01T00:00:00.000Z') }),
      ]);
      const freshRepo = new ProductRepository(storeId, new ProductCategoryRepository(storeId));
      const product = freshRepo.getProductById('p1');
      expect(typeof product?.createdDate).toBe('string');
      expect(product?.createdDate).not.toBeInstanceOf(Date);
    });
  });

  describe('getProductById — 1:1 port of Angular getProductById (may be undefined)', () => {
    it('returns the product when it exists', () => {
      seedProducts(storeId, [makeProduct('p1', { name: 'Ron' })]);
      expect(repo.getProductById('p1')?.name).toBe('Ron');
    });

    it('returns undefined when the product does not exist', () => {
      seedProducts(storeId, [makeProduct('p1')]);
      expect(repo.getProductById('nope')).toBeUndefined();
    });

    it('returns an inactive product too (no isActive filter — matches Angular)', () => {
      seedProducts(storeId, [makeProduct('p1', { isActive: false })]);
      expect(repo.getProductById('p1')).toBeDefined();
    });
  });

  describe('getAvailableProductById — 1:1 port of Angular getAvailableProductById (active-only)', () => {
    it('returns the product when it exists AND isActive', () => {
      seedProducts(storeId, [makeProduct('p1', { isActive: true })]);
      expect(repo.getAvailableProductById('p1')?.id).toBe('p1');
    });

    it('returns null when the product is inactive', () => {
      seedProducts(storeId, [makeProduct('p1', { isActive: false })]);
      expect(repo.getAvailableProductById('p1')).toBeNull();
    });

    it('returns null when the product does not exist', () => {
      seedProducts(storeId, [makeProduct('p1')]);
      expect(repo.getAvailableProductById('nope')).toBeNull();
    });
  });

  describe('getStorageProductsMap — 1:1 port of Angular getStorageProductsMap', () => {
    it('returns a Map keyed by product id', () => {
      seedProducts(storeId, [makeProduct('p1'), makeProduct('p2')]);
      const map = repo.getStorageProductsMap();
      expect(map.get('p1')?.id).toBe('p1');
      expect(map.get('p2')?.id).toBe('p2');
      expect(map.size).toBe(2);
    });

    it('returns an empty Map when no products are stored', () => {
      expect(repo.getStorageProductsMap().size).toBe(0);
    });
  });

  // ─── 3.1 getAvailableProducts ──────────────────────────────────────────────
  describe('getAvailableProducts — isActive-only, unsorted (product.repository.ts:46-48)', () => {
    it('returns only active products', () => {
      seedProducts(storeId, [
        makeProduct('p1', { isActive: true }),
        makeProduct('p2', { isActive: false }),
      ]);
      expect(repo.getAvailableProducts().map((p) => p.id)).toEqual(['p1']);
    });

    it('returns an empty array when no products are stored', () => {
      expect(repo.getAvailableProducts()).toEqual([]);
    });
  });

  // ─── 3.2 getProductByName / getProductByBarcode / hasAnyProduct ───────────
  describe('getProductByName (product.repository.ts:59-61)', () => {
    it('returns the product when a name match exists', () => {
      seedProducts(storeId, [makeProduct('p1', { name: 'Ron' })]);
      expect(repo.getProductByName('Ron')?.id).toBe('p1');
    });

    it('returns null when no name match exists', () => {
      seedProducts(storeId, [makeProduct('p1', { name: 'Ron' })]);
      expect(repo.getProductByName('Vodka')).toBeNull();
    });
  });

  describe('getProductByBarcode (product.repository.ts:63-66) — empty barcode -> undefined', () => {
    it('returns the product when a barcode match exists', () => {
      seedProducts(storeId, [makeProduct('p1', { barcode: '123' })]);
      expect(repo.getProductByBarcode('123')?.id).toBe('p1');
    });

    it('returns null when the barcode is empty', () => {
      seedProducts(storeId, [makeProduct('p1', { barcode: '123' })]);
      expect(repo.getProductByBarcode('')).toBeNull();
    });

    it('returns null when no barcode match exists', () => {
      seedProducts(storeId, [makeProduct('p1', { barcode: '123' })]);
      expect(repo.getProductByBarcode('999')).toBeNull();
    });
  });

  describe('hasAnyProduct (product.repository.ts:68-70)', () => {
    it('returns false when no products are stored', () => {
      expect(repo.hasAnyProduct()).toBe(false);
    });

    it('returns true when at least one product is stored', () => {
      seedProducts(storeId, [makeProduct('p1')]);
      expect(repo.hasAnyProduct()).toBe(true);
    });
  });

  // ─── 3.3 getProductsByCategoryId / getAvailableToSaleProductsByCategoryId ─
  describe('getProductsByCategoryId — sorted by order (product.repository.ts:72-76)', () => {
    it('returns only products in the given category, regardless of state, sorted by order', () => {
      seedProducts(storeId, [
        makeProduct('p1', { categoryId: 'cat-1', order: 2 }),
        makeProduct('p2', { categoryId: 'cat-1', order: 1, isActive: false }),
        makeProduct('p3', { categoryId: 'cat-2', order: 1 }),
      ]);
      expect(repo.getProductsByCategoryId('cat-1').map((p) => p.id)).toEqual(['p2', 'p1']);
    });
  });

  describe('getAvailableToSaleProductsByCategoryId — isActive && availableToSale, sorted (product.repository.ts:78-82)', () => {
    it('filters by isActive AND availableToSale within the category, sorted by order', () => {
      seedProducts(storeId, [
        makeProduct('p1', { categoryId: 'cat-1', order: 2, isActive: true, availableToSale: true }),
        makeProduct('p2', { categoryId: 'cat-1', order: 1, isActive: true, availableToSale: false }),
        makeProduct('p3', { categoryId: 'cat-1', order: 0, isActive: false, availableToSale: true }),
      ]);
      expect(repo.getAvailableToSaleProductsByCategoryId('cat-1').map((p) => p.id)).toEqual(['p1']);
    });
  });

  // ─── 3.4 hasAnyAvailableToSaleProduct ─────────────────────────────────────
  describe('hasAnyAvailableToSaleProduct — category available AND product isActive&&availableToSale (product.repository.ts:84-86)', () => {
    it('returns false when there is no available category, even with a qualifying product', () => {
      seedCategories(storeId, [makeCategory('cat-1', { isActive: false })]);
      seedProducts(storeId, [makeProduct('p1', { isActive: true, availableToSale: true })]);
      expect(repo.hasAnyAvailableToSaleProduct()).toBe(false);
    });

    it('returns false when there is an available category but no qualifying product', () => {
      seedCategories(storeId, [makeCategory('cat-1', { isActive: true })]);
      seedProducts(storeId, [makeProduct('p1', { isActive: false, availableToSale: true })]);
      expect(repo.hasAnyAvailableToSaleProduct()).toBe(false);
    });

    it('returns true when there is an available category AND a qualifying product', () => {
      seedCategories(storeId, [makeCategory('cat-1', { isActive: true })]);
      seedProducts(storeId, [makeProduct('p1', { isActive: true, availableToSale: true })]);
      expect(repo.hasAnyAvailableToSaleProduct()).toBe(true);
    });
  });

  // ─── 3.5 deleteProduct (soft-delete) ──────────────────────────────────────
  describe('deleteProduct — soft-delete: isActive=false + audit stamps (product.repository.ts:88-98)', () => {
    beforeEach(() => {
      useAuthStore.setState({ user: makeUser({ login: 'jdoe' }), isAuthenticated: true, isLoading: false, error: null });
    });

    it('sets isActive=false and stamps updatedDate/updatedByName, returning true', () => {
      seedProducts(storeId, [makeProduct('p1', { isActive: true })]);
      const result = repo.deleteProduct('p1');
      expect(result).toBe(true);
      const updated = readStoredProducts(storeId).find((p) => p.id === 'p1');
      expect(updated?.isActive).toBe(false);
      expect(updated?.updatedDate).toBeTruthy();
      expect(updated?.updatedByName).toBe('jdoe');
    });

    it('returns false without throwing when the id does not exist', () => {
      expect(repo.deleteProduct('missing')).toBe(false);
    });
  });

  // ─── 3.6 addProductData ───────────────────────────────────────────────────
  describe('addProductData — validations + order-shift (product.repository.ts:100-146)', () => {
    beforeEach(() => {
      useAuthStore.setState({ user: makeUser({ login: 'jdoe' }), isAuthenticated: true, isLoading: false, error: null });
      seedCategories(storeId, [makeCategory('cat-1', { name: 'Bebidas' })]);
    });

    it('fails with ProductCategoryErrors.NotExists when the category does not exist', () => {
      const result = repo.addProductData('p1', 'missing-cat', 'Ron', 10, '', 1, true, true, false);
      expect(result.succeeded).toBe(false);
      expect(result.errors).toEqual([{ code: 'ProductCategory.NotExists', description: 'La categoría no existe.' }]);
    });

    it('fails with ProductErrors.BarcodeExists when the barcode is already used', () => {
      seedProducts(storeId, [makeProduct('existing', { barcode: '123' })]);
      const result = repo.addProductData('p1', 'cat-1', 'Ron', 10, '', 1, true, true, false, '123');
      expect(result.succeeded).toBe(false);
      expect(result.errors).toEqual([
        { code: 'Product.BarcodeExists', description: 'El código de barras ya está asociado a otro producto.' },
      ]);
    });

    it('fails with ProductErrors.NameExists when the name already exists in the same category', () => {
      seedProducts(storeId, [makeProduct('existing', { categoryId: 'cat-1', name: 'Ron' })]);
      const result = repo.addProductData('p1', 'cat-1', 'Ron', 10, '', 1, true, true, false);
      expect(result.succeeded).toBe(false);
      expect(result.errors).toEqual([{ code: 'Product.NameExists', description: 'El nombre del producto ya existe.' }]);
    });

    it('creates the product and shifts siblings order, landing the new product exactly at the requested order', () => {
      seedProducts(storeId, [
        makeProduct('e1', { categoryId: 'cat-1', order: 1 }),
        makeProduct('e2', { categoryId: 'cat-1', order: 2 }),
      ]);
      const result = repo.addProductData('p1', 'cat-1', 'Ron', 10, 'biz-1', 2, true, true, false, '999');
      expect(result.succeeded).toBe(true);
      const byId = new Map(readStoredProducts(storeId).map((p) => [p.id, p]));
      expect(byId.get('e1')?.order).toBe(1);
      expect(byId.get('e2')?.order).toBe(3);
      const created = byId.get('p1');
      expect(created?.order).toBe(2);
      expect(created?.categoryName).toBe('Bebidas');
      expect(created?.createdByName).toBe('jdoe');
    });
  });

  // ─── 3.7 addProduct / addImportedProduct ──────────────────────────────────
  describe('addProduct — delegates to addProductData with a generated id (product.repository.ts:148-171)', () => {
    beforeEach(() => {
      useAuthStore.setState({ user: makeUser({ login: 'jdoe' }), isAuthenticated: true, isLoading: false, error: null });
      seedCategories(storeId, [makeCategory('cat-1', { name: 'Bebidas' })]);
    });

    it('creates a new product with a generated id', () => {
      const result = repo.addProduct('cat-1', 'Ron', 10, 'biz-1', 1, true, true, false);
      expect(result.succeeded).toBe(true);
      const stored = readStoredProducts(storeId);
      expect(stored).toHaveLength(1);
      expect(stored[0].name).toBe('Ron');
      expect(stored[0].id).toBeTruthy();
    });
  });

  describe('addImportedProduct — preserves the imported id (product.repository.ts:173-185)', () => {
    beforeEach(() => {
      useAuthStore.setState({ user: makeUser({ login: 'jdoe' }), isAuthenticated: true, isLoading: false, error: null });
      seedCategories(storeId, [makeCategory('cat-1', { name: 'Bebidas' })]);
    });

    it('creates the product preserving its own id', () => {
      const imported = makeProduct('imported-1', { categoryId: 'cat-1', name: 'Imported' });
      const result = repo.addImportedProduct(imported);
      expect(result.succeeded).toBe(true);
      expect(repo.getProductById('imported-1')?.name).toBe('Imported');
    });
  });

  // ─── 3.8 updateProduct / updateImportedProduct ────────────────────────────
  describe('updateProduct — validations w/ self-exclusion + order-shift (product.repository.ts:193-242)', () => {
    beforeEach(() => {
      useAuthStore.setState({ user: makeUser({ login: 'jdoe' }), isAuthenticated: true, isLoading: false, error: null });
      seedCategories(storeId, [makeCategory('cat-1', { name: 'Bebidas' })]);
    });

    it('fails with ProductCategoryErrors.NotExists when the category does not exist', () => {
      seedProducts(storeId, [makeProduct('p1', { categoryId: 'cat-1' })]);
      const result = repo.updateProduct('p1', 'missing-cat', 'Ron', 10, '', 1, true, true, false);
      expect(result.errors).toEqual([{ code: 'ProductCategory.NotExists', description: 'La categoría no existe.' }]);
    });

    it('fails with ProductErrors.NotExists when the product does not exist', () => {
      const result = repo.updateProduct('missing', 'cat-1', 'Ron', 10, '', 1, true, true, false);
      expect(result.errors).toEqual([{ code: 'Product.NotExists', description: 'El producto no existe.' }]);
    });

    it('succeeds when re-saving a product with its own unchanged barcode (self-exclusion)', () => {
      seedProducts(storeId, [makeProduct('p1', { categoryId: 'cat-1', barcode: '111' })]);
      const result = repo.updateProduct('p1', 'cat-1', 'Ron', 12, '', 1, true, true, false, '111');
      expect(result.succeeded).toBe(true);
    });

    it('fails with ProductErrors.BarcodeExists when the barcode belongs to another product', () => {
      seedProducts(storeId, [
        makeProduct('p1', { categoryId: 'cat-1', barcode: '111' }),
        makeProduct('p2', { categoryId: 'cat-1', barcode: '222' }),
      ]);
      const result = repo.updateProduct('p1', 'cat-1', 'Ron', 12, '', 1, true, true, false, '222');
      expect(result.errors).toEqual([
        { code: 'Product.BarcodeExists', description: 'El código de barras ya está asociado a otro producto.' },
      ]);
    });

    it('fails with ProductErrors.NameExists when another product in the category already has that name (excluding self)', () => {
      seedProducts(storeId, [
        makeProduct('p1', { categoryId: 'cat-1', name: 'Ron' }),
        makeProduct('p2', { categoryId: 'cat-1', name: 'Vodka' }),
      ]);
      const result = repo.updateProduct('p2', 'cat-1', 'Ron', 12, '', 1, true, true, false);
      expect(result.errors).toEqual([{ code: 'Product.NameExists', description: 'El nombre del producto ya existe.' }]);
    });

    it('updates all fields, stamps audit fields, and shifts order landing exactly at the requested order', () => {
      seedProducts(storeId, [
        makeProduct('p1', { categoryId: 'cat-1', name: 'Old', order: 1 }),
        makeProduct('p2', { categoryId: 'cat-1', order: 2 }),
      ]);
      const result = repo.updateProduct('p1', 'cat-1', 'New', 15, 'biz-2', 2, false, false, true, '555');
      expect(result.succeeded).toBe(true);
      const byId = new Map(readStoredProducts(storeId).map((p) => [p.id, p]));
      const updated = byId.get('p1')!;
      expect(updated.name).toBe('New');
      expect(updated.price).toBe(15);
      expect(updated.businessId).toBe('biz-2');
      expect(updated.order).toBe(2);
      expect(updated.isActive).toBe(false);
      expect(updated.availableToSale).toBe(false);
      expect(updated.discountFromInvantory).toBe(true);
      expect(updated.barcode).toBe('555');
      expect(updated.updatedByName).toBe('jdoe');
      expect(updated.updatedDate).toBeTruthy();
      expect(byId.get('p2')?.order).toBe(3);
    });
  });

  describe('updateImportedProduct — delegates to updateProduct by id (product.repository.ts:244-259)', () => {
    beforeEach(() => {
      useAuthStore.setState({ user: makeUser({ login: 'jdoe' }), isAuthenticated: true, isLoading: false, error: null });
      seedCategories(storeId, [makeCategory('cat-1', { name: 'Bebidas' })]);
    });

    it('updates the product using the imported values', () => {
      seedProducts(storeId, [makeProduct('p1', { categoryId: 'cat-1', name: 'Old', order: 1 })]);
      const imported = makeProduct('p1', { categoryId: 'cat-1', name: 'New', order: 1 });
      const result = repo.updateImportedProduct(imported);
      expect(result.succeeded).toBe(true);
      expect(repo.getProductById('p1')?.name).toBe('New');
    });
  });

  // ─── 3.9 setDiscountFromInvantory ──────────────────────────────────────────
  describe('setDiscountFromInvantory — only that flag, no audit stamps (product.repository.ts:261-268)', () => {
    it('sets the flag without touching other fields', () => {
      seedProducts(storeId, [makeProduct('p1', { discountFromInvantory: false, updatedByName: undefined })]);
      const result = repo.setDiscountFromInvantory('p1', true);
      expect(result.succeeded).toBe(true);
      const updated = repo.getProductById('p1');
      expect(updated?.discountFromInvantory).toBe(true);
      expect(updated?.updatedByName).toBeUndefined();
    });

    it('fails with ProductErrors.NotExists when the id does not exist', () => {
      const result = repo.setDiscountFromInvantory('missing', true);
      expect(result.errors).toEqual([{ code: 'Product.NotExists', description: 'El producto no existe.' }]);
    });
  });

  // ─── 3.10 activateProduct / deactivateProduct ─────────────────────────────
  describe('activateProduct / deactivateProduct — toggle ONLY isActive, no audit stamps (product.repository.ts:270-285)', () => {
    it('activateProduct sets isActive=true without touching audit fields', () => {
      seedProducts(storeId, [makeProduct('p1', { isActive: false, updatedDate: undefined, updatedByName: undefined })]);
      const result = repo.activateProduct('p1');
      expect(result.succeeded).toBe(true);
      const updated = repo.getProductById('p1');
      expect(updated?.isActive).toBe(true);
      expect(updated?.updatedDate).toBeUndefined();
      expect(updated?.updatedByName).toBeUndefined();
    });

    it('deactivateProduct sets isActive=false', () => {
      seedProducts(storeId, [makeProduct('p1', { isActive: true })]);
      const result = repo.deactivateProduct('p1');
      expect(result.succeeded).toBe(true);
      expect(repo.getProductById('p1')?.isActive).toBe(false);
    });

    it('fails with ProductErrors.NotExists when the id does not exist', () => {
      const result = repo.activateProduct('missing');
      expect(result.errors).toEqual([{ code: 'Product.NotExists', description: 'El producto no existe.' }]);
    });
  });

  // ─── 3.11 updateProducts / setInitProducts / getProductsJson ──────────────
  describe('updateProducts / setInitProducts / getProductsJson (product.repository.ts:26-34,301-303)', () => {
    it('updateProducts overwrites the whole storage map', () => {
      seedProducts(storeId, [makeProduct('p1')]);
      const newMap = new Map<string, Product>([['p2', makeProduct('p2')]]);
      repo.updateProducts(newMap);
      const stored = repo.getStorageProductsMap();
      expect(stored.has('p1')).toBe(false);
      expect(stored.has('p2')).toBe(true);
    });

    it('setInitProducts only seeds when storage is currently empty', () => {
      const seedMap = new Map<string, Product>([['p1', makeProduct('p1')]]);
      repo.setInitProducts(seedMap);
      expect(repo.getStorageProductsMap().has('p1')).toBe(true);

      const secondSeed = new Map<string, Product>([['p2', makeProduct('p2')]]);
      repo.setInitProducts(secondSeed);
      expect(repo.getStorageProductsMap().has('p2')).toBe(false);
    });

    it('getProductsJson returns the raw JSON string from localStorage', () => {
      seedProducts(storeId, [makeProduct('p1')]);
      expect(repo.getProductsJson()).toBe(localStorage.getItem(`lizoft.store-products-${storeId}`));
    });

    it('getProductsJson returns null when nothing is stored', () => {
      expect(repo.getProductsJson()).toBeNull();
    });
  });

  // ─── 3.12 Exact-Surface Rule ───────────────────────────────────────────────
  describe('Exact-Surface Rule (product.repository.ts has NO upsert/remove)', () => {
    it('does not declare upsert or remove', () => {
      expect((repo as unknown as Record<string, unknown>).upsert).toBeUndefined();
      expect((repo as unknown as Record<string, unknown>).remove).toBeUndefined();
    });
  });

  // ─── ProductRepository depends on ProductCategoryRepository ───────────────
  describe('ProductRepository accepts an explicit ProductCategoryRepository (product.repository.ts:21-24)', () => {
    it('uses the injected category repository for category-exists validation', () => {
      const categoryRepository = new ProductCategoryRepository(storeId);
      seedCategories(storeId, [makeCategory('cat-1', { name: 'Bebidas' })]);
      const injectedRepo = new ProductRepository(storeId, categoryRepository);
      const result = injectedRepo.addProductData('p1', 'cat-1', 'Ron', 10, '', 1, true, true, false);
      expect(result.succeeded).toBe(true);
    });
  });
});
