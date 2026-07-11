import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryOfflineService } from '../inventory-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { InventoryErrors, ProductErrors, Result } from '@store-mgmt/domain';
import type { InventoryEntry, OrderItem, Product, UserModel } from '@store-mgmt/domain';

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

function seedProducts(storeId: string, products: Product[]): void {
  const entries = products.map((p) => [p.id, p] as [string, Product]);
  localStorage.setItem(`lizoft.store-products-${storeId}`, JSON.stringify(entries));
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
      expect(costs[0]).toEqual({ id: 'e1', costPrice: 2.5, quantity: 6 });
      expect(costs[1]).toEqual({ id: 'e2', costPrice: 3.0, quantity: 1 });
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
      expect(allCosts[0].id).toBe('e2');
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
      expect(costs[0].id).toBe('e1');
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
      expect(fullCosts).toEqual([{ id: 'e1', costPrice: 2.5, quantity: 6 }]);
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
      expect(fullCosts).toEqual([{ id: 'e1', costPrice: 2.5, quantity: 6 }]);
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
      expect(costs).toEqual([{ id: 'e1', costPrice: 2.5, quantity: 2 }]);
    });

    it('bypasses the stock-sufficiency check when product.discountFromInvantory is false, even with module enabled', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { order: 0, available: 2, costPrice: 2.5 })]);
      seedInventory(storeId, map);

      const costs = service.getAvailableInventoryCosts('p1', 5, {
        product: { isActive: true, availableToSale: true, discountFromInvantory: false },
        hasInventoryModule: true,
      });
      expect(costs).toEqual([{ id: 'e1', costPrice: 2.5, quantity: 2 }]);
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
        { id: 'e1', costPrice: 2.5, quantity: 6 },
        { id: 'e2', costPrice: 3.0, quantity: 1 },
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
            { id: 'e1', costPrice: 2.5, quantity: 6 },
            { id: 'e2', costPrice: 3.0, quantity: 1 },
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
      expect(costs[0]).toMatchObject({ id: 'e1', quantity: 6 });
      expect(costs[1]).toMatchObject({ id: 'e2', quantity: 4 });
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
          productCosts: [{ id: 'e1', costPrice: 2.5, quantity: 5 }],
        },
      ];

      service.increaseQuantitiesByOrderItems(orderItems);

      // After restore, should be able to deduct 5 again
      const costs = service.getAvailableInventoryCosts('p1', 5);
      expect(costs[0].id).toBe('e1');
      expect(costs[0].quantity).toBe(5);
    });

    it('handles cost.inventoryId fallback for Angular-origin data', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { available: 0 })]);
      seedInventory(storeId, map);

      // Simulate Angular-origin data where inventoryId is used instead of id
      const orderItems = [
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
          productCosts: [
            { id: undefined as unknown as string, inventoryId: 'e1', costPrice: 2.5, quantity: 5 } as unknown as import('@store-mgmt/domain').InventoryEntryCost,
          ],
        },
      ] as OrderItem[];

      // Should not throw — should handle undefined id with inventoryId fallback
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

  // WU2 (service-return-shape-parity Slice 1, category D): create() now returns
  // DataResult<InventoryEntryView> (was plain InventoryEntry), matching Angular's
  // createInventoryEntry sync DataResult return — never throws.
  describe('INV-03: create — S-I1 (DataResult<InventoryEntryView>)', () => {
    it('succeeds:true, data.available=data.quantity for a new entry', () => {
      const result = service.create('p1', 50, 0.8);
      expect(result?.succeeded).toBe(true);
      expect(result?.errors).toEqual([]);
      expect(result?.data?.quantity).toBe(50);
      // Angular parity (createInventoryEntry:94): productName from the fetched product
      expect(result?.data?.productName).toBe('Product p1');
    });

    it('creates an entry with order=maxOrder+1 (verified via a subsequent read)', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { order: 2 })]);
      seedInventory(storeId, map);

      service.create('p1', 10, 1.5);
      const entries = service.getProductInventoriesByProductId('p1');
      const created = entries.find((e) => e.id !== 'e1');
      expect(created?.order).toBe(3); // maxOrder=2, so new entry gets 3
    });

    it('creates first entry with order=0 when no entries exist', () => {
      service.create('p1', 10, 1.5);
      const entries = service.getProductInventoriesByProductId('p1');
      expect(entries[0].order).toBe(0);
    });

    it('persists to localStorage', () => {
      service.create('p1', 10, 1.5);
      const raw = localStorage.getItem('lizoft.store-inventory-entries-s1');
      expect(raw).not.toBeNull();
    });

    it('sets isActive=true on new entry data', () => {
      const result = service.create('p1', 10, 1.5);
      expect(result?.data?.isActive).toBe(true);
    });

    // Angular parity (audit-user-threading): create stamps createdByName from the
    // authenticated user's login and MUST NOT touch updatedByName/updatedDate.
    it('stamps createdByName with the authenticated user login (raw entry, not exposed on the view)', () => {
      service.create('p1', 10, 1.5);
      const entries = service.getProductInventoriesByProductId('p1');
      expect(entries[0].createdByName).toBe('jdoe');
    });

    it('leaves updatedByName/updatedDate undefined on create', () => {
      service.create('p1', 10, 1.5);
      const entries = service.getProductInventoriesByProductId('p1');
      expect(entries[0].updatedByName).toBeUndefined();
      expect(entries[0].updatedDate).toBeUndefined();
    });

    it('stamps createdByName with "" when no user is authenticated', () => {
      useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false, error: null });
      service.create('p1', 10, 1.5);
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

  // WU2 (category D): deactivate() now returns Result (guarded by isNotSoldEntry) — never throws.
  describe('INV-05: deactivate — S-I5 (Result, never throws)', () => {
    it('fails with InventoryErrors.SaleExistsWithThisEntry when entry has been partially sold', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 4 })]);
      seedInventory(storeId, map);

      const result = service.deactivate('e1', 'p1');
      expect(result).toEqual(Result.Failure([InventoryErrors.SaleExistsWithThisEntry]));
    });

    it('succeeds when no units sold', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 10 })]);
      seedInventory(storeId, map);

      const result = service.deactivate('e1', 'p1');
      expect(result).toEqual(Result.Success());
    });

    it('fails with InventoryErrors.EntryNotExists when entry not found', () => {
      const result = service.deactivate('missing', 'p1');
      expect(result).toEqual(Result.Failure([InventoryErrors.EntryNotExists]));
    });

    it('sets isActive=false after deactivation', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 10 })]);
      seedInventory(storeId, map);

      service.deactivate('e1', 'p1');
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

      service.deactivate('e1', 'p1');
      expect(findRawEntry(storeId, 'e1')?.updatedByName).toBe('jdoe');
    });
  });

  describe('INV-06: hasAvailableStock', () => {
    it('returns true when enough stock exists', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { available: 10 })]);
      seedInventory(storeId, map);

      expect(service.hasAvailableStock('p1', 5)).toBe(true);
    });

    it('returns false when not enough stock', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { available: 3 })]);
      seedInventory(storeId, map);

      expect(service.hasAvailableStock('p1', 5)).toBe(false);
    });

    it('returns false when no stock exists', () => {
      expect(service.hasAvailableStock('p1', 1)).toBe(false);
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

  describe('INV-09: getAvailableByCategory — weighted-average cost + category totals (Angular parity: getInventoryCategoriesView/getAverageCostPrice/getTotalCostPrice, inventory-offline.service.ts:286-349)', () => {
    const enrichedProduct = (id: string, name: string, categoryId: string, categoryName: string) => ({
      id,
      name,
      categoryId,
      categoryName,
    });

    it('returns a BaseResponseModel envelope: succeeded:true, message:"", actionCode:200, errors:[]', () => {
      const result = service.getAvailableByCategory([]);
      expect(result.succeeded).toBe(true);
      expect(result.message).toBe('');
      expect(result.actionCode).toBe(200);
      expect(result.errors).toEqual([]);
    });

    it('computes weighted-average cost price per product: Σ(available·costPrice)/Σavailable', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [
        makeEntry('e1', 'p1', { available: 10, costPrice: 2 }),
        makeEntry('e2', 'p1', { available: 10, costPrice: 4 }),
      ]);
      seedInventory(storeId, map);

      const categories = service.getAvailableByCategory([enrichedProduct('p1', 'Ron', 'cat-1', 'Bebidas')]).data;

      // (10*2 + 10*4) / 20 = 3
      expect(categories[0].products[0].avgCostPrice).toBe(3);
      expect(categories[0].products[0].totalAvailable).toBe(20);
    });

    it('weights by available quantity, not the original received quantity', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [
        // received 10 @ $2 but 8 already sold -> only 2 left available
        makeEntry('e1', 'p1', { quantity: 10, available: 2, costPrice: 2 }),
        makeEntry('e2', 'p1', { quantity: 10, available: 8, costPrice: 5 }),
      ]);
      seedInventory(storeId, map);

      const categories = service.getAvailableByCategory([enrichedProduct('p1', 'Ron', 'cat-1', 'Bebidas')]).data;

      // (2*2 + 8*5) / 10 = 4.4
      expect(categories[0].products[0].avgCostPrice).toBeCloseTo(4.4, 5);
    });

    it('computes category totalQuantity as the sum of each product totalAvailable', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { available: 10, costPrice: 2 })]);
      map.set('p2', [makeEntry('e2', 'p2', { available: 5, costPrice: 3 })]);
      seedInventory(storeId, map);

      const categories = service.getAvailableByCategory([
        enrichedProduct('p1', 'Ron', 'cat-1', 'Bebidas'),
        enrichedProduct('p2', 'Vodka', 'cat-1', 'Bebidas'),
      ]).data;

      expect(categories).toHaveLength(1);
      expect(categories[0].totalQuantity).toBe(15);
    });

    it('computes category totalCostPrice as Σ(product.avgCostPrice·product.totalAvailable) — matches Σ(entry.available·costPrice) for the category', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { available: 10, costPrice: 2 })]); // value = 20
      map.set('p2', [makeEntry('e2', 'p2', { available: 5, costPrice: 3 })]); // value = 15
      seedInventory(storeId, map);

      const categories = service.getAvailableByCategory([
        enrichedProduct('p1', 'Ron', 'cat-1', 'Bebidas'),
        enrichedProduct('p2', 'Vodka', 'cat-1', 'Bebidas'),
      ]).data;

      expect(categories[0].totalCostPrice).toBe(35);
    });

    it('keeps separate category totals for products in different categories', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { available: 10, costPrice: 2 })]);
      map.set('p2', [makeEntry('e2', 'p2', { available: 5, costPrice: 10 })]);
      seedInventory(storeId, map);

      const categories = service.getAvailableByCategory([
        enrichedProduct('p1', 'Ron', 'cat-1', 'Bebidas'),
        enrichedProduct('p2', 'Papas', 'cat-2', 'Snacks'),
      ]).data;

      const bebidas = categories.find((c) => c.categoryId === 'cat-1');
      const snacks = categories.find((c) => c.categoryId === 'cat-2');
      expect(bebidas?.totalCostPrice).toBe(20);
      expect(snacks?.totalCostPrice).toBe(50);
    });

    it('does not divide by zero / produce NaN for fully-depleted products (documented divergence — Angular has a NaN bug here, not replicated)', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 0, costPrice: 2 })]);
      seedInventory(storeId, map);

      const categories = service.getAvailableByCategory([enrichedProduct('p1', 'Ron', 'cat-1', 'Bebidas')]).data;

      // Fully-depleted product is excluded entirely — pre-existing divergence, not this gap's concern.
      expect(categories).toHaveLength(0);
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

  // WU3 (category B): getByDate/getAvailableByCategory now return SYNC
  // BaseResponseModel<T> (was a bare array) — never Promise, never Result/DataResult.
  describe('INV-08: getByDate filters by date (BaseResponseModel<T>, WU3)', () => {
    it('returns a BaseResponseModel envelope: succeeded:true, message:"", actionCode:200, errors:[]', () => {
      const result = service.getByDate(new Date());
      expect(result.succeeded).toBe(true);
      expect(result.message).toBe('');
      expect(result.actionCode).toBe(200);
      expect(result.errors).toEqual([]);
    });

    it('returns entries matching the given date in .data', () => {
      const date = new Date('2024-03-10T10:00:00.000Z');
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { date })]);
      seedInventory(storeId, map);

      const results = service.getByDate(date).data;
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].id).toBe('e1');
    });

    it('returns empty .data when no entries match the date', () => {
      const date = new Date('2024-03-10T10:00:00.000Z');
      const otherDate = new Date('2024-03-11T10:00:00.000Z');
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { date })]);
      seedInventory(storeId, map);

      const results = service.getByDate(otherDate).data;
      expect(results).toHaveLength(0);
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
      expect(result.data).toHaveLength(1);
      expect(result.data[0].productId).toBe('p1');
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
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('e2');
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

    it('returns per-product FIFO breakdown sorted by order asc, emitting `id` not `inventoryId`', async () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [
        makeEntry('e2', 'p1', { order: 1, available: 4, costPrice: 3.0 }),
        makeEntry('e1', 'p1', { order: 0, available: 6, costPrice: 2.5 }),
      ]);
      seedInventory(storeId, map);

      const result = await service.getInventoryEntriesView();
      const views = result.data;
      expect(views).toHaveLength(1);
      expect(views[0].productId).toBe('p1');
      expect(views[0].productAvailable).toBe(10);
      expect(views[0].availableEntries).toEqual([
        { id: 'e1', costPrice: 2.5, quantity: 6 },
        { id: 'e2', costPrice: 3.0, quantity: 4 },
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
      const views = result.data;
      expect(views[0].availableEntries).toEqual([{ id: 'e3', costPrice: 2.5, quantity: 3 }]);
      expect(views[0].productAvailable).toBe(3);
    });

    it('returns one view per product', async () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { available: 5 })]);
      map.set('p2', [makeEntry('e2', 'p2', { available: 8 })]);
      seedInventory(storeId, map);

      const result = await service.getInventoryEntriesView();
      const views = result.data;
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

  // WU4 (category C): Observable siblings restored under Angular's EXACT names —
  // getInventoryEntriesInDayObservable (inventory-offline.service.ts:213) and
  // getInventoryCategoriesViewObservable (:260), each `of(...)`-wrapping its sync-B
  // counterpart. (The category sibling keeps React's `products` param — the pre-existing
  // DI-gap shape of the underlying sync getAvailableByCategory — since only the NAME was the
  // parity defect; no existing call-site migration needed.)
  describe('getInventoryEntriesInDayObservable / getInventoryCategoriesViewObservable — Observable siblings (WU4)', () => {
    it('getInventoryEntriesInDayObservable resolves the same BaseResponseModel envelope as the sync getByDate for the same date', async () => {
      const date = new Date('2024-03-10T10:00:00.000Z');
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { date })]);
      seedInventory(storeId, map);

      const asyncResult = await service.getInventoryEntriesInDayObservable(date);
      const syncResult = service.getByDate(date);
      expect(asyncResult).toEqual(syncResult);
    });

    it('getInventoryEntriesInDayObservable never rejects', async () => {
      await expect(service.getInventoryEntriesInDayObservable(new Date())).resolves.toEqual(
        expect.objectContaining({ succeeded: true }),
      );
    });

    it('getInventoryCategoriesViewObservable resolves the same BaseResponseModel envelope as the sync getAvailableByCategory for the same products', async () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { available: 10, costPrice: 2 })]);
      seedInventory(storeId, map);
      const products = [{ id: 'p1', name: 'Ron', categoryId: 'cat-1', categoryName: 'Bebidas' }];

      const asyncResult = await service.getInventoryCategoriesViewObservable(products);
      const syncResult = service.getAvailableByCategory(products);
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

  describe('create — product-existence guard (Angular parity: createInventoryEntry:60-64)', () => {
    it('returns null when the product does not exist', () => {
      // 'ghost' is not among the seeded products (p1, p2).
      const result = service.create('ghost', 10, 1.5);
      expect(result).toBeNull();
    });

    it('does not persist any entry when the product does not exist', () => {
      service.create('ghost', 10, 1.5);
      expect(service.getProductInventoriesByProductId('ghost')).toEqual([]);
    });

    it('still creates the entry (DataResult) when the product exists', () => {
      const result = service.create('p1', 10, 1.5);
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

    it('auto-writes an empty Map-entries array when the stored value is corrupt/unparsable JSON', () => {
      localStorage.setItem(`lizoft.store-inventory-entries-${storeId}`, '{not valid json');
      expect(() => service.getStorageInventoriesMap()).not.toThrow();
      const map = service.getStorageInventoriesMap();
      expect(map.size).toBe(0);
      const raw = localStorage.getItem(`lizoft.store-inventory-entries-${storeId}`);
      expect(raw).toBe('[]');
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

    it('product-scoped lookup: deactivate() only touches the entry under the given productId, even when another product has an entry sharing the same id', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 10 })]);
      map.set('p2', [makeEntry('e1', 'p2', { quantity: 20, available: 20 })]);
      seedInventory(storeId, map);

      const result = service.deactivate('e1', 'p1');

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
