import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryOfflineService } from '../inventory-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { InventoryErrors, ProductErrors, Result } from '@store-mgmt/domain';
import type { BaseResponseModel, InventoryEntry, OrderItem, Product, ProductCategory, UserModel } from '@store-mgmt/domain';
import { EntityUnreadableError } from '~/shared/lib/storage/read-entity-or-throw';
import { MissingDataKeyError } from '~/shared/lib/storage/entity-crypto';

const storeId = 's1';

// response-envelope-nullability: `data` only narrows to non-null on the succeeded
// branch. These tests only ever exercise the success path, so unwrap once instead of
// repeating an `if (!x.succeeded) throw` guard at every assertion site.
function unwrap<T>(response: BaseResponseModel<T>): T {
  if (!response.succeeded) throw new Error('expected succeeded response');
  return response.data;
}

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

function seedProducts(storeId: string, products: Product[]): void {
  const entries = products.map((p) => [p.id, p] as [string, Product]);
  localStorage.setItem(`lizoft.store-products-${storeId}`, JSON.stringify(entries));
}

function makeCategory(id: string, overrides: Partial<ProductCategory> = {}): ProductCategory {
  return { id, name: `Category ${id}`, order: 0, isActive: true, ...overrides };
}

// Fase 4 (inventory-offline-service-parity, GATE-B): seeds ProductCategoryRepository's storage
// so getInventoryCategoriesView can source categoryName from it (mirrors Angular's
// categoryRepository.getStorageCategoriesMap()), not the removed caller-supplied enrichment array.
function seedCategories(storeId: string, categories: ProductCategory[]): void {
  const entries = categories.map((c) => [c.id, c] as [string, ProductCategory]);
  localStorage.setItem(`lizoft.store-product-categories-${storeId}`, JSON.stringify(entries));
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
    selectedStoreId: 's1',
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
    ...overrides,
  };
}

function makeEntry(id: string, productId: string, overrides: Partial<InventoryEntry> = {}): InventoryEntry {
  return {
    id,
    productId,
    categoryId: 'cat-1',
    quantity: 10,
    available: 10,
    costPrice: 2.5,
    date: new Date('2024-01-15T10:00:00.000Z'),
    order: 0,
    isActive: true,
    createdDate: new Date('2024-01-15T10:00:00.000Z'),
    createdByName: 'test',
    ...overrides,
  };
}

function seedInventory(storeId: string, map: Map<string, InventoryEntry[]>): void {
  const entries = Array.from(map.entries());
  localStorage.setItem(`lizoft.store-inventory-entries-${storeId}`, JSON.stringify(entries));
}

function findRawEntry(storeId: string, entryId: string): (InventoryEntry & Record<string, unknown>) | undefined {
  const raw = localStorage.getItem(`lizoft.store-inventory-entries-${storeId}`);
  if (!raw) return undefined;
  const entries: [string, InventoryEntry[]][] = JSON.parse(raw);
  for (const [, list] of entries) {
    const found = list.find((e) => e.id === entryId);
    if (found) return found as InventoryEntry & Record<string, unknown>;
  }
  return undefined;
}

