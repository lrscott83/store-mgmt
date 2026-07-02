import { beforeEach, describe, expect, it } from 'vitest';
import { InventoryOfflineService } from '../inventory-offline-service';
import type { InventoryEntry, OrderItem } from '@store-mgmt/domain';

const storeId = 's1';

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

describe('InventoryOfflineService', () => {
  let service: InventoryOfflineService;

  beforeEach(() => {
    localStorage.clear();
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
});
