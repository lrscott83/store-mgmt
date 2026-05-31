import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DataSynchronizerService,
} from '../data-synchronizer-service';
import type {
  CategoryWriter,
  GenericUpsertRepo,
  InventoryRepo,
  MergeResult,
} from '../data-synchronizer-service';
import type { ParsedData } from '../data-serializer-service';
import type {
  ProductCategory,
  Product,
  InventoryEntry,
  Order,
  Expense,
  SaleCredit,
} from '@store-mgmt/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STORE_ID = 'store-test-01';

function makeCategory(id: string, name: string): ProductCategory {
  return { id, name, order: 1, isActive: true };
}

function makeProduct(id: string, name: string): Product {
  return {
    id,
    name,
    categoryId: 'cat-1',
    categoryName: 'Bebidas',
    price: 1000,
    order: 1,
    availableToSale: true,
    discountFromInvantory: false,
    businessId: 'biz-1',
    isActive: true,
    createdDate: new Date('2024-01-01T00:00:00.000Z'),
    updatedDate: new Date('2024-01-02T00:00:00.000Z'),
    createdByName: 'admin',
  };
}

function makeInventoryEntry(id: string, productId: string): InventoryEntry {
  return {
    id,
    productId,
    categoryId: 'cat-1',
    quantity: 10,
    available: 10,
    costPrice: 500,
    date: new Date('2024-01-01T00:00:00.000Z'),
    order: 1,
    isActive: true,
    createdDate: new Date('2024-01-01T00:00:00.000Z'),
    updatedDate: new Date('2024-01-02T00:00:00.000Z'),
    createdByName: 'admin',
  };
}

function makeOrder(id: string): Order {
  return {
    id,
    orderItems: [],
    total: 1500,
    itemsCount: 1,
    date: new Date('2024-06-01T00:00:00.000Z'),
    type: 0 as Order['type'],
    paymentType: 0 as Order['paymentType'],
    isCredit: false,
    description: '',
    isActive: true,
    createdDate: new Date('2024-06-01T00:00:00.000Z'),
    updatedDate: new Date('2024-06-01T00:00:00.000Z'),
    createdByName: 'admin',
  };
}

function makeExpense(id: string): Expense {
  return {
    id,
    type: 0 as Expense['type'],
    total: 200,
    date: new Date('2024-06-01T00:00:00.000Z'),
    paymentType: 0 as Expense['paymentType'],
    note: '',
    isActive: true,
    createdDate: new Date('2024-06-01T00:00:00.000Z'),
    updatedDate: new Date('2024-06-01T00:00:00.000Z'),
    createdByName: 'admin',
  };
}

function makeSaleCredit(id: string): SaleCredit {
  return {
    id,
    orderId: 'order-1',
    client: 'Ana',
    total: 1500,
    date: new Date('2024-06-01T00:00:00.000Z'),
    paid: 0,
    isPaid: false,
    paidDate: null as unknown as Date,
    paidType: null as unknown as SaleCredit['paidType'],
    note: '',
    isActive: true,
    createdDate: new Date('2024-06-01T00:00:00.000Z'),
    updatedDate: new Date('2024-06-01T00:00:00.000Z'),
    createdByName: 'admin',
  };
}

// ---------------------------------------------------------------------------
// Mock repo factories
// ---------------------------------------------------------------------------

function makeCategoryWriter(initial: ProductCategory[] = []): CategoryWriter & { _saved: ProductCategory[] } {
  const store = new Map(initial.map((c) => [c.id, c]));
  const _saved: ProductCategory[] = [];
  return {
    _saved,
    getAll: () => Array.from(store.values()),
    save: (cat) => {
      store.set(cat.id, cat);
      _saved.push(cat);
      return cat;
    },
  };
}

function makeGenericRepo<T extends { id: string }>(initial: T[] = []): GenericUpsertRepo<T> & { _upserted: T[] } {
  const store = new Map(initial.map((v) => [v.id, v]));
  const _upserted: T[] = [];
  return {
    _upserted,
    getAll: (_storeId: string) => new Map(store),
    upsert: (_storeId: string, item: T) => {
      store.set(item.id, item);
      _upserted.push(item);
    },
  };
}

