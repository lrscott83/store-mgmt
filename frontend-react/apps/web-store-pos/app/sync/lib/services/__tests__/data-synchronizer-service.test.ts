import { beforeEach, describe, it, expect } from 'vitest';
import { DataSynchronizerService } from '../data-synchronizer-service';
import type {
  CategoryImportRepo,
  ProductImportRepo,
  GenericUpsertRepo,
  InventoryImportService,
  ExpenseImportService,
} from '../data-synchronizer-service';
import type { ParsedData } from '../data-serializer-service';
import { Result } from '@store-mgmt/domain';
import type {
  ProductCategory,
  Product,
  InventoryEntry,
  Order,
  Expense,
  SaleCredit,
} from '@store-mgmt/domain';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';

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

/**
 * Dumb, always-succeeding mocks of the narrow `CategoryImportRepo`/`ProductImportRepo`
 * seams — used ONLY for orchestration-focused tests (write order, upsert counts,
 * empty-noop, "other entity types unaffected"). They do NOT reimplement Angular's
 * validation rules (category-exists/barcode/per-category-name/order-shift) — that
 * would re-derive repository business logic inside a test double (the exact anti-
 * pattern the shim used to commit). Tests that exercise VALIDATION or the mutated-
 * reference revert use the REAL `ProductRepository`/`ProductCategoryRepository`
 * (see the "T2" and "T9" describe blocks below), backed by jsdom `localStorage`.
 *
 * `getStorageCategoriesMap`/`getStorageProductsMap` intentionally return the SAME
 * `store` reference every call (never a defensive copy) — mirrors the real repos'
 * own cached-Map semantics, which is what makes the mutated-reference revert work.
 */
function makeCategoryImportRepoMock(
  initial: ProductCategory[] = [],
): CategoryImportRepo & { snapshot(): ProductCategory[] } {
  let store = new Map(initial.map((v) => [v.id, v]));
  return {
    getStorageCategoriesMap: () => store,
    addImportedProductCategory: (category: ProductCategory) => {
      store.set(category.id, category);
      return Result.Success();
    },
    updateImportedProductCategory: (category: ProductCategory) => {
      store.set(category.id, category);
      return Result.Success();
    },
    updateCategories: (categories: Map<string, ProductCategory>) => {
      store = new Map(categories);
    },
    snapshot: () => Array.from(store.values()),
  };
}