describe('InventoryOfflineService', () => {
  let service: InventoryOfflineService;

  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: makeUser({ login: 'jdoe' }), isAuthenticated: true, isLoading: false, error: null });
    // Seed the products the guard'd methods reference (Angular's InventoryOfflineService
    // injects ProductRepository; the guards need real product records to exist).
    seedProducts(storeId, [makeProduct('p1'), makeProduct('p2')]);
    service = new InventoryOfflineService(
      storeId,
      new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
    );
  });

  // ─── T-4-1 RED tests ───────────────────────────────────────────────────────

  describe('INV-01: getAvailableInventoryCosts — S-I2 FIFO deduction (multi-entry)', () => {
    // S-I2: entry1={order:0, available:6, costPrice:2.5}, entry2={order:1, available:4, costPrice:3.0}
    // qty=7 → takes 6 from entry1, 1 from entry2
    it('deducts FIFO across two entries for qty=7', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [
        makeEntry('e1', 'p1', { order: 0, available: 6, costPrice: 2.5 }),
        makeEntry('e2', 'p1', { order: 1, available: 4, costPrice: 3.0 }),
      ]);
      seedInventory(storeId, map);

      const costs = service.getAvailableInventoryCosts('p1', 7);

      expect(costs).toHaveLength(2);
      expect(costs[0]).toEqual({ inventoryId: 'e1', costPrice: 2.5, quantity: 6 });
      expect(costs[1]).toEqual({ inventoryId: 'e2', costPrice: 3.0, quantity: 1 });
    });

    it('persists deducted available counts to localStorage', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [
        makeEntry('e1', 'p1', { order: 0, available: 6, costPrice: 2.5 }),
        makeEntry('e2', 'p1', { order: 1, available: 4, costPrice: 3.0 }),
      ]);
      seedInventory(storeId, map);

      service.getAvailableInventoryCosts('p1', 7);

      // Re-read from localStorage to verify persistence
      const service2 = new InventoryOfflineService(
        storeId,
        new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
      );
      const allCosts = service2.getAvailableInventoryCosts('p1', 3); // only 3 left in e2
      expect(allCosts[0].inventoryId).toBe('e2');
      expect(allCosts[0].quantity).toBe(3);
    });

    it('sets entry1.available=0 after deducting all 6 units', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [
        makeEntry('e1', 'p1', { order: 0, available: 6, costPrice: 2.5 }),
        makeEntry('e2', 'p1', { order: 1, available: 4, costPrice: 3.0 }),
      ]);
      seedInventory(storeId, map);

      service.getAvailableInventoryCosts('p1', 7);

      const service2 = new InventoryOfflineService(
        storeId,
        new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
      );
      const costs = service2.getAvailableInventoryCosts('p1', 0);
      // After deduction, e1 has 0 available, e2 has 3 available
      expect(costs).toHaveLength(0);
    });

    it('returns empty array when no entries exist for product', () => {
      const costs = service.getAvailableInventoryCosts('nonexistent', 5);
      expect(costs).toEqual([]);
    });

    it('respects order field for FIFO ordering', () => {
      const map = new Map<string, InventoryEntry[]>();
      // Stored out of order — service must sort by order asc
      map.set('p1', [
        makeEntry('e2', 'p1', { order: 1, available: 4, costPrice: 3.0 }),
        makeEntry('e1', 'p1', { order: 0, available: 6, costPrice: 2.5 }),
      ]);
      seedInventory(storeId, map);

      const costs = service.getAvailableInventoryCosts('p1', 3);

      // Should take from e1 (order=0) first
      expect(costs[0].inventoryId).toBe('e1');
      expect(costs[0].quantity).toBe(3);
    });
  });

  // Angular parity: InventoryOfflineService.getAvailableInventories ->
  // hasAvailableProductToSale gates cost allocation on product eligibility
  // (inventory-offline.service.ts:397-442). L4 map diff-matrix #6 / prioritized-list item #7.
  describe('INV-06: getAvailableInventoryCosts — eligibility gate (Angular parity)', () => {
    it('returns [] and does not deduct when eligibility.product.isActive is false', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { order: 0, available: 6, costPrice: 2.5 })]);
      seedInventory(storeId, map);

      const costs = service.getAvailableInventoryCosts('p1', 3, {
        product: { isActive: false, availableToSale: true, discountFromInvantory: true },
        hasInventoryModule: true,
      });
      expect(costs).toEqual([]);

      // No mutation: a fresh service can still deduct the full original 6 units.
      const service2 = new InventoryOfflineService(
        storeId,
        new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
      );
      const fullCosts = service2.getAvailableInventoryCosts('p1', 6);
      expect(fullCosts).toEqual([{ inventoryId: 'e1', costPrice: 2.5, quantity: 6 }]);
    });

    it('returns [] and does not deduct when eligibility.product.availableToSale is false', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { order: 0, available: 6, costPrice: 2.5 })]);
      seedInventory(storeId, map);

      const costs = service.getAvailableInventoryCosts('p1', 3, {
        product: { isActive: true, availableToSale: false, discountFromInvantory: true },
        hasInventoryModule: true,
      });
      expect(costs).toEqual([]);

      const service2 = new InventoryOfflineService(
        storeId,
        new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
      );
      const fullCosts = service2.getAvailableInventoryCosts('p1', 6);
      expect(fullCosts).toEqual([{ inventoryId: 'e1', costPrice: 2.5, quantity: 6 }]);
    });

    it('returns [] when isActive/availableToSale are eligible but active stock is insufficient (module enabled + discountFromInvantory)', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { order: 0, available: 2, costPrice: 2.5 })]);
      seedInventory(storeId, map);

      const costs = service.getAvailableInventoryCosts('p1', 5, {
        product: { isActive: true, availableToSale: true, discountFromInvantory: true },
        hasInventoryModule: true,
      });
      expect(costs).toEqual([]);
    });

    it('bypasses the stock-sufficiency check (Angular branch 4) when hasInventoryModule is false, computing partial costs from real stock', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { order: 0, available: 2, costPrice: 2.5 })]);
      seedInventory(storeId, map);

      // Requesting 5 but only 2 available: gated (module+discount enabled) this would be [],
      // but with hasInventoryModule=false Angular's bypass branch succeeds unconditionally and
      // the FIFO computation still runs against the real (insufficient) stock.
      const costs = service.getAvailableInventoryCosts('p1', 5, {
        product: { isActive: true, availableToSale: true, discountFromInvantory: true },
        hasInventoryModule: false,
      });
      expect(costs).toEqual([{ inventoryId: 'e1', costPrice: 2.5, quantity: 2 }]);
    });

    it('bypasses the stock-sufficiency check when product.discountFromInvantory is false, even with module enabled', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { order: 0, available: 2, costPrice: 2.5 })]);
      seedInventory(storeId, map);

      const costs = service.getAvailableInventoryCosts('p1', 5, {
        product: { isActive: true, availableToSale: true, discountFromInvantory: false },
        hasInventoryModule: true,
      });
      expect(costs).toEqual([{ inventoryId: 'e1', costPrice: 2.5, quantity: 2 }]);
    });

    it('computes costs normally (unchanged from the no-eligibility-arg path) for a fully eligible product with sufficient stock', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [
        makeEntry('e1', 'p1', { order: 0, available: 6, costPrice: 2.5 }),
        makeEntry('e2', 'p1', { order: 1, available: 4, costPrice: 3.0 }),
      ]);
      seedInventory(storeId, map);

      const costs = service.getAvailableInventoryCosts('p1', 7, {
        product: { isActive: true, availableToSale: true, discountFromInvantory: true },
        hasInventoryModule: true,
      });
      expect(costs).toEqual([
        { inventoryId: 'e1', costPrice: 2.5, quantity: 6 },
        { inventoryId: 'e2', costPrice: 3.0, quantity: 1 },
      ]);
    });
  });

  describe('INV-02: increaseQuantitiesByOrderItems — S-I3 restore', () => {
    it('restores available for each entry referenced in productCosts', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [
        makeEntry('e1', 'p1', { available: 0 }),
        makeEntry('e2', 'p1', { available: 3, order: 1 }),
      ]);
      seedInventory(storeId, map);

      const orderItems: OrderItem[] = [
        {
          productId: 'p1',
          productName: 'Product',
          categoryId: 'cat1',
          categoryName: 'Cat',
          name: 'Product',
          quantity: 7,
          price: 5,
          productBusinessId: 'biz1',
          order: 0,
          productCosts: [
            { inventoryId: 'e1', costPrice: 2.5, quantity: 6 },
            { inventoryId: 'e2', costPrice: 3.0, quantity: 1 },
          ],
        },
      ];

      service.increaseQuantitiesByOrderItems(orderItems);

      // After restore e1 = 0 + 6 = 6 and e2 = 3 + 1 = 4 (total 10).
      // Verify the exact restored amounts via FIFO deduction from a fresh instance.
      const service2 = new InventoryOfflineService(
        storeId,
        new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
      );
      const costs = service2.getAvailableInventoryCosts('p1', 10);
      expect(costs).toHaveLength(2);
      expect(costs[0]).toMatchObject({ inventoryId: 'e1', quantity: 6 });
      expect(costs[1]).toMatchObject({ inventoryId: 'e2', quantity: 4 });
    });

    it('persists restored quantities to localStorage', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { available: 0 })]);
      seedInventory(storeId, map);

      const orderItems: OrderItem[] = [
        {
          productId: 'p1',
          productName: 'Product',
          categoryId: 'cat1',
          categoryName: 'Cat',
          name: 'Product',
          quantity: 5,
          price: 5,
          productBusinessId: 'biz1',
          order: 0,
          productCosts: [{ inventoryId: 'e1', costPrice: 2.5, quantity: 5 }],
        },
      ];

      service.increaseQuantitiesByOrderItems(orderItems);

      // After restore, should be able to deduct 5 again
      const costs = service.getAvailableInventoryCosts('p1', 5);
      expect(costs[0].inventoryId).toBe('e1');
      expect(costs[0].quantity).toBe(5);
    });

    it('does not throw and is a no-op when inventoryId does not match any stored entry', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { available: 0 })]);
      seedInventory(storeId, map);

      const orderItems: OrderItem[] = [
        {
          productId: 'p1',
          productName: 'Product',
          categoryId: 'cat1',
          categoryName: 'Cat',
          name: 'Product',
          quantity: 5,
          price: 5,
          productBusinessId: 'biz1',
          order: 0,
          productCosts: [{ inventoryId: 'unknown-entry', costPrice: 2.5, quantity: 5 }],
        },
      ];

      expect(() => service.increaseQuantitiesByOrderItems(orderItems)).not.toThrow();
    });

    it('skips items with no productCosts', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { available: 5 })]);
      seedInventory(storeId, map);

      const orderItems: OrderItem[] = [
        {
          productId: 'p1',
          productName: 'Product',
          categoryId: 'cat1',
          categoryName: 'Cat',
          name: 'Product',
          quantity: 2,
          price: 5,
          productBusinessId: 'biz1',
          order: 0,
          productCosts: [],
        },
      ];

      // No-op — available stays at 5
      service.increaseQuantitiesByOrderItems(orderItems);
      const costs = service.getAvailableInventoryCosts('p1', 5);
      expect(costs[0].quantity).toBe(5);
    });
  });

  // WU2 (service-return-shape-parity Slice 1, category D) + Fase 4 (inventory-offline-service-parity
  // GATE-A): createInventoryEntry(productId, quantity, costPrice) — renamed from create(), drops
  // the categoryId/date params entirely; both are derived INTERNALLY (Angular parity,
  // createInventoryEntry:60-90) — never caller-supplied.
  describe('INV-03: createInventoryEntry — S-I1 (DataResult<InventoryEntryView>, Angular-exact signature)', () => {
    it('succeeds:true, data.available=data.quantity for a new entry', () => {
      const result = service.createInventoryEntry('p1', 50, 0.8);
      expect(result?.succeeded).toBe(true);
      expect(result?.errors).toEqual([]);
      expect(result?.data?.quantity).toBe(50);
      // Angular parity (createInventoryEntry:94): productName from the fetched product
      expect(result?.data?.productName).toBe('Product p1');
    });

    it('createInventoryEntry is 3-arity — no categoryId/date parameters accepted', () => {
      expect(service.createInventoryEntry.length).toBe(3);
    });

    it('derives categoryId internally from productRepository.getStorageProductsMap() (Angular parity, createInventoryEntry:76) — not caller-supplied', () => {
      seedProducts(storeId, [makeProduct('p1', { categoryId: 'cat-9' }), makeProduct('p2')]);
      service.createInventoryEntry('p1', 50, 0.8);
      const entries = service.getProductInventoriesByProductId('p1');
      expect(entries[0].categoryId).toBe('cat-9');
    });

    it('stamps entry.date and entry.createdDate from a SINGLE internal `new Date()` call (Angular parity, createInventoryEntry:70,80,83) — both equal the same instant', () => {
      service.createInventoryEntry('p1', 10, 1.5);
      const entries = service.getProductInventoriesByProductId('p1');
      expect(entries[0].date).toEqual(entries[0].createdDate);
    });

    it('creates an entry with order=maxOrder+1 (verified via a subsequent read)', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { order: 2 })]);
      seedInventory(storeId, map);

      service.createInventoryEntry('p1', 10, 1.5);
      const entries = service.getProductInventoriesByProductId('p1');
      const created = entries.find((e) => e.id !== 'e1');
      expect(created?.order).toBe(3); // maxOrder=2, so new entry gets 3
    });

    it('creates first entry with order=0 when no entries exist', () => {
      service.createInventoryEntry('p1', 10, 1.5);
      const entries = service.getProductInventoriesByProductId('p1');
      expect(entries[0].order).toBe(0);
    });

    it('persists to localStorage', () => {
      service.createInventoryEntry('p1', 10, 1.5);
      const raw = localStorage.getItem('lizoft.store-inventory-entries-s1');
      expect(raw).not.toBeNull();
    });

    it('sets isActive=true on new entry data', () => {
      const result = service.createInventoryEntry('p1', 10, 1.5);
      expect(result?.data?.isActive).toBe(true);
    });

    // Angular parity (audit-user-threading): create stamps createdByName from the
    // authenticated user's login and MUST NOT touch updatedByName/updatedDate.
    it('stamps createdByName with the authenticated user login (raw entry, not exposed on the view)', () => {
      service.createInventoryEntry('p1', 10, 1.5);
      const entries = service.getProductInventoriesByProductId('p1');
      expect(entries[0].createdByName).toBe('jdoe');
    });

    it('leaves updatedByName/updatedDate undefined on create', () => {
      service.createInventoryEntry('p1', 10, 1.5);
      const entries = service.getProductInventoriesByProductId('p1');
      expect(entries[0].updatedByName).toBeUndefined();
      expect(entries[0].updatedDate).toBeUndefined();
    });

    it('stamps createdByName with "" when no user is authenticated', () => {
      useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false, error: null });
      service.createInventoryEntry('p1', 10, 1.5);
      const entries = service.getProductInventoriesByProductId('p1');
      expect(entries[0].createdByName).toBe('');
    });
  });

  // WU2 (category D): update() now returns DataResult<InventoryEntryView>, guarded by
  // isNotSoldEntry — NEVER throws (Angular's own updateInventoryEntry never throws either).
  describe('INV-04: update — S-I4 (DataResult<InventoryEntryView>, never throws)', () => {
    it('fails with InventoryErrors.SaleExistsWithThisEntry when entry has been partially sold', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 4 })]); // 6 sold
      seedInventory(storeId, map);

      const result = service.update('e1', 'p1', 15, 2.0);
      expect(result.succeeded).toBe(false);
      expect(result.errors).toEqual([InventoryErrors.SaleExistsWithThisEntry]);
      expect(result.data).toBeUndefined();
    });

    it('succeeds when no units sold (quantity === available)', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 10 })]);
      seedInventory(storeId, map);

      const result = service.update('e1', 'p1', 15, 2.0);
      expect(result.succeeded).toBe(true);
      expect(result.errors).toEqual([]);
      // Angular parity (updateInventoryEntry:134): productName from the entry's product
      expect(result.data?.productName).toBe('Product p1');
    });

    it('fails with InventoryErrors.EntryNotExists when entry not found', () => {
      const result = service.update('nonexistent', 'p1', 10, 1.0);
      expect(result.succeeded).toBe(false);
      expect(result.errors).toEqual([InventoryErrors.EntryNotExists]);
    });

    // Angular parity (audit-user-threading): update stamps updatedByName from the
    // authenticated user's login.
    it('stamps updatedByName with the authenticated user login (raw entry, not exposed on the view)', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 10 })]);
      seedInventory(storeId, map);

      service.update('e1', 'p1', 15, 2.0);
      const raw = findRawEntry(storeId, 'e1');
      expect(raw?.updatedByName).toBe('jdoe');
    });
  });

  // WU2 (category D) + Fase 4 (GATE — Angular-exact rename+param order): deleteInventoryEntry
  // (productId, entryId) — renamed from deactivate(entryId, productId), Angular param order
  // restored (Angular parity, inventory-offline.service.ts:179). Guarded by isNotSoldEntry —
  // never throws.
  describe('INV-05: deleteInventoryEntry — S-I5 (Result, never throws, Angular-exact rename+param order)', () => {
    it('fails with InventoryErrors.SaleExistsWithThisEntry when entry has been partially sold', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 4 })]);
      seedInventory(storeId, map);

      const result = service.deleteInventoryEntry('p1', 'e1');
      expect(result).toEqual(Result.Failure([InventoryErrors.SaleExistsWithThisEntry]));
    });

    it('succeeds when no units sold', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 10 })]);
      seedInventory(storeId, map);

      const result = service.deleteInventoryEntry('p1', 'e1');
      expect(result).toEqual(Result.Success());
    });

    it('fails with InventoryErrors.EntryNotExists when entry not found', () => {
      const result = service.deleteInventoryEntry('p1', 'missing');
      expect(result).toEqual(Result.Failure([InventoryErrors.EntryNotExists]));
    });

    it('sets isActive=false after deactivation', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 10 })]);
      seedInventory(storeId, map);

      service.deleteInventoryEntry('p1', 'e1');
      const all = service.getActiveInventoryEntriesStorage();
      const found = all.find((v) => v.id === 'e1');
      // After deactivation, it should not appear in getActiveInventoryEntriesStorage
      // (which returns active entries only)
      expect(found).toBeUndefined();
    });

    // Angular parity (audit-user-threading): deactivate stamps updatedByName from the
    // authenticated user's login.
    it('stamps updatedByName with the authenticated user login', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 10 })]);
      seedInventory(storeId, map);

      service.deleteInventoryEntry('p1', 'e1');
      expect(findRawEntry(storeId, 'e1')?.updatedByName).toBe('jdoe');
    });

    it('enforces the new (productId, entryId) order — the OLD swapped order does not resolve the entry', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 10 })]);
      seedInventory(storeId, map);

      // Old React arg order was (entryId, productId) — calling with 'e1' as productId and
      // 'p1' as entryId must NOT deactivate the real entry (proves the rename enforces the
      // new order, not just a bigger rename). 'e1' is not a product id -> guard fails first.
      const result = service.deleteInventoryEntry('e1', 'p1');
      expect(result).toEqual(Result.Failure([ProductErrors.NotExists]));

      const all = service.getActiveInventoryEntriesStorage();
      expect(all.find((v) => v.id === 'e1')).toBeDefined();
    });
  });

  describe('INV-08: getAvailableQuantity — distinguishes "no active entries" from "insufficient quantity" (Angular InventoryOfflineService.hasAvailableProductToSale branches 5 vs 6)', () => {
    it('returns hasEntries=false and available=0 when no entries exist for the product', () => {
      expect(service.getAvailableQuantity('p1')).toEqual({ hasEntries: false, available: 0 });
    });

    // Angular: hasAvailableProductToSale (inventory-offline.service.ts:410-419) checks
    // `inventories.length === 0` against the RAW entry list (before any isActive filter),
    // and only filters isActive when summing the quantity. So a product whose only entries
    // are all inactive still has hasEntries=true (raw list is non-empty) — it falls through
    // to the quantity check (0 available) and fails with ProductQuantityNotAvailable, NOT
    // the "no entries" ProductNotAvailable branch.
    it('returns hasEntries=true (raw entries exist) and available=0 when entries exist but none are active', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { available: 10, isActive: false })]);
      seedInventory(storeId, map);

      expect(service.getAvailableQuantity('p1')).toEqual({ hasEntries: true, available: 0 });
    });

    it('returns hasEntries=true and the summed available quantity across active entries', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [
        makeEntry('e1', 'p1', { available: 6 }),
        makeEntry('e2', 'p1', { available: 4, order: 1 }),
      ]);
      seedInventory(storeId, map);

      expect(service.getAvailableQuantity('p1')).toEqual({ hasEntries: true, available: 10 });
    });

    it('ignores inactive entries when summing available quantity', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [
        makeEntry('e1', 'p1', { available: 6 }),
        makeEntry('e2', 'p1', { available: 4, order: 1, isActive: false }),
      ]);
      seedInventory(storeId, map);

      expect(service.getAvailableQuantity('p1')).toEqual({ hasEntries: true, available: 6 });
    });
  });

  describe('INV-07: getActiveInventoryEntriesStorage returns InventoryEntryView[] for active entries', () => {
    it('returns empty array when no entries', () => {
      expect(service.getActiveInventoryEntriesStorage()).toEqual([]);
    });

    it('returns only active entries', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [
        makeEntry('e1', 'p1', { isActive: true }),
        makeEntry('e2', 'p1', { isActive: false }),
      ]);
      seedInventory(storeId, map);

      const all = service.getActiveInventoryEntriesStorage();
      expect(all.every((v) => v.id !== 'e2')).toBe(true);
    });
  });

  // WU3 (category B) + Fase 4 (GATE-B — Angular-exact rename+zero-arg+category-repo sourcing):
  // getInventoryCategoriesView() — renamed from getAvailableByCategory, the `products` param is
  // REMOVED entirely. Category names are sourced via ProductCategoryRepository
  // (productRepository.getCategoryRepository().getStorageCategoriesMap()), mirroring Angular's
  // categoryRepository.getStorageCategoriesMap() (inventory-offline.service.ts:286-349) — NOT
  // the caller-supplied enrichment array.
  describe('INV-09: getInventoryCategoriesView — weighted-average cost + category totals (Angular parity: getInventoryCategoriesView/getAverageCostPrice/getTotalCostPrice, inventory-offline.service.ts:286-349)', () => {
    it('returns a BaseResponseModel envelope: succeeded:true, message:"", actionCode:200, errors:[]', () => {
      const result = service.getInventoryCategoriesView();
      expect(result.succeeded).toBe(true);
      expect(result.message).toBe('');
      expect(result.actionCode).toBe(200);
      expect(result.errors).toEqual([]);
    });

    it('computes weighted-average cost price per product: Σ(available·costPrice)/Σavailable, sourcing categoryName from ProductCategoryRepository (zero-arg, no products array)', () => {
      seedCategories(storeId, [makeCategory('cat-1', { name: 'Bebidas' })]);
      seedProducts(storeId, [makeProduct('p1', { categoryId: 'cat-1' }), makeProduct('p2')]);
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [
        makeEntry('e1', 'p1', { categoryId: 'cat-1', available: 10, costPrice: 2 }),
        makeEntry('e2', 'p1', { categoryId: 'cat-1', available: 10, costPrice: 4 }),
      ]);
      seedInventory(storeId, map);

      const categories = unwrap(service.getInventoryCategoriesView());

      expect(categories[0].categoryName).toBe('Bebidas');
      // (10*2 + 10*4) / 20 = 3
      expect(categories[0].products[0].avgCostPrice).toBe(3);
      expect(categories[0].products[0].totalAvailable).toBe(20);
    });

    it('weights by available quantity, not the original received quantity', () => {
      seedCategories(storeId, [makeCategory('cat-1', { name: 'Bebidas' })]);
      seedProducts(storeId, [makeProduct('p1', { categoryId: 'cat-1' }), makeProduct('p2')]);
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [
        // received 10 @ $2 but 8 already sold -> only 2 left available
        makeEntry('e1', 'p1', { categoryId: 'cat-1', quantity: 10, available: 2, costPrice: 2 }),
        makeEntry('e2', 'p1', { categoryId: 'cat-1', quantity: 10, available: 8, costPrice: 5 }),
      ]);
      seedInventory(storeId, map);

      const categories = unwrap(service.getInventoryCategoriesView());

      // (2*2 + 8*5) / 10 = 4.4
      expect(categories[0].products[0].avgCostPrice).toBeCloseTo(4.4, 5);
    });

    it('computes category totalQuantity as the sum of each product totalAvailable', () => {
      seedCategories(storeId, [makeCategory('cat-1', { name: 'Bebidas' })]);
      seedProducts(storeId, [
        makeProduct('p1', { categoryId: 'cat-1' }),
        makeProduct('p2', { categoryId: 'cat-1' }),
      ]);
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { categoryId: 'cat-1', available: 10, costPrice: 2 })]);
      map.set('p2', [makeEntry('e2', 'p2', { categoryId: 'cat-1', available: 5, costPrice: 3 })]);
      seedInventory(storeId, map);

      const categories = unwrap(service.getInventoryCategoriesView());

      expect(categories).toHaveLength(1);
      expect(categories[0].totalQuantity).toBe(15);
    });

    it('computes category totalCostPrice as Σ(product.avgCostPrice·product.totalAvailable) — matches Σ(entry.available·costPrice) for the category', () => {
      seedCategories(storeId, [makeCategory('cat-1', { name: 'Bebidas' })]);
      seedProducts(storeId, [
        makeProduct('p1', { categoryId: 'cat-1' }),
        makeProduct('p2', { categoryId: 'cat-1' }),
      ]);
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { categoryId: 'cat-1', available: 10, costPrice: 2 })]); // value = 20
      map.set('p2', [makeEntry('e2', 'p2', { categoryId: 'cat-1', available: 5, costPrice: 3 })]); // value = 15
      seedInventory(storeId, map);

      const categories = unwrap(service.getInventoryCategoriesView());

      expect(categories[0].totalCostPrice).toBe(35);
    });

    it('keeps separate category totals for products in different categories', () => {
      seedCategories(storeId, [
        makeCategory('cat-1', { name: 'Bebidas' }),
        makeCategory('cat-2', { name: 'Snacks' }),
      ]);
      seedProducts(storeId, [
        makeProduct('p1', { categoryId: 'cat-1' }),
        makeProduct('p2', { categoryId: 'cat-2' }),
      ]);
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { categoryId: 'cat-1', available: 10, costPrice: 2 })]);
      map.set('p2', [makeEntry('e2', 'p2', { categoryId: 'cat-2', available: 5, costPrice: 10 })]);
      seedInventory(storeId, map);

      const categories = unwrap(service.getInventoryCategoriesView());

      const bebidas = categories.find((c) => c.categoryId === 'cat-1');
      const snacks = categories.find((c) => c.categoryId === 'cat-2');
      expect(bebidas?.totalCostPrice).toBe(20);
      expect(snacks?.totalCostPrice).toBe(50);
    });

    it('does not divide by zero / produce NaN for fully-depleted products (documented divergence — Angular has a NaN bug here, not replicated)', () => {
      seedCategories(storeId, [makeCategory('cat-1', { name: 'Bebidas' })]);
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { categoryId: 'cat-1', quantity: 10, available: 0, costPrice: 2 })]);
      seedInventory(storeId, map);

      const categories = unwrap(service.getInventoryCategoriesView());

      // Fully-depleted product is excluded entirely — pre-existing divergence, not this gap's concern.
      expect(categories).toHaveLength(0);
    });

    // Gate #1052 (stale-data, user-ratified): mirror Angular's UNGUARDED category-name read —
    // a categoryId with NO matching category in ProductCategoryRepository throws, matching
    // Angular's `storageCategoriesMap.get(item.categoryId).name` (inventory-offline.service.ts:308)
    // literally. No defensive `''` guard is added.
    it('throws when an active entry has a categoryId with no matching category (Angular-exact unguarded read, gate #1052)', () => {
      // No categories seeded — 'cat-missing' will not resolve in ProductCategoryRepository.
      seedProducts(storeId, [makeProduct('p1', { categoryId: 'cat-missing' })]);
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { categoryId: 'cat-missing', available: 10, costPrice: 2 })]);
      seedInventory(storeId, map);

      expect(() => service.getInventoryCategoriesView()).toThrow();
    });

    it('no method named getAvailableByCategory remains on the service (Angular-exact rename)', () => {
      expect((service as unknown as { getAvailableByCategory?: unknown }).getAvailableByCategory).toBeUndefined();
    });
  });

  // T7/T8 (Fase 4, rule-12 minimal accessor): ProductRepository.getCategoryRepository() surfaces
  // the ProductCategoryRepository it already wraps — used by getInventoryCategoriesView (GATE-B)
  // to source category names, mirroring Angular's categoryRepository DI without adding a new
  // top-level dependency to InventoryOfflineService.
  describe('ProductRepository.getCategoryRepository() — accessor (Fase 4, minimal DI surfacing)', () => {
    it('returns the SAME ProductCategoryRepository instance passed into the constructor (identity, not a new instance)', () => {
      const catRepo = new ProductCategoryRepository(storeId);
      const prodRepo = new ProductRepository(storeId, catRepo);
      expect(prodRepo.getCategoryRepository()).toBe(catRepo);
    });
  });

  // Angular parity: InventoryOfflineService.getProductInventoriesByProductId
  // (inventory-offline.service.ts:54-56) — returns the RAW entry list for a product
  // (no isActive filter, unlike getAvailableQuantity). Consumed by Stage 7's
  // InventoryTodaySaleService for the col-9 Costo Unitario quantity-weighted average
  // (design ADR-2 — must NOT reuse getAvailableByCategory's available-weighted avgCostPrice,
  // and must NEVER call getAvailableInventoryCosts since it mutates/deducts stock via FIFO).
  describe('INV-10: getProductInventoriesByProductId — raw entries for a product (Stage 7 ADR-2)', () => {
    it('returns all entries for the product, including inactive ones', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [
        makeEntry('e1', 'p1', { isActive: true }),
        makeEntry('e2', 'p1', { isActive: false }),
      ]);
      seedInventory(storeId, map);

      const entries = service.getProductInventoriesByProductId('p1');
      expect(entries.map((e) => e.id).sort()).toEqual(['e1', 'e2']);
    });

    it('returns entries with the raw `available` field intact (not the InventoryEntryView projection)', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 4, costPrice: 3 })]);
      seedInventory(storeId, map);

      const entries = service.getProductInventoriesByProductId('p1');
      expect(entries[0]).toMatchObject({ quantity: 10, available: 4, costPrice: 3 });
    });

    it('returns an empty array when the product has no entries', () => {
      expect(service.getProductInventoriesByProductId('nonexistent')).toEqual([]);
    });

    it('does not mutate `available` on the returned entries (read-only, unlike getAvailableInventoryCosts)', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { available: 7 })]);
      seedInventory(storeId, map);

      service.getProductInventoriesByProductId('p1');

      const reread = service.getProductInventoriesByProductId('p1');
      expect(reread[0].available).toBe(7);
    });
  });

  // WU3 (category B) + Fase 4 (GATE-C — Angular-exact rename+ignore-date body):
  // getInventoryEntriesInDay(date) — renamed from getByDate; the `date` PARAM IS IGNORED — the
  // method ALWAYS returns TODAY's active entries (Angular parity, inventory-offline.service.ts:
  // 252-258). Returns SYNC BaseResponseModel<T> (never Promise, never Result/DataResult).
  describe('INV-08: getInventoryEntriesInDay ignores its date param — always returns today (BaseResponseModel<T>)', () => {
    it('returns a BaseResponseModel envelope: succeeded:true, message:"", actionCode:200, errors:[]', () => {
      const result = service.getInventoryEntriesInDay(new Date());
      expect(result.succeeded).toBe(true);
      expect(result.message).toBe('');
      expect(result.actionCode).toBe(200);
      expect(result.errors).toEqual([]);
    });

    it('IGNORES a NON-today date argument — always returns only today-dated active entries', () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const today = new Date();
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [
        makeEntry('e-yesterday', 'p1', { date: yesterday }),
        makeEntry('e-today', 'p1', { date: today }),
      ]);
      seedInventory(storeId, map);

      // Passing yesterday's date must NOT change the result — the date arg is ignored.
      const results = unwrap(service.getInventoryEntriesInDay(yesterday));
      expect(results.map((e) => e.id)).toEqual(['e-today']);
    });

    it('returns empty .data when no entries exist today, even when a non-today date argument is passed', () => {
      const date = new Date('2024-03-10T10:00:00.000Z');
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { date })]);
      seedInventory(storeId, map);

      const results = service.getInventoryEntriesInDay(date).data;
      expect(results).toHaveLength(0);
    });

    it('no method named getByDate remains on the service (Angular-exact rename)', () => {
      expect((service as unknown as { getByDate?: unknown }).getByDate).toBeUndefined();
    });
  });

  // WU5: getInventoryCostTotalBefore/Total/Yesterday
  describe('getInventoryCostTotalBefore/Total/Yesterday', () => {
    it('sums available*costPrice for active entries strictly before threshold date', () => {
      const threshold = new Date('2024-03-01T00:00:00.000');
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [
        makeEntry('e1', 'p1', { available: 10, costPrice: 2, date: new Date('2024-02-01T10:00:00.000') }), // 20
        makeEntry('e2', 'p1', { available: 5, costPrice: 3, date: new Date('2024-02-15T10:00:00.000') }), // 15
      ]);
      map.set('p2', [
        makeEntry('e3', 'p2', { available: 100, costPrice: 1, date: new Date('2024-03-15T10:00:00.000') }), // after threshold
      ]);
      seedInventory(storeId, map);
      expect(service.getInventoryCostTotalBefore(threshold)).toBe(35);
    });

    it('excludes inactive entries', () => {
      const threshold = new Date('2024-03-01T00:00:00.000');
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [
        makeEntry('e1', 'p1', { available: 10, costPrice: 2, date: new Date('2024-02-01T10:00:00.000'), isActive: false }),
        makeEntry('e2', 'p1', { available: 5, costPrice: 3, date: new Date('2024-02-15T10:00:00.000') }),
      ]);
      seedInventory(storeId, map);
      expect(service.getInventoryCostTotalBefore(threshold)).toBe(15);
    });

    it('getInventoryCostTotal sums all active entries up through end of today', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [
        makeEntry('e1', 'p1', { available: 4, costPrice: 5, date: new Date(Date.now() - 60 * 60 * 1000) }), // 20, "today"
        makeEntry('e2', 'p1', { available: 2, costPrice: 3, date: new Date('2024-01-01T10:00:00.000') }), // 6
      ]);
      seedInventory(storeId, map);
      expect(service.getInventoryCostTotal()).toBe(26);
    });

    it('getInventoryCostTotalYesterday sums only entries strictly before today start', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [
        makeEntry('e1', 'p1', { available: 2, costPrice: 3, date: new Date('2024-01-01T10:00:00.000') }), // 6
        makeEntry('e2', 'p1', { available: 4, costPrice: 5, date: new Date(Date.now() - 60 * 60 * 1000) }), // today, excluded
      ]);
      seedInventory(storeId, map);
      expect(service.getInventoryCostTotalYesterday()).toBe(6);
    });
  });

  // WU4 (category C): filterInventoryEntries now returns
  // Promise<BaseResponseModel<InventoryEntryView[]>> (was a bare sync array), same-tick
  // resolved — never rejects.
  describe('filterInventoryEntries (Promise<BaseResponseModel<T>>, WU4)', () => {
    it('resolves a BaseResponseModel envelope: succeeded:true, message:"", actionCode:200, errors:[]', async () => {
      await expect(service.filterInventoryEntries()).resolves.toEqual(
        expect.objectContaining({ succeeded: true, message: '', actionCode: 200, errors: [] }),
      );
    });

    it('filters by productId when provided', async () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1')]);
      map.set('p2', [makeEntry('e2', 'p2')]);
      seedInventory(storeId, map);
      const result = await service.filterInventoryEntries('p1');
      const data = unwrap(result);
      expect(data).toHaveLength(1);
      expect(data[0].productId).toBe('p1');
    });

    it('filters by date range when start/end provided', async () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [
        makeEntry('e1', 'p1', { date: new Date('2024-01-01T10:00:00.000') }),
        makeEntry('e2', 'p1', { date: new Date('2024-06-01T10:00:00.000') }),
      ]);
      seedInventory(storeId, map);
      const result = await service.filterInventoryEntries(
        undefined,
        new Date('2024-05-01T00:00:00.000'),
        new Date('2024-07-01T00:00:00.000'),
      );
      const data = unwrap(result);
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe('e2');
    });

    it('excludes inactive entries regardless of filters', async () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { isActive: false })]);
      seedInventory(storeId, map);
      const result = await service.filterInventoryEntries();
      expect(result.data).toHaveLength(0);
    });

    it('returns all active entries when no filters provided', async () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1'), makeEntry('e2', 'p1', { order: 1 })]);
      seedInventory(storeId, map);
      const result = await service.filterInventoryEntries();
      expect(result.data).toHaveLength(2);
    });
  });

  // WU4 (category C): getInventoryEntriesView now returns
  // Promise<BaseResponseModel<InventoryEntriesView[]>> (was a bare sync array), same-tick
  // resolved — never rejects.
  describe('getInventoryEntriesView (Promise<BaseResponseModel<T>>, WU4)', () => {
    it('resolves a BaseResponseModel envelope: succeeded:true, message:"", actionCode:200, errors:[]', async () => {
      await expect(service.getInventoryEntriesView()).resolves.toEqual(
        expect.objectContaining({ succeeded: true, message: '', actionCode: 200, errors: [] }),
      );
    });

    it('returns per-product FIFO breakdown sorted by order asc, emitting `inventoryId` (Angular parity)', async () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [
        makeEntry('e2', 'p1', { order: 1, available: 4, costPrice: 3.0 }),
        makeEntry('e1', 'p1', { order: 0, available: 6, costPrice: 2.5 }),
      ]);
      seedInventory(storeId, map);

      const result = await service.getInventoryEntriesView();
      const views = unwrap(result);
      expect(views).toHaveLength(1);
      expect(views[0].productId).toBe('p1');
      expect(views[0].productAvailable).toBe(10);
      expect(views[0].availableEntries).toEqual([
        { inventoryId: 'e1', costPrice: 2.5, quantity: 6 },
        { inventoryId: 'e2', costPrice: 3.0, quantity: 4 },
      ]);
    });

    it('excludes entries with available=0 and inactive entries', async () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [
        makeEntry('e1', 'p1', { available: 0 }),
        makeEntry('e2', 'p1', { available: 5, isActive: false, order: 1 }),
        makeEntry('e3', 'p1', { available: 3, order: 2 }),
      ]);
      seedInventory(storeId, map);

      const result = await service.getInventoryEntriesView();
      const views = unwrap(result);
      expect(views[0].availableEntries).toEqual([{ inventoryId: 'e3', costPrice: 2.5, quantity: 3 }]);
      expect(views[0].productAvailable).toBe(3);
    });

    it('returns one view per product', async () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { available: 5 })]);
      map.set('p2', [makeEntry('e2', 'p2', { available: 8 })]);
      seedInventory(storeId, map);

      const result = await service.getInventoryEntriesView();
      const views = unwrap(result);
      expect(views).toHaveLength(2);
      expect(views.map((v) => v.productId).sort()).toEqual(['p1', 'p2']);
    });

    it('resolves an empty .data array when no entries exist (never rejects)', async () => {
      await expect(service.getInventoryEntriesView()).resolves.toEqual(
        expect.objectContaining({ data: [] }),
      );
    });
  });

  // WU2 (category D): amortizeSoldEntry() now returns Result — never throws.
  describe('amortizeSoldEntry — Result, never throws', () => {
    it('zeroes available and reduces quantity by the amortized (previously-available) amount, returning Result.Success()', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 3 })]); // 7 sold
      seedInventory(storeId, map);

      const result = service.amortizeSoldEntry('p1', 'e1');
      expect(result).toEqual(Result.Success());

      const found = findRawEntry(storeId, 'e1');
      expect(found?.available).toBe(0);
      expect(found?.quantity).toBe(7); // 10 - 3
    });

    it('returns Result.Failure([InventoryErrors.EntryNotExists]) when entry is missing', () => {
      const result = service.amortizeSoldEntry('p1', 'missing');
      expect(result).toEqual(Result.Failure([InventoryErrors.EntryNotExists]));
    });

    it('returns Result.Failure([InventoryErrors.SaleNotExistsWithThisEntry]) when nothing has been sold (quantity === available)', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 10 })]);
      seedInventory(storeId, map);

      const result = service.amortizeSoldEntry('p1', 'e1');
      expect(result).toEqual(Result.Failure([InventoryErrors.SaleNotExistsWithThisEntry]));
    });
  });

  // WU5: updateAvailableInventories — BUG FIX (ADR-7): correct FIFO decrement
  describe('updateAvailableInventories (bug fix: correct FIFO decrement)', () => {
    it('correctly decrements across two entries — hand-derived (Angular would over-consume entry2)', () => {
      // entries available=[5,10], quantity=8.
      // Correct: consume min(8,5)=5 from e1 (available->0, remaining->3);
      //          consume min(3,10)=3 from e2 (available->7, remaining->0).
      // Angular's bug: after zeroing e1.available, it computes `total -= i.available`
      // (already 0), so total stays 8, over-consuming e2 down to 10-8=2 instead of 7.
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [
        makeEntry('e1', 'p1', { order: 0, available: 5, costPrice: 2 }),
        makeEntry('e2', 'p1', { order: 1, available: 10, costPrice: 3 }),
      ]);
      seedInventory(storeId, map);

      const result = service.updateAvailableInventories('p1', 8);

      expect(result).toBe(true);
      expect(findRawEntry(storeId, 'e1')?.available).toBe(0);
      expect(findRawEntry(storeId, 'e2')?.available).toBe(7); // NOT 2 (the buggy Angular value)
    });

    it('returns false when no active entries with available>0 exist', () => {
      expect(service.updateAvailableInventories('p1', 5)).toBe(false);
    });

    it('respects order field for FIFO consumption', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [
        makeEntry('e2', 'p1', { order: 1, available: 4, costPrice: 3.0 }),
        makeEntry('e1', 'p1', { order: 0, available: 6, costPrice: 2.5 }),
      ]);
      seedInventory(storeId, map);

      service.updateAvailableInventories('p1', 3);

      expect(findRawEntry(storeId, 'e1')?.available).toBe(3); // consumed first
      expect(findRawEntry(storeId, 'e2')?.available).toBe(4); // untouched
    });

    it('excludes inactive entries from consumption', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { available: 5, isActive: false })]);
      seedInventory(storeId, map);

      expect(service.updateAvailableInventories('p1', 3)).toBe(false);
    });
  });

  // WU2 (category D) + BUG FIX (ADR-7): updateInventoryEntry() now returns
  // DataResult<InventoryEntryView> guarded by isNotSoldEntry — never throws. Cross-product
  // old/new-list mix-up bug fix is preserved.
  describe('updateInventoryEntry (DataResult, never throws; bug fix: cross-product reassignment)', () => {
    it('moves the entry from oldProductId bucket to newProductId bucket, leaving other entries untouched', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [
        makeEntry('e1', 'p1', { quantity: 10, available: 10, costPrice: 2 }),
        makeEntry('e-other', 'p1', { quantity: 5, available: 5, order: 1 }),
      ]);
      map.set('p2', [makeEntry('e-existing', 'p2', { quantity: 3, available: 3 })]);
      seedInventory(storeId, map);

      const result = service.updateInventoryEntry('p1', 'e1', 'p2', 20, 4);

      expect(result.succeeded).toBe(true);
      expect(result.data?.productId).toBe('p2');
      expect(result.data?.quantity).toBe(20);
      expect(result.data?.costPrice).toBe(4);
      // Angular parity (updateInventoryEntry:134): productName from getProductById(oldProductId)
      expect(result.data?.productName).toBe('Product p1');

      // p1 bucket keeps only the untouched entry
      const p1Raw = findRawEntry(storeId, 'e-other');
      expect(p1Raw).toBeDefined();
      expect(findRawEntry(storeId, 'e1')?.productId).toBe('p2'); // moved, not destroyed

      // p2 bucket has both the pre-existing entry AND the moved one
      expect(findRawEntry(storeId, 'e-existing')).toBeDefined();
    });

    it('same-product update (oldProductId === newProductId) updates in place without touching other products', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 10 })]);
      map.set('p2', [makeEntry('e2', 'p2', { quantity: 5, available: 5 })]);
      seedInventory(storeId, map);

      const result = service.updateInventoryEntry('p1', 'e1', 'p1', 15, 3);
      expect(result.data?.quantity).toBe(15);
      expect(findRawEntry(storeId, 'e2')?.quantity).toBe(5); // p2 untouched
    });

    it('fails with InventoryErrors.SaleExistsWithThisEntry when the entry has been partially sold', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 4 })]);
      seedInventory(storeId, map);

      const result = service.updateInventoryEntry('p1', 'e1', 'p2', 5, 1);
      expect(result.succeeded).toBe(false);
      expect(result.errors).toEqual([InventoryErrors.SaleExistsWithThisEntry]);
    });

    it('fails with InventoryErrors.EntryNotExists when entry not found in oldProductId bucket', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 10 })]);
      seedInventory(storeId, map);

      const result = service.updateInventoryEntry('p1', 'nonexistent', 'p2', 5, 1);
      expect(result.succeeded).toBe(false);
      expect(result.errors).toEqual([InventoryErrors.EntryNotExists]);
    });

    it('stamps updatedByName with the authenticated user login', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 10 })]);
      seedInventory(storeId, map);

      service.updateInventoryEntry('p1', 'e1', 'p2', 5, 1);
      expect(findRawEntry(storeId, 'e1')?.updatedByName).toBe('jdoe');
    });
  });

  // WU2 (category D, NEW method): isNotSoldEntry — 1:1 port of Angular's
  // InventoryOfflineService.isNotSoldEntry (inventory-offline.service.ts:162-177), used as the
  // shared guard for update/updateInventoryEntry/deactivate. DI-gap note: Angular's version
  // also checks `!productRepository.getProductById(productId)` -> Result.Failure([ProductErrors
  // .NotExists]) first; React's InventoryOfflineService has no product repository (same
  // pre-existing DI gap as getInventoryCategoriesView/getInventoryEntriesInDay — design
  // ambiguity #2), so that branch is intentionally NOT reachable here — only entry-existence
  // and sold-status are checked. Flagged as a deviation for verify.
  describe('isNotSoldEntry — Result guard (NEW method)', () => {
    it('returns Result.Failure([InventoryErrors.EntryNotExists]) when the entry does not exist for productId', () => {
      const result = service.isNotSoldEntry('p1', 'missing');
      expect(result).toEqual(Result.Failure([InventoryErrors.EntryNotExists]));
    });

    it('returns Result.Failure([InventoryErrors.SaleExistsWithThisEntry]) when quantity !== available', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 4 })]);
      seedInventory(storeId, map);

      const result = service.isNotSoldEntry('p1', 'e1');
      expect(result).toEqual(Result.Failure([InventoryErrors.SaleExistsWithThisEntry]));
    });

    it('returns Result.Success() when quantity === available', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 10 })]);
      seedInventory(storeId, map);

      const result = service.isNotSoldEntry('p1', 'e1');
      expect(result).toEqual(Result.Success());
    });
  });

  // WU2 (category D): increaseQuantitiesByOrderItems now returns Result (was void) — always
  // Result.Success() per Angular (no failure branch exists in Angular's version either).
  describe('increaseQuantitiesByOrderItems — Result return (WU2)', () => {
    it('always returns Result.Success()', () => {
      const orderItems: OrderItem[] = [
        {
          productId: 'p1',
          productName: 'Product',
          categoryId: 'cat1',
          categoryName: 'Cat',
          name: 'Product',
          quantity: 1,
          price: 5,
          productBusinessId: 'biz1',
          order: 0,
          productCosts: [],
        },
      ];
      const result = service.increaseQuantitiesByOrderItems(orderItems);
      expect(result).toEqual(Result.Success());
    });
  });

  // WU2 (category D, NEW methods): addImportedEntries/updateImportedEntries — 1:1 port of
  // Angular's InventoryOfflineService.addImportedEntries/updateImportedEntries
  // (inventory-offline.service.ts:498-524), both always Result.Success().
  describe('addImportedEntries / updateImportedEntries — NEW methods (WU2)', () => {
    it('addImportedEntries replaces the productId bucket wholesale and returns Result.Success()', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e-old', 'p1')]);
      seedInventory(storeId, map);

      const incoming = [makeEntry('e-new', 'p1', { available: 3 })];
      const result = service.addImportedEntries('p1', incoming);

      expect(result).toEqual(Result.Success());
      const stored = service.getProductInventoriesByProductId('p1');
      expect(stored.map((e) => e.id)).toEqual(['e-new']);
    });

    it('updateImportedEntries merges matching entries (available/isActive/updatedDate/updatedByName) and appends unmatched ones, returning Result.Success()', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { available: 5, isActive: true })]);
      seedInventory(storeId, map);

      const updatedDate = new Date('2024-05-01T00:00:00.000Z');
      const incoming: InventoryEntry[] = [
        { ...makeEntry('e1', 'p1', { available: 2, isActive: false }), updatedDate, updatedByName: 'importer' },
        makeEntry('e2', 'p1', { available: 9 }),
      ];
      const result = service.updateImportedEntries('p1', incoming);

      expect(result).toEqual(Result.Success());
      const stored = service.getProductInventoriesByProductId('p1');
      const e1 = stored.find((e) => e.id === 'e1');
      const e2 = stored.find((e) => e.id === 'e2');
      expect(e1).toMatchObject({ available: 2, isActive: false, updatedByName: 'importer' });
      expect(e2).toMatchObject({ available: 9 });
    });

    it('updateImportedEntries sets the bucket directly when no entries previously existed for productId', () => {
      const incoming = [makeEntry('e1', 'p1', { available: 4 })];
      const result = service.updateImportedEntries('p1', incoming);

      expect(result).toEqual(Result.Success());
      const stored = service.getProductInventoriesByProductId('p1');
      expect(stored.map((e) => e.id)).toEqual(['e1']);
    });
  });

  describe('getStorageInventoriesMap — raw per-product storage map (Angular parity)', () => {
    it('returns the RAW map keyed by productId, including inactive entries (no isActive/view filtering)', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [
        makeEntry('e1', 'p1', { isActive: true }),
        makeEntry('e2', 'p1', { isActive: false }),
      ]);
      map.set('p2', [makeEntry('e3', 'p2', { isActive: false })]);
      seedInventory(storeId, map);

      const result = service.getStorageInventoriesMap();

      expect(result.get('p1')?.map((e) => e.id)).toEqual(['e1', 'e2']);
      expect(result.get('p2')?.map((e) => e.id)).toEqual(['e3']);
    });
  });

  // WU4 (category C) + Fase 4 (T11 — rename ripple): Observable siblings restored under
  // Angular's EXACT names — getInventoryEntriesInDayObservable (inventory-offline.service.ts:213)
  // and getInventoryCategoriesViewObservable (:260), each `of(...)`-wrapping its sync-B
  // counterpart. getInventoryCategoriesViewObservable is now ZERO-ARG (drops the `products`
  // param — it was only a DI-gap mirror of the old sync method's shape; GATE-B removed it).
  describe('getInventoryEntriesInDayObservable / getInventoryCategoriesViewObservable — Observable siblings (WU4 + Fase 4 rename)', () => {
    it('getInventoryEntriesInDayObservable resolves the same BaseResponseModel envelope as the sync getInventoryEntriesInDay for the same (ignored) date', async () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { date: new Date() })]);
      seedInventory(storeId, map);

      const asyncResult = await service.getInventoryEntriesInDayObservable(new Date());
      const syncResult = service.getInventoryEntriesInDay(new Date());
      expect(asyncResult).toEqual(syncResult);
    });

    it('getInventoryEntriesInDayObservable never rejects', async () => {
      await expect(service.getInventoryEntriesInDayObservable(new Date())).resolves.toEqual(
        expect.objectContaining({ succeeded: true }),
      );
    });

    it('getInventoryCategoriesViewObservable (zero-arg) resolves the same BaseResponseModel envelope as the sync getInventoryCategoriesView', async () => {
      seedCategories(storeId, [makeCategory('cat-1', { name: 'Bebidas' })]);
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { categoryId: 'cat-1', available: 10, costPrice: 2 })]);
      seedInventory(storeId, map);

      const asyncResult = await service.getInventoryCategoriesViewObservable();
      const syncResult = service.getInventoryCategoriesView();
      expect(asyncResult).toEqual(syncResult);
    });

    it('getInventoryCategoriesViewObservable never rejects', async () => {
      await expect(service.getInventoryCategoriesViewObservable()).resolves.toEqual(
        expect.objectContaining({ succeeded: true }),
      );
    });
  });

  // ─── Product-existence guards (ProductRepository DI restored) ────────────────
  // Angular's InventoryOfflineService injects ProductRepository and guards three methods
  // against missing/unavailable products. React now injects a real ProductRepository too,
  // restoring all three guards 1:1.

  describe('createInventoryEntry — product-existence guard (Angular parity: createInventoryEntry:60-64)', () => {
    it('returns null when the product does not exist', () => {
      // 'ghost' is not among the seeded products (p1, p2).
      const result = service.createInventoryEntry('ghost', 10, 1.5);
      expect(result).toBeNull();
    });

    it('does not persist any entry when the product does not exist', () => {
      service.createInventoryEntry('ghost', 10, 1.5);
      expect(service.getProductInventoriesByProductId('ghost')).toEqual([]);
    });

    it('still creates the entry (DataResult) when the product exists', () => {
      const result = service.createInventoryEntry('p1', 10, 1.5);
      expect(result?.succeeded).toBe(true);
    });
  });

  describe('updateInventoryEntry — target-product availability guard (Angular parity: :107-108)', () => {
    it('fails with InventoryErrors.ProductNotAvailable when newProductId does not exist', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 10 })]);
      seedInventory(storeId, map);

      const result = service.updateInventoryEntry('p1', 'e1', 'ghost', 5, 1);
      expect(result.succeeded).toBe(false);
      expect(result.errors).toEqual([InventoryErrors.ProductNotAvailable]);
      expect(result.data).toBeUndefined();
    });

    it('fails with InventoryErrors.ProductNotAvailable when newProductId is inactive', () => {
      seedProducts(storeId, [makeProduct('p1'), makeProduct('p-inactive', { isActive: false })]);
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 10 })]);
      seedInventory(storeId, map);

      const result = service.updateInventoryEntry('p1', 'e1', 'p-inactive', 5, 1);
      expect(result.succeeded).toBe(false);
      expect(result.errors).toEqual([InventoryErrors.ProductNotAvailable]);
    });
  });

  describe('isNotSoldEntry — product-existence guard (Angular parity: :162-164)', () => {
    it('returns Result.Failure([ProductErrors.NotExists]) when the product does not exist', () => {
      const result = service.isNotSoldEntry('ghost', 'e1');
      expect(result).toEqual(Result.Failure([ProductErrors.NotExists]));
    });
  });

  // WU1 (eliminate-inventory-repository): InventoryRepository persistence inlined into
  // InventoryOfflineService — per-instance cache (`inventories`/`lastInventoriesKey`),
  // auto-init, date-only reviveEntry, shared-reference reads, product-scoped entry lookup
  // (no cross-product `findEntryById` scan). 1:1 port of Angular
  // inventory-offline.service.ts:39-44,485-554.
  describe('Persistence — Map-entries wire-format, cache, auto-init, reviveEntry (WU1, inventory-offline.service.ts:39-44,485-554)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('auto-writes an empty Map-entries array ("[]") on the first empty read, without throwing', () => {
      expect(() => service.getStorageInventoriesMap()).not.toThrow();
      const raw = localStorage.getItem(`lizoft.store-inventory-entries-${storeId}`);
      expect(raw).toBe('[]');
    });

    it('auto-writes an empty Map-entries array when the stored value is the literal "{}" sentinel', () => {
      localStorage.setItem(`lizoft.store-inventory-entries-${storeId}`, '{}');
      const map = service.getStorageInventoriesMap();
      expect(map.size).toBe(0);
      const raw = localStorage.getItem(`lizoft.store-inventory-entries-${storeId}`);
      expect(raw).toBe('[]');
    });

    it('throws instead of overwriting when the stored value is corrupt/unparsable JSON', () => {
      const bytes = '{not valid json';
      localStorage.setItem(`lizoft.store-inventory-entries-${storeId}`, bytes);

      expect(() => service.getStorageInventoriesMap()).toThrow(EntityUnreadableError);
      // The whole point: unreadable is not the same as empty, so the bytes stay.
      expect(localStorage.getItem(`lizoft.store-inventory-entries-${storeId}`)).toBe(bytes);
    });

    it('throws instead of returning an empty map when the stored inventory entries cannot be read', () => {
      localStorage.setItem(`lizoft.store-inventory-entries-${storeId}`, 'enc:v1:AAAA');
      const freshService = new InventoryOfflineService(
        storeId,
        new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
      );
      expect(() => freshService.getStorageInventoriesMap()).toThrow(MissingDataKeyError);
    });

    it('leaves the unreadable bytes byte-for-byte intact', () => {
      const bytes = 'enc:v1:AAAA';
      localStorage.setItem(`lizoft.store-inventory-entries-${storeId}`, bytes);
      const freshService = new InventoryOfflineService(
        storeId,
        new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
      );
      expect(() => freshService.getStorageInventoriesMap()).toThrow();
      expect(localStorage.getItem(`lizoft.store-inventory-entries-${storeId}`)).toBe(bytes);
    });

    it('reuses the in-memory cache across two reads without an intervening write (localStorage.getItem hit once)', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1')]);
      seedInventory(storeId, map);
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');

      service.getStorageInventoriesMap();
      service.getStorageInventoriesMap();

      const callsForKey = getItemSpy.mock.calls.filter(
        ([key]) => key === `lizoft.store-inventory-entries-${storeId}`,
      );
      expect(callsForKey).toHaveLength(1);
    });

    it('reviveEntry revives ONLY `date` to a Date instance — createdDate/updatedDate stay strings (Angular parity, inventory-offline.service.ts:540-544)', () => {
      const raw: [string, unknown[]][] = [
        [
          'p1',
          [
            {
              id: 'e1',
              productId: 'p1',
              categoryId: 'cat-1',
              quantity: 10,
              available: 10,
              costPrice: 2.5,
              date: '2024-01-15T10:00:00.000Z',
              order: 0,
              isActive: true,
              createdDate: '2024-01-15T10:00:00.000Z',
              createdByName: 'test',
              updatedDate: '2024-01-16T10:00:00.000Z',
              updatedByName: 'test',
            },
          ],
        ],
      ];
      localStorage.setItem(`lizoft.store-inventory-entries-${storeId}`, JSON.stringify(raw));

      const freshService = new InventoryOfflineService(
        storeId,
        new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
      );
      const entry = freshService.getProductInventoriesByProductId('p1')[0] as InventoryEntry & Record<string, unknown>;
      expect(entry.date).toBeInstanceOf(Date);
      expect(typeof entry.createdDate).toBe('string');
      expect(entry.createdDate).not.toBeInstanceOf(Date);
      expect(typeof entry.updatedDate).toBe('string');
      expect(entry.updatedDate).not.toBeInstanceOf(Date);
    });

    it('shared-reference semantics: two reads without an intervening write return the SAME array reference (Angular-faithful — was a fresh copy per repo.getAll)', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1')]);
      seedInventory(storeId, map);

      const first = service.getProductInventoriesByProductId('p1');
      const second = service.getProductInventoriesByProductId('p1');
      expect(first).toBe(second);
    });

    it('getProductInventoriesByProductId still returns [] (not undefined) for an unknown product (Stage-7 ADR-2 contract preserved)', () => {
      expect(service.getProductInventoriesByProductId('unknown-product')).toEqual([]);
    });

    it('product-scoped lookup: update() only touches the entry under the given productId, even when another product has an entry sharing the same id (no cross-product `findEntryById` scan)', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 10, costPrice: 2 })]);
      map.set('p2', [makeEntry('e1', 'p2', { quantity: 20, available: 20, costPrice: 9 })]);
      seedInventory(storeId, map);

      const result = service.update('e1', 'p1', 15, 3);

      expect(result.succeeded).toBe(true);
      expect(result.data?.productId).toBe('p1');
      expect(result.data?.quantity).toBe(15);
      // p2's same-id entry must be untouched.
      const p2Entry = service.getProductInventoriesByProductId('p2')[0];
      expect(p2Entry.quantity).toBe(20);
      expect(p2Entry.costPrice).toBe(9);
    });

    it('product-scoped lookup: deleteInventoryEntry() only touches the entry under the given productId, even when another product has an entry sharing the same id', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 10 })]);
      map.set('p2', [makeEntry('e1', 'p2', { quantity: 20, available: 20 })]);
      seedInventory(storeId, map);

      const result = service.deleteInventoryEntry('p1', 'e1');

      expect(result).toEqual(Result.Success());
      const p1Entry = service.getProductInventoriesByProductId('p1')[0];
      const p2Entry = service.getProductInventoriesByProductId('p2')[0];
      expect(p1Entry.isActive).toBe(false);
      expect(p2Entry.isActive).toBe(true);
    });
  });

  describe('getInventoryEntriesJson — raw passthrough (WU2, inventory-offline.service.ts:494-496)', () => {
    it('returns the literal "{}" fallback when no key exists in storage', () => {
      expect(service.getInventoryEntriesJson()).toBe('{}');
    });

    it('returns the raw stored string unmodified when data exists (no parse/re-serialize round-trip)', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1')]);
      seedInventory(storeId, map);
      const raw = localStorage.getItem(`lizoft.store-inventory-entries-${storeId}`)!;

      expect(service.getInventoryEntriesJson()).toBe(raw);
    });

    it('returns corrupt/malformed stored data AS-IS — raw passthrough, NOT silently emptied (unlike the deleted InventoryRepository.getAll, which swallowed parse errors into an empty Map)', () => {
      localStorage.setItem(`lizoft.store-inventory-entries-${storeId}`, '{not valid json');

      expect(service.getInventoryEntriesJson()).toBe('{not valid json');
    });
  });
});