function makeInventoryRepoMock(
  initial: Map<string, InventoryEntry[]> = new Map(),
): InventoryRepo & { _saves: { productId: string; entries: InventoryEntry[] }[] } {
  const store = new Map(initial);
  const _saves: { productId: string; entries: InventoryEntry[] }[] = [];
  return {
    _saves,
    getAll: (_storeId: string) => new Map(store),
    save: (_storeId: string, productId: string, entries: InventoryEntry[]) => {
      store.set(productId, entries);
      _saves.push({ productId, entries });
    },
  };
}

function makeService(opts?: {
  existingCategories?: ProductCategory[];
  existingProducts?: Product[];
  existingInventory?: Map<string, InventoryEntry[]>;
  existingOrders?: Order[];
  existingExpenses?: Expense[];
  existingSaleCredits?: SaleCredit[];
}): {
  svc: DataSynchronizerService;
  catWriter: ReturnType<typeof makeCategoryWriter>;
  prodRepo: ReturnType<typeof makeGenericRepo<Product>>;
  invRepo: ReturnType<typeof makeInventoryRepoMock>;
  orderRepo: ReturnType<typeof makeGenericRepo<Order>>;
  expenseRepo: ReturnType<typeof makeGenericRepo<Expense>>;
  saleCreditRepo: ReturnType<typeof makeGenericRepo<SaleCredit>>;
} {
  const catWriter = makeCategoryWriter(opts?.existingCategories ?? []);
  const prodRepo = makeGenericRepo<Product>(opts?.existingProducts ?? []);
  const invRepo = makeInventoryRepoMock(opts?.existingInventory ?? new Map());
  const orderRepo = makeGenericRepo<Order>(opts?.existingOrders ?? []);
  const expenseRepo = makeGenericRepo<Expense>(opts?.existingExpenses ?? []);
  const saleCreditRepo = makeGenericRepo<SaleCredit>(opts?.existingSaleCredits ?? []);

  const svc = new DataSynchronizerService(
    STORE_ID,
    catWriter,
    prodRepo,
    invRepo,
    orderRepo,
    expenseRepo,
    saleCreditRepo,
  );
  return { svc, catWriter, prodRepo, invRepo, orderRepo, expenseRepo, saleCreditRepo };
}

function emptyData(): ParsedData {
  return {
    categories: [],
    products: [],
    inventoryEntries: [],
    orders: [],
    expenses: [],
    saleCredits: [],
  };
}

// ---------------------------------------------------------------------------
// T7: Merge upsert-by-id
//   X updated not duplicated, Y inserted, local Z untouched (non-destructive)
// ---------------------------------------------------------------------------