function makeProductImportRepoMock(
  initial: Product[] = [],
): ProductImportRepo & { snapshot(): Product[] } {
  let store = new Map(initial.map((v) => [v.id, v]));
  return {
    getStorageProductsMap: () => store,
    addImportedProduct: (product: Product) => {
      store.set(product.id, product);
      return Result.Success();
    },
    updateImportedProduct: (product: Product) => {
      store.set(product.id, product);
      return Result.Success();
    },
    updateProducts: (products: Map<string, Product>) => {
      store = new Map(products);
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

/**
 * Mock of the offline ExpenseOfflineService's import surface. Expenses sync through the
 * SERVICE (Angular parity), so the synchronizer drives `addImportedExpense`/`updateImportedExpense`
 * (both always Result.Success in the port), not a raw repo `upsert`.
 */
function makeExpenseImportServiceMock(
  initial: Expense[] = [],
): ExpenseImportService & { _imported: Expense[] } {
  const store = new Map(initial.map((v) => [v.id, v]));
  const _imported: Expense[] = [];
  return {
    _imported,
    getStorageExpenses: () => Array.from(store.values()),
    addImportedExpense: (expense: Expense) => {
      store.set(expense.id, expense);
      _imported.push(expense);
      return Result.Success();
    },
    updateImportedExpense: (expense: Expense) => {
      store.set(expense.id, expense);
      _imported.push(expense);
      return Result.Success();
    },
  };
}

/**
 * Mock of the InventoryOfflineService import surface. Inventory syncs through the SERVICE
 * (Angular parity): the synchronizer reads via getStorageInventoriesMap and writes via
 * addImportedEntries (new productId bucket) / updateImportedEntries (existing bucket, field
 * merge). `_saves` records every write for assertions.
 */
function makeInventoryImportServiceMock(
  initial: Map<string, InventoryEntry[]> = new Map(),
): InventoryImportService & { _saves: { productId: string; entries: InventoryEntry[] }[] } {
  const store = new Map(initial);
  const _saves: { productId: string; entries: InventoryEntry[] }[] = [];
  return {
    _saves,
    getStorageInventoriesMap: () => new Map(store),
    addImportedEntries: (productId: string, entries: InventoryEntry[]) => {
      store.set(productId, entries);
      _saves.push({ productId, entries });
      return Result.Success();
    },
    updateImportedEntries: (productId: string, entries: InventoryEntry[]) => {
      const current = [...(store.get(productId) ?? [])];
      for (const entry of entries) {
        const idx = current.findIndex((e) => e.id === entry.id);
        if (idx !== -1) current[idx] = { ...current[idx], ...entry };
        else current.push(entry);
      }
      store.set(productId, current);
      _saves.push({ productId, entries });
      return Result.Success();
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
  const catRepo = makeCategoryImportRepoMock(opts?.existingCategories ?? []);
  const prodRepo = makeProductImportRepoMock(opts?.existingProducts ?? []);
  const inventoryService = makeInventoryImportServiceMock(opts?.existingInventory ?? new Map());
  const orderRepo = makeGenericRepo<Order>(opts?.existingOrders ?? []);
  const expenseService = makeExpenseImportServiceMock(opts?.existingExpenses ?? []);
  const saleCreditRepo = makeGenericRepo<SaleCredit>(opts?.existingSaleCredits ?? []);

  const svc = new DataSynchronizerService(
    STORE_ID,
    catRepo,
    prodRepo,
    inventoryService,
    orderRepo,
    expenseService,
    saleCreditRepo,
  );
  return { svc, catRepo, prodRepo, inventoryService, orderRepo, expenseService, saleCreditRepo };
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

      const catRepo: CategoryImportRepo = {
        getStorageCategoriesMap: () => new Map(),
        addImportedProductCategory: (item) => {
          writeOrder.push('category:' + item.id);
          return Result.Success();
        },
        updateImportedProductCategory: (item) => {
          writeOrder.push('category:' + item.id);
          return Result.Success();
        },
        updateCategories: () => {},
      };
      const prodRepo: ProductImportRepo = {
        getStorageProductsMap: () => new Map(),
        addImportedProduct: (item) => {
          writeOrder.push('product:' + item.id);
          return Result.Success();
        },
        updateImportedProduct: (item) => {
          writeOrder.push('product:' + item.id);
          return Result.Success();
        },
        updateProducts: () => {},
      };
      const inventoryService: InventoryImportService = {
        getStorageInventoriesMap: () => new Map(),
        addImportedEntries: (productId) => {
          writeOrder.push('inventory:' + productId);
          return Result.Success();
        },
        updateImportedEntries: (productId) => {
          writeOrder.push('inventory:' + productId);
          return Result.Success();
        },
      };
      const orderRepo: GenericUpsertRepo<Order> = {
        getAll: () => new Map(),
        upsert: (_s, item) => writeOrder.push('order:' + item.id),
      };
      const expenseService: ExpenseImportService = {
        getStorageExpenses: () => [],
        addImportedExpense: (item) => {
          writeOrder.push('expense:' + item.id);
          return Result.Success();
        },
        updateImportedExpense: (item) => {
          writeOrder.push('expense:' + item.id);
          return Result.Success();
        },
      };
      const saleCreditRepo: GenericUpsertRepo<SaleCredit> = {
        getAll: () => new Map(),
        upsert: (_s, item) => writeOrder.push('saleCredit:' + item.id),
      };

      const svc = new DataSynchronizerService(
        STORE_ID,
        catRepo,
        prodRepo,
        inventoryService,
        orderRepo,
        expenseService,
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
  // 3.2: duplicate category/product name → whole-type revert with the LIVE
  // mutated map reference (Gate B — NOT a clean pre-import snapshot). Uses the
  // REAL ProductRepository/ProductCategoryRepository (jsdom localStorage) so the
  // revert-with-mutated-ref quirk is reproduced automatically, exactly as Angular
  // does — driving a mock here would only prove the mock, not the repo.
  // -------------------------------------------------------------------------

  describe('T2 — duplicate name rejected + revert with the mutated reference (not a clean snapshot)', () => {
    const REAL_STORE_ID = 'store-t2-real';

    beforeEach(() => {
      localStorage.clear();
    });

    it('rejects a duplicate category name; revert persists the mutated map (order-shift already applied), not the pre-import snapshot', async () => {
      const categoryRepo = new ProductCategoryRepository(REAL_STORE_ID);
      categoryRepo.addImportedProductCategory(makeCategory('cat-existing', 'Bebidas', 1));

      const productRepo = new ProductRepository(REAL_STORE_ID, categoryRepo);
      const svc = new DataSynchronizerService(
        REAL_STORE_ID,
        categoryRepo,
        productRepo,
        makeInventoryImportServiceMock(),
        makeGenericRepo<Order>(),
        makeExpenseImportServiceMock(),
        makeGenericRepo<SaleCredit>(),
      );

      const data: ParsedData = {
        ...emptyData(),
        categories: [
          // Succeeds first (sorted by order) — its order-shift bumps cat-existing
          // from order 1 to order 2, mutating the SAME cached map in place.
          makeCategory('cat-ok', 'Snacks', 1),
          // Then fails: name now clashes with cat-existing (still named 'Bebidas').
          makeCategory('cat-dup', 'Bebidas', 2),
        ],
      };

      const result = await svc.sync(data);

      expect(result.succeeded).toBe(false);
      const catError = result.errors.find((e) => e.entity === 'categories');
      expect(catError?.code).toBe('ProductCategory.NameExists');
      const catMerge = result.merges.find((m) => m.entity === 'categories');
      expect(catMerge).toEqual({ entity: 'categories', inserted: 0, updated: 0 });

      // Mutated-reference revert (Gate B): cat-ok's successful insert AND the
      // order-shift it triggered on cat-existing both persist — this is NOT the
      // clean pre-import snapshot (which would have only cat-existing at order 1).
      const persisted = new ProductCategoryRepository(REAL_STORE_ID);
      expect(persisted.getProductCategoryById('cat-ok')).toBeDefined();
      expect(persisted.getProductCategoryById('cat-existing')?.order).toBe(2);
      expect(persisted.getProductCategoryById('cat-dup')).toBeUndefined();
    });

    it('rejects a duplicate product name; revert persists the mutated map (order-shift already applied), not the pre-import snapshot', async () => {
      const categoryRepo = new ProductCategoryRepository(REAL_STORE_ID);
      categoryRepo.addImportedProductCategory(makeCategory('cat-1', 'Bebidas', 1));

      const productRepo = new ProductRepository(REAL_STORE_ID, categoryRepo);
      productRepo.addImportedProduct(makeProduct('prod-existing', 'Coca Cola', 1));

      const svc = new DataSynchronizerService(
        REAL_STORE_ID,
        categoryRepo,
        productRepo,
        makeInventoryImportServiceMock(),
        makeGenericRepo<Order>(),
        makeExpenseImportServiceMock(),
        makeGenericRepo<SaleCredit>(),
      );

      const data: ParsedData = {
        ...emptyData(),
        products: [
          // Succeeds first — its order-shift bumps prod-existing from order 1 to 2.
          makeProduct('prod-ok', 'Sprite', 1),
          // Then fails: name clashes with prod-existing (same category, still 'Coca Cola').
          makeProduct('prod-dup', 'Coca Cola', 2),
        ],
      };

      const result = await svc.sync(data);

      expect(result.succeeded).toBe(false);
      const prodError = result.errors.find((e) => e.entity === 'products');
      expect(prodError?.code).toBe('Product.NameExists');

      const persisted = new ProductRepository(REAL_STORE_ID, categoryRepo);
      expect(persisted.getProductById('prod-ok')).toBeDefined();
      expect(persisted.getProductById('prod-existing')?.order).toBe(2);
      expect(persisted.getProductById('prod-dup')).toBeUndefined();
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
      expect(catRepo.snapshot()).toHaveLength(2);
    });

    it('does not revert other entity types when categories fail', async () => {
      const categoryRepo = new ProductCategoryRepository(REAL_STORE_ID);
      categoryRepo.addImportedProductCategory(makeCategory('cat-existing', 'Bebidas', 1));
      const orderRepo = makeGenericRepo<Order>();

      const svc = new DataSynchronizerService(
        REAL_STORE_ID,
        categoryRepo,
        new ProductRepository(REAL_STORE_ID, categoryRepo),
        makeInventoryImportServiceMock(),
        orderRepo,
        makeExpenseImportServiceMock(),
        makeGenericRepo<SaleCredit>(),
      );

      const data: ParsedData = {
        ...emptyData(),
        categories: [makeCategory('cat-dup', 'Bebidas', 1)],
        orders: [makeOrder('order-1')],
      };
      const result = await svc.sync(data);
      expect(result.succeeded).toBe(false);
      // Orders are unaffected by the categories failure — sync continues.
      expect(orderRepo.getAll(REAL_STORE_ID).has('order-1')).toBe(true);
      const orderMerge = result.merges.find((m) => m.entity === 'orders');
      expect(orderMerge).toEqual({ entity: 'orders', inserted: 1, updated: 0 });
    });
  });

  // -------------------------------------------------------------------------
  // Full Angular validation parity (product-sync-import-validation-parity):
  // category-exists, barcode-uniqueness, per-category name-uniqueness, and
  // order-shift for products; name-uniqueness + order-shift for categories.
  // Uses the REAL repositories — these rules live in ProductRepository/
  // ProductCategoryRepository, not reimplementable in a test mock.
  // -------------------------------------------------------------------------

  describe('T9 — full Angular validation parity via real repositories', () => {
    const REAL_STORE_ID = 'store-t9-real';

    beforeEach(() => {
      localStorage.clear();
    });

    function makeRealPair(): { categoryRepo: ProductCategoryRepository; productRepo: ProductRepository } {
      const categoryRepo = new ProductCategoryRepository(REAL_STORE_ID);
      const productRepo = new ProductRepository(REAL_STORE_ID, categoryRepo);
      return { categoryRepo, productRepo };
    }

    function makeSvc(categoryRepo: ProductCategoryRepository, productRepo: ProductRepository) {
      return new DataSynchronizerService(
        REAL_STORE_ID,
        categoryRepo,
        productRepo,
        makeInventoryImportServiceMock(),
        makeGenericRepo<Order>(),
        makeExpenseImportServiceMock(),
        makeGenericRepo<SaleCredit>(),
      );
    }

    it('rejects an imported product whose categoryId does not exist (ProductCategory.NotExists)', async () => {
      const { categoryRepo, productRepo } = makeRealPair();
      const svc = makeSvc(categoryRepo, productRepo);

      const data: ParsedData = {
        ...emptyData(),
        products: [
          { ...makeProduct('prod-1', 'Cola', 1), categoryId: 'cat-missing' },
        ],
      };

      const result = await svc.sync(data);

      expect(result.succeeded).toBe(false);
      const err = result.errors.find((e) => e.entity === 'products');
      expect(err?.code).toBe('ProductCategory.NotExists');
      expect(productRepo.getProductById('prod-1')).toBeUndefined();
    });

    it('rejects an imported product with a barcode already used by a stored product (Product.BarcodeExists)', async () => {
      // NOTE: Angular's (and this repo's already-ported) `addImportedProduct` never
      // forwards `barcode` to `addProductData` — only `updateImportedProduct` does
      // (product.repository.ts:173-185 vs :244-259). Barcode-uniqueness on import is
      // therefore only reachable via the UPDATE path (an existing id re-imported with a
      // new/changed barcode), never via the ADD path (a brand-new id). This is pre-
      // existing `ProductRepository` behavior, unrelated to and out of scope for this
      // change (no repository contract changes) — the fixture below exercises the
      // REACHABLE path, not a new/altered one.
      const { categoryRepo, productRepo } = makeRealPair();
      categoryRepo.addImportedProductCategory(makeCategory('cat-1', 'Bebidas', 1));
      // prod-a is created via the normal (non-import) path, which DOES persist barcode.
      productRepo.addProductData('prod-a', 'cat-1', 'Coca Cola', 1000, 'biz-1', 1, true, true, false, '7501234');
      productRepo.addProductData('prod-b', 'cat-1', 'Sprite', 1000, 'biz-1', 2, true, true, false, '999999');
      const svc = makeSvc(categoryRepo, productRepo);

      const data: ParsedData = {
        ...emptyData(),
        // Re-imports the EXISTING prod-b (update path) with a barcode clashing with prod-a.
        products: [{ ...makeProduct('prod-b', 'Sprite', 2), barcode: '7501234' }],
      };

      const result = await svc.sync(data);

      expect(result.succeeded).toBe(false);
      const err = result.errors.find((e) => e.entity === 'products');
      expect(err?.code).toBe('Product.BarcodeExists');
      expect(productRepo.getProductById('prod-b')?.barcode).toBe('999999');
    });

    it('rejects a duplicate product name within the SAME category (Product.NameExists)', async () => {
      const { categoryRepo, productRepo } = makeRealPair();
      categoryRepo.addImportedProductCategory(makeCategory('cat-1', 'Bebidas', 1));
      productRepo.addImportedProduct(makeProduct('prod-existing', 'Cola', 1));
      const svc = makeSvc(categoryRepo, productRepo);

      const data: ParsedData = {
        ...emptyData(),
        products: [makeProduct('prod-new', 'Cola', 2)],
      };

      const result = await svc.sync(data);

      expect(result.succeeded).toBe(false);
      const err = result.errors.find((e) => e.entity === 'products');
      expect(err?.code).toBe('Product.NameExists');
    });

    it('allows the same product name across DIFFERENT categories (name-uniqueness is per-category, not global)', async () => {
      const { categoryRepo, productRepo } = makeRealPair();
      categoryRepo.addImportedProductCategory(makeCategory('cat-1', 'Bebidas', 1));
      categoryRepo.addImportedProductCategory(makeCategory('cat-2', 'Snacks', 2));
      productRepo.addImportedProduct(makeProduct('prod-existing', 'Cola', 1));
      const svc = makeSvc(categoryRepo, productRepo);

      const data: ParsedData = {
        ...emptyData(),
        products: [{ ...makeProduct('prod-new', 'Cola', 1), categoryId: 'cat-2', categoryName: 'Snacks' }],
      };

      const result = await svc.sync(data);

      expect(result.succeeded).toBe(true);
      expect(productRepo.getProductById('prod-new')).toBeDefined();
    });

    it('shifts order for existing products in the same category when an imported product lands at their order', async () => {
      const { categoryRepo, productRepo } = makeRealPair();
      categoryRepo.addImportedProductCategory(makeCategory('cat-1', 'Bebidas', 1));
      productRepo.addImportedProduct(makeProduct('p1', 'Cola', 1));
      productRepo.addImportedProduct(makeProduct('p2', 'Sprite', 2));
      productRepo.addImportedProduct(makeProduct('p3', 'Fanta', 3));
      const svc = makeSvc(categoryRepo, productRepo);

      const data: ParsedData = {
        ...emptyData(),
        products: [makeProduct('p-new', 'Pepsi', 2)],
      };

      const result = await svc.sync(data);

      expect(result.succeeded).toBe(true);
      const byOrder = productRepo
        .getProductsByCategoryId('cat-1')
        .reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.id]: p.order }), {});
      expect(byOrder).toEqual({ p1: 1, 'p-new': 2, p2: 3, p3: 4 });
    });

    it('rejects a duplicate category name (ProductCategory.NameExists)', async () => {
      const { categoryRepo, productRepo } = makeRealPair();
      categoryRepo.addImportedProductCategory(makeCategory('cat-existing', 'Bebidas', 1));
      const svc = makeSvc(categoryRepo, productRepo);

      const data: ParsedData = {
        ...emptyData(),
        categories: [makeCategory('cat-new', 'Bebidas', 2)],
      };

      const result = await svc.sync(data);

      expect(result.succeeded).toBe(false);
      const err = result.errors.find((e) => e.entity === 'categories');
      expect(err?.code).toBe('ProductCategory.NameExists');
    });

    it('shifts order for existing categories when an imported category lands at their order', async () => {
      const { categoryRepo, productRepo } = makeRealPair();
      categoryRepo.addImportedProductCategory(makeCategory('c1', 'Bebidas', 1));
      categoryRepo.addImportedProductCategory(makeCategory('c2', 'Snacks', 2));
      categoryRepo.addImportedProductCategory(makeCategory('c3', 'Limpieza', 3));
      const svc = makeSvc(categoryRepo, productRepo);

      const data: ParsedData = {
        ...emptyData(),
        categories: [makeCategory('c-new', 'Lacteos', 2)],
      };

      const result = await svc.sync(data);

      expect(result.succeeded).toBe(true);
      const byOrder = categoryRepo
        .getProductCategories()
        .reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.id]: c.order }), {});
      expect(byOrder).toEqual({ c1: 1, 'c-new': 2, c2: 3, c3: 4 });
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
      const { svc, inventoryService } = makeService();
      const originalAdd = inventoryService.addImportedEntries.bind(inventoryService);
      inventoryService.addImportedEntries = (productId: string, entries: InventoryEntry[]) => {
        if (productId === 'prod-bad') throw new Error('storage exploded');
        return originalAdd(productId, entries);
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
      expect(inventoryService._saves.some((s) => s.productId === 'prod-ok')).toBe(true);
    });

    it('synchronizeFiles/sync aggregates errors across entity types and continues (not abort-on-first)', async () => {
      const { svc, orderRepo, expenseService } = makeService();
      orderRepo.upsert = () => {
        throw new Error('order storage exploded');
      };
      expenseService.addImportedExpense = () => {
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
  // Per-type error codes — Angular's copy-paste bug is FIXED here, not replicated.
  // Angular's synchronizeExpenses/synchronizeSaleCredits both wrongly emit
  // OrdersUnexpectedError. Error codes are internal (never serialized into the
  // export .zip), so correcting them does not break format interop. Policy:
  // frontend-parity-audit/angular-bugs-policy (engram #648).
  // -------------------------------------------------------------------------

  describe('T3b — per-type error codes (Angular bug fixed, not replicated)', () => {
    it('emits ExpensesUnexpectedError (not OrdersUnexpectedError) when an expense write fails', async () => {
      const { svc, expenseService } = makeService();
      expenseService.addImportedExpense = () => {
        throw new Error('expense storage exploded');
      };
      const data: ParsedData = { ...emptyData(), expenses: [makeExpense('exp-1')] };

      const result = await svc.sync(data);

      const err = result.errors.find((e) => e.entity === 'expenses');
      expect(err?.code).toBe('Synchronizer.ExpensesUnexpectedError');
    });

    it('emits SaleCreditsUnexpectedError (not OrdersUnexpectedError) when a sale-credit write fails', async () => {
      const { svc, saleCreditRepo } = makeService();
      saleCreditRepo.upsert = () => {
        throw new Error('sale-credit storage exploded');
      };
      const data: ParsedData = { ...emptyData(), saleCredits: [makeSaleCredit('sc-1')] };

      const result = await svc.sync(data);

      const err = result.errors.find((e) => e.entity === 'saleCredits');
      expect(err?.code).toBe('Synchronizer.SaleCreditsUnexpectedError');
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
      const remaining = catRepo.snapshot();
      expect(remaining.some((c) => c.id === 'cat-local')).toBe(true);
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
      const { svc, catRepo, prodRepo, inventoryService, orderRepo, expenseService, saleCreditRepo } =
        makeService();
      let writes = 0;
      catRepo.addImportedProductCategory = () => {
        writes++;
        return Result.Success();
      };
      catRepo.updateImportedProductCategory = () => {
        writes++;
        return Result.Success();
      };
      prodRepo.addImportedProduct = () => {
        writes++;
        return Result.Success();
      };
      prodRepo.updateImportedProduct = () => {
        writes++;
        return Result.Success();
      };
      inventoryService.addImportedEntries = () => {
        writes++;
        return Result.Success();
      };
      inventoryService.updateImportedEntries = () => {
        writes++;
        return Result.Success();
      };
      orderRepo.upsert = () => {
        writes++;
      };
      expenseService.addImportedExpense = () => {
        writes++;
        return Result.Success();
      };
      expenseService.updateImportedExpense = () => {
        writes++;
        return Result.Success();
      };
      saleCreditRepo.upsert = () => {
        writes++;
      };

      await svc.sync(emptyData());
      expect(writes).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Expense import goes through the SERVICE, not a raw repo (Angular parity).
  // Angular `synchronizeExpenses` calls expenseService.addImportedExpense for a
  // NEW expense and updateImportedExpense for an EXISTING one; the synchronizer
  // never touches the expense repository directly.
  // -------------------------------------------------------------------------

  describe('T7 — expense import routes through the offline service (Angular parity)', () => {
    it('calls addImportedExpense for a new expense and updateImportedExpense for an existing one', async () => {
      const existing = makeExpense('exp-existing');
      const expenseService = makeExpenseImportServiceMock([existing]);
      const added: string[] = [];
      const updated: string[] = [];
      expenseService.addImportedExpense = (e) => {
        added.push(e.id);
        return Result.Success();
      };
      expenseService.updateImportedExpense = (e) => {
        updated.push(e.id);
        return Result.Success();
      };

      const svc = new DataSynchronizerService(
        STORE_ID,
        makeCategoryImportRepoMock(),
        makeProductImportRepoMock(),
        makeInventoryImportServiceMock(),
        makeGenericRepo<Order>(),
        expenseService,
        makeGenericRepo<SaleCredit>(),
      );

      const result = await svc.sync({
        ...emptyData(),
        expenses: [makeExpense('exp-new'), existing],
      });

      expect(added).toEqual(['exp-new']);
      expect(updated).toEqual(['exp-existing']);
      const merge = result.merges.find((m) => m.entity === 'expenses');
      expect(merge).toEqual({ entity: 'expenses', inserted: 1, updated: 1 });
    });
  });

  // -------------------------------------------------------------------------
  // Inventory import goes through the SERVICE, not a raw repo (Angular parity).
  // Angular `synchronizeInventoryEntries` reads getStorageInventoriesMap, then calls
  // addImportedEntries for a NEW productId bucket / updateImportedEntries for an EXISTING
  // one — the synchronizer never touches the inventory repository directly, and the
  // service owns the field-level merge (no wholesale entry replacement).
  // -------------------------------------------------------------------------

  describe('T8 — inventory import routes through the offline service (Angular parity)', () => {
    it('calls addImportedEntries for a new productId and updateImportedEntries for an existing one', async () => {
      const existingMap = new Map<string, InventoryEntry[]>([
        ['prod-existing', [makeInventoryEntry('inv-existing', 'prod-existing')]],
      ]);
      const inventoryService = makeInventoryImportServiceMock(existingMap);
      const addedProducts: string[] = [];
      const updatedProducts: string[] = [];
      inventoryService.addImportedEntries = (productId) => {
        addedProducts.push(productId);
        return Result.Success();
      };
      inventoryService.updateImportedEntries = (productId) => {
        updatedProducts.push(productId);
        return Result.Success();
      };

      const svc = new DataSynchronizerService(
        STORE_ID,
        makeCategoryImportRepoMock(),
        makeProductImportRepoMock(),
        inventoryService,
        makeGenericRepo<Order>(),
        makeExpenseImportServiceMock(),
        makeGenericRepo<SaleCredit>(),
      );

      const result = await svc.sync({
        ...emptyData(),
        inventoryEntries: [
          makeInventoryEntry('inv-new', 'prod-new'),
          makeInventoryEntry('inv-existing', 'prod-existing'),
        ],
      });

      expect(addedProducts).toEqual(['prod-new']);
      expect(updatedProducts).toEqual(['prod-existing']);
      const merge = result.merges.find((m) => m.entity === 'inventoryEntries');
      expect(merge).toEqual({ entity: 'inventoryEntries', inserted: 1, updated: 1 });
    });
  });
});
