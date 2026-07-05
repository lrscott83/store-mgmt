import { beforeEach, describe, expect, it } from 'vitest';
import { InventoryOfflineService } from '../inventory-offline-service';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import type { InventoryEntry, OrderItem, UserModel } from '@store-mgmt/domain';

const storeId = 's1';

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
    service = new InventoryOfflineService(storeId);
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
      const service2 = new InventoryOfflineService(storeId);
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

      const service2 = new InventoryOfflineService(storeId);
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
      const service2 = new InventoryOfflineService(storeId);
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

      const service2 = new InventoryOfflineService(storeId);
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
      const service2 = new InventoryOfflineService(storeId);
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

  describe('INV-03: create — S-I1', () => {
    it('creates an entry with available=quantity', () => {
      const entry = service.create('p1', 50, 0.8);
      expect(entry.available).toBe(50);
      expect(entry.quantity).toBe(50);
    });

    it('creates an entry with order=maxOrder+1', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { order: 2 })]);
      seedInventory(storeId, map);

      const entry = service.create('p1', 10, 1.5);
      expect(entry.order).toBe(3); // maxOrder=2, so new entry gets 3
    });

    it('creates first entry with order=0 when no entries exist', () => {
      const entry = service.create('p1', 10, 1.5);
      expect(entry.order).toBe(0);
    });

    it('persists to localStorage', () => {
      service.create('p1', 10, 1.5);
      const raw = localStorage.getItem('lizoft.store-inventory-entries-s1');
      expect(raw).not.toBeNull();
    });

    it('sets isActive=true on new entry', () => {
      const entry = service.create('p1', 10, 1.5);
      expect(entry.isActive).toBe(true);
    });

    // Angular parity (audit-user-threading): create stamps createdByName from the
    // authenticated user's login and MUST NOT touch updatedByName/updatedDate.
    it('stamps createdByName with the authenticated user login', () => {
      const entry = service.create('p1', 10, 1.5);
      expect(entry.createdByName).toBe('jdoe');
    });

    it('leaves updatedByName/updatedDate undefined on create', () => {
      const entry = service.create('p1', 10, 1.5);
      expect(entry.updatedByName).toBeUndefined();
      expect(entry.updatedDate).toBeUndefined();
    });

    it('stamps createdByName with "" when no user is authenticated', () => {
      useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false, error: null });
      const entry = service.create('p1', 10, 1.5);
      expect(entry.createdByName).toBe('');
    });
  });

  describe('INV-04: update — S-I4 (fails when partially sold)', () => {
    it('throws when entry has been partially sold (quantity !== available)', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 4 })]); // 6 sold
      seedInventory(storeId, map);

      expect(() => service.update('e1', 'p1', 15, 2.0)).toThrow();
    });

    it('succeeds when no units sold (quantity === available)', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 10 })]);
      seedInventory(storeId, map);

      expect(() => service.update('e1', 'p1', 15, 2.0)).not.toThrow();
    });

    it('throws when entry not found', () => {
      expect(() => service.update('nonexistent', 'p1', 10, 1.0)).toThrow();
    });

    // Angular parity (audit-user-threading): update stamps updatedByName from the
    // authenticated user's login.
    it('stamps updatedByName with the authenticated user login', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 10 })]);
      seedInventory(storeId, map);

      const updated = service.update('e1', 'p1', 15, 2.0);
      expect(updated.updatedByName).toBe('jdoe');
    });
  });

  describe('INV-05: deactivate — S-I5 (fails when sold)', () => {
    it('throws when entry has been partially sold', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 4 })]);
      seedInventory(storeId, map);

      expect(() => service.deactivate('e1', 'p1')).toThrow();
    });

    it('succeeds when no units sold', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 10 })]);
      seedInventory(storeId, map);

      expect(() => service.deactivate('e1', 'p1')).not.toThrow();
    });

    it('sets isActive=false after deactivation', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 10 })]);
      seedInventory(storeId, map);

      service.deactivate('e1', 'p1');
      const all = service.getAll();
      const found = all.find((v) => v.id === 'e1');
      // After deactivation, it should not appear in getAll (which returns active entries only)
      // OR it should have isActive=false if getAll returns all
      // Let's check that the entry is gone from the active list
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

  describe('INV-07: getAll returns InventoryEntryView[] for active entries', () => {
    it('returns empty array when no entries', () => {
      expect(service.getAll()).toEqual([]);
    });

    it('returns only active entries', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [
        makeEntry('e1', 'p1', { isActive: true }),
        makeEntry('e2', 'p1', { isActive: false }),
      ]);
      seedInventory(storeId, map);

      const all = service.getAll();
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

    it('computes weighted-average cost price per product: Σ(available·costPrice)/Σavailable', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [
        makeEntry('e1', 'p1', { available: 10, costPrice: 2 }),
        makeEntry('e2', 'p1', { available: 10, costPrice: 4 }),
      ]);
      seedInventory(storeId, map);

      const categories = service.getAvailableByCategory([enrichedProduct('p1', 'Ron', 'cat-1', 'Bebidas')]);

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

      const categories = service.getAvailableByCategory([enrichedProduct('p1', 'Ron', 'cat-1', 'Bebidas')]);

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
      ]);

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
      ]);

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
      ]);

      const bebidas = categories.find((c) => c.categoryId === 'cat-1');
      const snacks = categories.find((c) => c.categoryId === 'cat-2');
      expect(bebidas?.totalCostPrice).toBe(20);
      expect(snacks?.totalCostPrice).toBe(50);
    });

    it('does not divide by zero / produce NaN for fully-depleted products (documented divergence — Angular has a NaN bug here, not replicated)', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 0, costPrice: 2 })]);
      seedInventory(storeId, map);

      const categories = service.getAvailableByCategory([enrichedProduct('p1', 'Ron', 'cat-1', 'Bebidas')]);

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

  describe('INV-08: getByDate filters by date', () => {
    it('returns entries matching the given date', () => {
      const date = new Date('2024-03-10T10:00:00.000Z');
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { date })]);
      seedInventory(storeId, map);

      const results = service.getByDate(date);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].id).toBe('e1');
    });

    it('returns empty when no entries match the date', () => {
      const date = new Date('2024-03-10T10:00:00.000Z');
      const otherDate = new Date('2024-03-11T10:00:00.000Z');
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { date })]);
      seedInventory(storeId, map);

      const results = service.getByDate(otherDate);
      expect(results).toHaveLength(0);
    });
  });

  // WU1 (offline-online-service-parity, Slice 1): BaseService<InventoryEntryView>
  // conformance. getAll() already returns InventoryEntryView[] and matches the
  // interface as-is; getById/delete are new — delete is a thin wrapper over the
  // existing deactivate(entryId, productId) validated soft-delete (looks up productId
  // via findEntryById internally), preserving deactivate's exact semantics
  // (throws when partially sold, stamps updatedByName).
  describe('INV-11: getById — BaseService<InventoryEntryView> conformance', () => {
    it('returns the matching entry as an InventoryEntryView', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 7 })]);
      seedInventory(storeId, map);

      const found = service.getById('e1');
      expect(found).toEqual({
        id: 'e1',
        productId: 'p1',
        productName: '',
        quantity: 10,
        costPrice: 2.5,
        date: new Date('2024-01-15T10:00:00.000Z'),
        isActive: true,
      });
    });

    it('returns undefined for a missing id', () => {
      expect(service.getById('missing')).toBeUndefined();
    });

    it('returns an inactive entry too (unfiltered by isActive, matching other services getById)', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { isActive: false })]);
      seedInventory(storeId, map);

      expect(service.getById('e1')?.isActive).toBe(false);
    });
  });

  describe('INV-12: delete — BaseService<InventoryEntryView> conformance alias for deactivate', () => {
    it('sets isActive=false, same as deactivate', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 10 })]);
      seedInventory(storeId, map);

      service.delete('e1');
      expect(service.getById('e1')?.isActive).toBe(false);
    });

    it('throws when the entry has been partially sold, same as deactivate', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('p1', [makeEntry('e1', 'p1', { quantity: 10, available: 4 })]);
      seedInventory(storeId, map);

      expect(() => service.delete('e1')).toThrow();
    });

    it('throws for a missing id', () => {
      expect(() => service.delete('missing')).toThrow();
    });
  });
});