describe('DataSynchronizerService', () => {
  describe('T7 — merge upsert-by-id (non-destructive)', () => {
    it('inserts new categories not present in local store', async () => {
      const { svc } = makeService({ existingCategories: [] });
      const data: ParsedData = {
        ...emptyData(),
        categories: [makeCategory('cat-new', 'New Cat')],
      };
      const result = await svc.sync(data);
      const catResult = result.find((r) => r.entity === 'categories');
      expect(catResult?.inserted).toBe(1);
      expect(catResult?.updated).toBe(0);
    });

    it('updates existing categories (same id, different name)', async () => {
      const existing = makeCategory('cat-1', 'Old Name');
      const { svc } = makeService({ existingCategories: [existing] });
      const data: ParsedData = {
        ...emptyData(),
        categories: [makeCategory('cat-1', 'New Name')],
      };
      const result = await svc.sync(data);
      const catResult = result.find((r) => r.entity === 'categories');
      expect(catResult?.inserted).toBe(0);
      expect(catResult?.updated).toBe(1);
    });

    it('preserves local category not present in import data (non-destructive)', async () => {
      const local = makeCategory('cat-local', 'Local Only');
      const { svc, catWriter } = makeService({ existingCategories: [local] });
      const data: ParsedData = {
        ...emptyData(),
        categories: [makeCategory('cat-new', 'From File')],
      };
      await svc.sync(data);
      // catWriter.getAll() should still contain cat-local (non-destructive)
      const remaining = catWriter.getAll();
      const localExists = remaining.some((c) => c.id === 'cat-local');
      expect(localExists).toBe(true);
    });

    it('inserts new products and returns correct count', async () => {
      const { svc } = makeService();
      const data: ParsedData = {
        ...emptyData(),
        products: [makeProduct('prod-new', 'New Product')],
      };
      const result = await svc.sync(data);
      const prodResult = result.find((r) => r.entity === 'products');
      expect(prodResult?.inserted).toBe(1);
      expect(prodResult?.updated).toBe(0);
    });

    it('updates existing product (same id)', async () => {
      const existing = makeProduct('prod-1', 'Old Product');
      const { svc } = makeService({ existingProducts: [existing] });
      const updated = { ...makeProduct('prod-1', 'Updated Product'), price: 2000 };
      const data: ParsedData = {
        ...emptyData(),
        products: [updated],
      };
      const result = await svc.sync(data);
      const prodResult = result.find((r) => r.entity === 'products');
      expect(prodResult?.inserted).toBe(0);
      expect(prodResult?.updated).toBe(1);
    });

    it('returns MergeResult for all 6 entities', async () => {
      const { svc } = makeService();
      const data: ParsedData = {
        categories: [makeCategory('c1', 'Cat 1')],
        products: [makeProduct('p1', 'Prod 1')],
        inventoryEntries: [makeInventoryEntry('inv-1', 'p1')],
        orders: [makeOrder('o1')],
        expenses: [makeExpense('e1')],
        saleCredits: [makeSaleCredit('sc1')],
      };
      const result = await svc.sync(data);
      const entities = result.map((r) => r.entity);
      expect(entities).toContain('categories');
      expect(entities).toContain('products');
      expect(entities).toContain('inventoryEntries');
      expect(entities).toContain('orders');
      expect(entities).toContain('expenses');
      expect(entities).toContain('saleCredits');
    });
  });

  // -------------------------------------------------------------------------
  // T8: Categories-before-products order (write order spy)
  // -------------------------------------------------------------------------

  describe('T8 — categories before products write order', () => {
    it('categories are written before products', async () => {
      const writeOrder: string[] = [];

      const catWriter: CategoryWriter = {
        getAll: () => [],
        save: (cat) => {
          writeOrder.push('category:' + cat.id);
          return cat;
        },
      };

      const prodRepo: GenericUpsertRepo<Product> = {
        getAll: (_storeId) => new Map(),
        upsert: (_storeId, item) => {
          writeOrder.push('product:' + item.id);
        },
      };

      const invRepo: InventoryRepo = {
        getAll: (_storeId) => new Map(),
        save: (_storeId, productId, entries) => {
          writeOrder.push('inventory:' + productId);
        },
      };

      const orderRepo: GenericUpsertRepo<Order> = {
        getAll: (_storeId) => new Map(),
        upsert: (_storeId, item) => { writeOrder.push('order:' + item.id); },
      };

      const expenseRepo: GenericUpsertRepo<Expense> = {
        getAll: (_storeId) => new Map(),
        upsert: (_storeId, item) => { writeOrder.push('expense:' + item.id); },
      };

      const saleCreditRepo: GenericUpsertRepo<SaleCredit> = {
        getAll: (_storeId) => new Map(),
        upsert: (_storeId, item) => { writeOrder.push('saleCredit:' + item.id); },
      };

      const svc = new DataSynchronizerService(
        STORE_ID,
        catWriter,
        prodRepo,
        invRepo,
        orderRepo,
        expenseRepo,
        saleCreditRepo,
      );

      const data: ParsedData = {
        categories: [makeCategory('cat-1', 'Cat')],
        products: [makeProduct('prod-1', 'Prod')],
        inventoryEntries: [makeInventoryEntry('inv-1', 'prod-1')],
        orders: [makeOrder('order-1')],
        expenses: [makeExpense('exp-1')],
        saleCredits: [makeSaleCredit('sc-1')],
      };

      await svc.sync(data);

      // Categories must appear before products in the write order
      const catIdx = writeOrder.findIndex((w) => w.startsWith('category:'));
      const prodIdx = writeOrder.findIndex((w) => w.startsWith('product:'));
      expect(catIdx).toBeGreaterThanOrEqual(0);
      expect(prodIdx).toBeGreaterThanOrEqual(0);
      expect(catIdx).toBeLessThan(prodIdx);
    });
  });

  // -------------------------------------------------------------------------
  // T9: Import-twice idempotency
  // -------------------------------------------------------------------------

  describe('T9 — import-twice idempotency', () => {
    it('second sync of same data results in inserted:0 for all entities', async () => {
      const cat = makeCategory('cat-1', 'Cat');
      const prod = makeProduct('prod-1', 'Prod');
      const inv = makeInventoryEntry('inv-1', 'prod-1');
      const order = makeOrder('order-1');
      const expense = makeExpense('exp-1');
      const credit = makeSaleCredit('sc-1');

      const { svc } = makeService({
        existingCategories: [cat],
        existingProducts: [prod],
        existingInventory: new Map([['prod-1', [inv]]]),
        existingOrders: [order],
        existingExpenses: [expense],
        existingSaleCredits: [credit],
      });

      const data: ParsedData = {
        categories: [cat],
        products: [prod],
        inventoryEntries: [inv],
        orders: [order],
        expenses: [expense],
        saleCredits: [credit],
      };

      // Second import (all items already exist in store)
      const result = await svc.sync(data);

      // All entities should show 0 inserted (they already exist with same id)
      for (const r of result) {
        expect(r.inserted).toBe(0);
      }
    });

    it('second sync does not create duplicates', async () => {
      const cat = makeCategory('cat-1', 'Cat');
      const { svc, catWriter } = makeService({ existingCategories: [cat] });
      const data: ParsedData = { ...emptyData(), categories: [cat] };

      await svc.sync(data);
      const afterSync = catWriter.getAll();
      const catCount = afterSync.filter((c) => c.id === 'cat-1').length;
      expect(catCount).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // T10: Envelope validation guard — bad version/missing entities → error, no writes
  // (This test is on the serializer import side — synchronizer receives ParsedData
  //  only after successful import. We test that sync() handles empty data gracefully.)
  // -------------------------------------------------------------------------

  describe('T10 — sync handles empty/minimal data gracefully', () => {
    it('syncing empty data returns MergeResult with 0 counts for all entities', async () => {
      const { svc } = makeService();
      const result = await svc.sync(emptyData());
      for (const r of result) {
        expect(r.inserted).toBe(0);
        expect(r.updated).toBe(0);
      }
    });

    it('syncing empty data does NOT call any repo write methods', async () => {
      const saveSpy = vi.fn();
      const upsertSpy = vi.fn();
      const invSaveSpy = vi.fn();

      const catWriter: CategoryWriter = {
        getAll: () => [],
        save: (cat) => { saveSpy(cat); return cat; },
      };
      const prodRepo: GenericUpsertRepo<Product> = {
        getAll: () => new Map(),
        upsert: (_s, item) => upsertSpy(item),
      };
      const invRepo: InventoryRepo = {
        getAll: () => new Map(),
        save: (_s, pid, entries) => invSaveSpy(pid, entries),
      };
      const orderRepo: GenericUpsertRepo<Order> = {
        getAll: () => new Map(),
        upsert: (_s, item) => upsertSpy(item),
      };
      const expenseRepo: GenericUpsertRepo<Expense> = {
        getAll: () => new Map(),
        upsert: (_s, item) => upsertSpy(item),
      };
      const saleCreditRepo: GenericUpsertRepo<SaleCredit> = {
        getAll: () => new Map(),
        upsert: (_s, item) => upsertSpy(item),
      };

      const svc = new DataSynchronizerService(
        STORE_ID,
        catWriter,
        prodRepo,
        invRepo,
        orderRepo,
        expenseRepo,
        saleCreditRepo,
      );

      await svc.sync(emptyData());

      expect(saveSpy).not.toHaveBeenCalled();
      expect(upsertSpy).not.toHaveBeenCalled();
      expect(invSaveSpy).not.toHaveBeenCalled();
    });
  });
});
