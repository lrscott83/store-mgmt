import { describe, it, expect } from 'vitest';
import { DataSynchronizerService } from '../data-synchronizer-service';
import type {
  NameUniqueRepo,
  GenericUpsertRepo,
  InventoryRepo,
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

function makeCategory(id: string, name: string, order = 1): ProductCategory {
  return { id, name, order, isActive: true };
}

function makeProduct(id: string, name: string, order = 1): Product {
  return {
    id,
    name,
    categoryId: 'cat-1',
    categoryName: 'Bebidas',
    price: 1000,
    order,
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

function makeNameUniqueRepo<T extends { id: string; name: string }>(
  initial: T[] = [],
): NameUniqueRepo<T> & { snapshot(): T[] } {
  let store = new Map(initial.map((v) => [v.id, v]));
  return {
    getAll: (_storeId: string) => new Map(store),
    upsert: (_storeId: string, item: T) => {
      store.set(item.id, item);
    },
    save: (_storeId: string, items: Map<string, T>) => {
      store = new Map(items);
    },
    snapshot: () => Array.from(store.values()),
  };
}

function makeGenericRepo<T extends { id: string }>(
  initial: T[] = [],
): GenericUpsertRepo<T> & { _upserted: T[] } {
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
}) {
  const catRepo = makeNameUniqueRepo<ProductCategory>(opts?.existingCategories ?? []);
  const prodRepo = makeNameUniqueRepo<Product>(opts?.existingProducts ?? []);
  const invRepo = makeInventoryRepoMock(opts?.existingInventory ?? new Map());
  const orderRepo = makeGenericRepo<Order>(opts?.existingOrders ?? []);
  const expenseRepo = makeGenericRepo<Expense>(opts?.existingExpenses ?? []);
  const saleCreditRepo = makeGenericRepo<SaleCredit>(opts?.existingSaleCredits ?? []);

  const svc = new DataSynchronizerService(
    STORE_ID,
    catRepo,
    prodRepo,
    invRepo,
    orderRepo,
    expenseRepo,
    saleCreditRepo,
  );
  return { svc, catRepo, prodRepo, invRepo, orderRepo, expenseRepo, saleCreditRepo };
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

describe('DataSynchronizerService', () => {
  // -------------------------------------------------------------------------
  // 3.1: categories.json processed first regardless of zip entry order
  // -------------------------------------------------------------------------

  describe('T1 — categories processed first', () => {
    it('writes categories before products, inventory, orders, expenses, saleCredits', async () => {
      const writeOrder: string[] = [];

      const catRepo: NameUniqueRepo<ProductCategory> = {
        getAll: () => new Map(),
        upsert: (_s, item) => writeOrder.push('category:' + item.id),
        save: () => {},
      };
      const prodRepo: NameUniqueRepo<Product> = {
        getAll: () => new Map(),
        upsert: (_s, item) => writeOrder.push('product:' + item.id),
        save: () => {},
      };
      const invRepo: InventoryRepo = {
        getAll: () => new Map(),
        save: (_s, productId) => writeOrder.push('inventory:' + productId),
      };
      const orderRepo: GenericUpsertRepo<Order> = {
        getAll: () => new Map(),
        upsert: (_s, item) => writeOrder.push('order:' + item.id),
      };
      const expenseRepo: GenericUpsertRepo<Expense> = {
        getAll: () => new Map(),
        upsert: (_s, item) => writeOrder.push('expense:' + item.id),
      };
      const saleCreditRepo: GenericUpsertRepo<SaleCredit> = {
        getAll: () => new Map(),
        upsert: (_s, item) => writeOrder.push('saleCredit:' + item.id),
      };

      const svc = new DataSynchronizerService(
        STORE_ID,
        catRepo,
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

      expect(writeOrder).toEqual([
        'category:cat-1',
        'product:prod-1',
        'inventory:prod-1',
        'order:order-1',
        'expense:exp-1',
        'saleCredit:sc-1',
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // 3.2: duplicate category/product name → whole-type revert + typed error
  // -------------------------------------------------------------------------

  describe('T2 — duplicate name rejected + whole-type revert', () => {
    it('rejects a duplicate category name and reverts categories to their pre-import snapshot', async () => {
      const existing = makeCategory('cat-existing', 'Bebidas', 1);
      const { svc, catRepo } = makeService({ existingCategories: [existing] });

      const data: ParsedData = {
        ...emptyData(),
        categories: [
          makeCategory('cat-ok', 'Snacks', 1),
          makeCategory('cat-dup', 'Bebidas', 2), // name clashes with cat-existing
        ],
      };

      const result = await svc.sync(data);

      expect(result.succeeded).toBe(false);
      const catError = result.errors.find((e) => e.entity === 'categories');
      expect(catError).toBeDefined();
      expect(catError?.code).toBe('ProductCategory.NameExists');

      // Whole-type revert: categories map is back to its pre-import state —
      // NOT even cat-ok (which came before the clash, sorted by order) persists.
      const remaining = catRepo.getAll(STORE_ID);
      expect(remaining.size).toBe(1);
      expect(remaining.has('cat-existing')).toBe(true);
      expect(remaining.has('cat-ok')).toBe(false);
      expect(remaining.has('cat-dup')).toBe(false);

      const catMerge = result.merges.find((m) => m.entity === 'categories');
      expect(catMerge).toEqual({ entity: 'categories', inserted: 0, updated: 0 });
    });

    it('rejects a duplicate product name and reverts products to their pre-import snapshot', async () => {
      const existing = makeProduct('prod-existing', 'Coca Cola', 1);
      const { svc, prodRepo } = makeService({ existingProducts: [existing] });

      const data: ParsedData = {
        ...emptyData(),
        products: [makeProduct('prod-dup', 'Coca Cola', 1)],
      };

      const result = await svc.sync(data);

      expect(result.succeeded).toBe(false);
      const prodError = result.errors.find((e) => e.entity === 'products');
      expect(prodError?.code).toBe('Product.NameExists');

      const remaining = prodRepo.getAll(STORE_ID);
      expect(remaining.size).toBe(1);
      expect(remaining.has('prod-existing')).toBe(true);
      expect(remaining.has('prod-dup')).toBe(false);
    });

    it('processes categories sorted by order before checking for name clashes', async () => {
      const { svc, catRepo } = makeService();
      const data: ParsedData = {
        ...emptyData(),
        // Out-of-order on purpose: order=2 item appears first in the array.
        categories: [makeCategory('cat-b', 'Second', 2), makeCategory('cat-a', 'First', 1)],
      };
      const result = await svc.sync(data);
      expect(result.succeeded).toBe(true);
      const remaining = catRepo.getAll(STORE_ID);
      expect(remaining.size).toBe(2);
    });

    it('does not revert other entity types when categories fail', async () => {
      const { svc, orderRepo } = makeService({
        existingCategories: [makeCategory('cat-existing', 'Bebidas', 1)],
      });
      const data: ParsedData = {
        ...emptyData(),
        categories: [makeCategory('cat-dup', 'Bebidas', 1)],
        orders: [makeOrder('order-1')],
      };
      const result = await svc.sync(data);
      expect(result.succeeded).toBe(false);
      // Orders are unaffected by the categories failure — sync continues.
      expect(orderRepo.getAll(STORE_ID).has('order-1')).toBe(true);
      const orderMerge = result.merges.find((m) => m.entity === 'orders');
      expect(orderMerge).toEqual({ entity: 'orders', inserted: 1, updated: 0 });
    });
  });

  // -------------------------------------------------------------------------
  // 3.3: inventory/orders/expenses/saleCredits — break-only, no revert;
  // synchronizeFiles aggregates errors across files and continues.
  // -------------------------------------------------------------------------

  describe('T3 — break-only (no revert) for orders/expenses/saleCredits/inventory', () => {
    it('breaks the orders loop on the first failing item but keeps prior successful writes', async () => {
      const { svc, orderRepo } = makeService();
      const failing = makeOrder('order-bad');
      const ok1 = makeOrder('order-ok-1');
      const ok2 = makeOrder('order-ok-2');

      // upsert throws for the "bad" order id — simulates an unexpected
      // storage failure (Angular: caught, entity-level UnexpectedError).
      const originalUpsert = orderRepo.upsert.bind(orderRepo);
      orderRepo.upsert = (storeId: string, item: Order) => {
        if (item.id === 'order-bad') throw new Error('storage exploded');
        originalUpsert(storeId, item);
      };

      const data: ParsedData = {
        ...emptyData(),
        orders: [ok1, failing, ok2],
      };

      const result = await svc.sync(data);

      expect(result.succeeded).toBe(false);
      const orderError = result.errors.find((e) => e.entity === 'orders');
      expect(orderError).toBeDefined();
      expect(orderError?.code).toBe('Synchronizer.OrdersUnexpectedError');

      // Break-only: ok1 (written before the failure) persists, ok2 (after
      // the break) does NOT — no revert of ok1's already-applied write.
      const remaining = orderRepo.getAll(STORE_ID);
      expect(remaining.has('order-ok-1')).toBe(true);
      expect(remaining.has('order-ok-2')).toBe(false);
    });

    it('breaks the inventory loop on first failure without reverting prior product groups', async () => {
      const { svc, invRepo } = makeService();
      const originalSave = invRepo.save.bind(invRepo);
      invRepo.save = (storeId: string, productId: string, entries: InventoryEntry[]) => {
        if (productId === 'prod-bad') throw new Error('storage exploded');
        originalSave(storeId, productId, entries);
      };

      const data: ParsedData = {
        ...emptyData(),
        inventoryEntries: [
          makeInventoryEntry('inv-ok', 'prod-ok'),
          makeInventoryEntry('inv-bad', 'prod-bad'),
        ],
      };

      const result = await svc.sync(data);
      expect(result.succeeded).toBe(false);
      const invError = result.errors.find((e) => e.entity === 'inventoryEntries');
      expect(invError?.code).toBe('Synchronizer.InventoryUnexpectedError');
      expect(invRepo._saves.some((s) => s.productId === 'prod-ok')).toBe(true);
    });

    it('synchronizeFiles/sync aggregates errors across entity types and continues (not abort-on-first)', async () => {
      const { svc, orderRepo, expenseRepo } = makeService();
      orderRepo.upsert = () => {
        throw new Error('order storage exploded');
      };
      expenseRepo.upsert = () => {
        throw new Error('expense storage exploded');
      };

      const data: ParsedData = {
        ...emptyData(),
        orders: [makeOrder('order-1')],
        expenses: [makeExpense('exp-1')],
        saleCredits: [makeSaleCredit('sc-1')],
      };

      const result = await svc.sync(data);

      expect(result.succeeded).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors.map((e) => e.entity).sort()).toEqual(['expenses', 'orders']);
      // saleCredits (after the failing types) still gets processed.
      const scMerge = result.merges.find((m) => m.entity === 'saleCredits');
      expect(scMerge).toEqual({ entity: 'saleCredits', inserted: 1, updated: 0 });
    });
  });

  // -------------------------------------------------------------------------
  // Non-destructive merge (upsert-by-id) — unchanged behavior, still covered
  // -------------------------------------------------------------------------

  describe('T4 — merge upsert-by-id (non-destructive)', () => {
    it('inserts new categories not present in local store', async () => {
      const { svc } = makeService({ existingCategories: [] });
      const data: ParsedData = {
        ...emptyData(),
        categories: [makeCategory('cat-new', 'New Cat')],
      };
      const result = await svc.sync(data);
      const catResult = result.merges.find((r) => r.entity === 'categories');
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
      const catResult = result.merges.find((r) => r.entity === 'categories');
      expect(catResult?.inserted).toBe(0);
      expect(catResult?.updated).toBe(1);
    });

    it('preserves local category not present in import data (non-destructive)', async () => {
      const local = makeCategory('cat-local', 'Local Only');
      const { svc, catRepo } = makeService({ existingCategories: [local] });
      const data: ParsedData = {
        ...emptyData(),
        categories: [makeCategory('cat-new', 'From File')],
      };
      await svc.sync(data);
      const remaining = catRepo.getAll(STORE_ID);
      expect(remaining.has('cat-local')).toBe(true);
    });

    it('returns a merge entry for all 6 entities', async () => {
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
      const entities = result.merges.map((r) => r.entity);
      expect(entities).toEqual([
        'categories',
        'products',
        'inventoryEntries',
        'orders',
        'expenses',
        'saleCredits',
      ]);
    });

    it('second sync of same data results in inserted:0 for all entities (idempotent)', async () => {
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

      const result = await svc.sync(data);
      for (const r of result.merges) {
        expect(r.inserted).toBe(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Empty/minimal data — graceful no-op
  // -------------------------------------------------------------------------

  describe('T5 — sync handles empty data gracefully', () => {
    it('syncing empty data returns a succeeded result with 0 counts for all entities', async () => {
      const { svc } = makeService();
      const result = await svc.sync(emptyData());
      expect(result.succeeded).toBe(true);
      expect(result.errors).toEqual([]);
      for (const r of result.merges) {
        expect(r.inserted).toBe(0);
        expect(r.updated).toBe(0);
      }
    });

    it('syncing empty data does NOT call any repo write methods', async () => {
      const { svc, catRepo, prodRepo, invRepo, orderRepo, expenseRepo, saleCreditRepo } =
        makeService();
      let writes = 0;
      catRepo.upsert = () => {
        writes++;
      };
      prodRepo.upsert = () => {
        writes++;
      };
      invRepo.save = () => {
        writes++;
      };
      orderRepo.upsert = () => {
        writes++;
      };
      expenseRepo.upsert = () => {
        writes++;
      };
      saleCreditRepo.upsert = () => {
        writes++;
      };

      await svc.sync(emptyData());
      expect(writes).toBe(0);
    });
  });
});
