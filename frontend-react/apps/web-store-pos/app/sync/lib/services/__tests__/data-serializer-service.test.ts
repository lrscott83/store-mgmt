import { describe, it, expect, beforeEach } from 'vitest';
import { BlobReader, TextWriter, ZipReader } from '@zip.js/zip.js';
import type { Entry } from '@zip.js/zip.js';
import {
  DataSerializerService,
  WrongPasswordError,
  CorruptFileError,
} from '../data-serializer-service';
import type {
  InventoryReader,
  OrderReader,
  ExpenseReader,
  SaleCreditReader,
} from '../data-serializer-service';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
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
const OTHER_STORE_ID = 'store-test-02';
const PASSWORD = 'hunter2-correct-horse';
const WRONG_PASSWORD = 'not-the-right-password!';

const ANGULAR_ENTRY_NAMES = [
  'categories.json',
  'products.json',
  'inventory-entries.json',
  'orders.json',
  'expenses.json',
  'sale-credits.json',
];

const mockCategory: ProductCategory = {
  id: 'cat-1',
  name: 'Bebidas',
  order: 1,
  isActive: true,
};

const mockProduct: Product = {
  id: 'prod-1',
  name: 'Coca Cola 500ml',
  categoryId: 'cat-1',
  categoryName: 'Bebidas',
  price: 1500,
  order: 1,
  availableToSale: true,
  discountFromInvantory: false,
  businessId: 'biz-1',
  isActive: true,
  createdDate: new Date('2024-01-01T00:00:00.000Z'),
  updatedDate: new Date('2024-01-02T00:00:00.000Z'),
  createdByName: 'admin',
};

const mockInventoryEntry: InventoryEntry = {
  id: 'inv-1',
  productId: 'prod-1',
  categoryId: 'cat-1',
  quantity: 100,
  available: 90,
  costPrice: 800,
  date: new Date('2024-01-01T00:00:00.000Z'),
  order: 1,
  isActive: true,
  createdDate: new Date('2024-01-01T00:00:00.000Z'),
  updatedDate: new Date('2024-01-02T00:00:00.000Z'),
  createdByName: 'admin',
};

const mockOrder: Order = {
  id: 'order-1',
  orderItems: [],
  total: 3000,
  itemsCount: 2,
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

const mockExpense: Expense = {
  id: 'exp-1',
  type: 0 as Expense['type'],
  total: 500,
  date: new Date('2024-06-01T00:00:00.000Z'),
  paymentType: 0 as Expense['paymentType'],
  note: 'Test expense',
  isActive: true,
  createdDate: new Date('2024-06-01T00:00:00.000Z'),
  updatedDate: new Date('2024-06-01T00:00:00.000Z'),
  createdByName: 'admin',
};

const mockSaleCredit: SaleCredit = {
  id: 'credit-1',
  orderId: 'order-1',
  client: 'Juan',
  total: 3000,
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

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeInventoryMap(entries: InventoryEntry[]): Map<string, InventoryEntry[]> {
  const map = new Map<string, InventoryEntry[]>();
  for (const e of entries) {
    const arr = map.get(e.productId) ?? [];
    arr.push(e);
    map.set(e.productId, arr);
  }
  return map;
}

/**
 * Categories/products are now read by `DataSerializerService` straight from
 * the repository's raw stored JSON (Flag #2 re-point — no more in-memory
 * `getAll()` reader mocks), so fixtures seed real `localStorage` in the exact
 * `BaseRepository`/repo-layer map-entries shape, then a real
 * `ProductCategoryRepository`/`ProductRepository` instance is constructed on
 * top — mirroring how `import.tsx`/`export.tsx` build the serializer.
 */
function seedCategories(storeId: string, categories: ProductCategory[]): void {
  const entries = categories.map((c) => [c.id, c] as [string, ProductCategory]);
  localStorage.setItem(`lizoft.store-product-categories-${storeId}`, JSON.stringify(entries));
}

function seedProducts(storeId: string, products: Product[]): void {
  const entries = products.map((p) => [p.id, p] as [string, Product]);
  localStorage.setItem(`lizoft.store-products-${storeId}`, JSON.stringify(entries));
}

function makeService(
  overrides?: {
    categories?: ProductCategory[];
    products?: Product[];
    inventoryEntries?: InventoryEntry[];
    orders?: Order[];
    expenses?: Expense[];
    saleCredits?: SaleCredit[];
  },
  storeId: string = STORE_ID,
): DataSerializerService {
  const cats = overrides?.categories ?? [mockCategory];
  const prods = overrides?.products ?? [mockProduct];
  const inv = overrides?.inventoryEntries ?? [mockInventoryEntry];
  const ords = overrides?.orders ?? [mockOrder];
  const exps = overrides?.expenses ?? [mockExpense];
  const creds = overrides?.saleCredits ?? [mockSaleCredit];

  seedCategories(storeId, cats);
  seedProducts(storeId, prods);
  const categoryRepository = new ProductCategoryRepository(storeId);
  const productRepository = new ProductRepository(storeId, categoryRepository);
  const inventoryReader: InventoryReader = {
    getAll: (_storeId: string) => makeInventoryMap(inv),
  };
  const orderReader: OrderReader = { getAll: () => ords };
  const expenseReader: ExpenseReader = { getAll: () => exps };
  const saleCreditReader: SaleCreditReader = { getAll: () => creds };

  return new DataSerializerService(
    storeId,
    categoryRepository,
    productRepository,
    inventoryReader,
    orderReader,
    expenseReader,
    saleCreditReader,
  );
}

/**
 * Builds a `DataSerializerService` for a store whose categories/products
 * `localStorage` keys were NEVER written — the real "empty/never-synced
 * store" case (as opposed to `makeService({ categories: [], products: [] })`,
 * which persists a valid empty array). `getCategoriesJson()`/
 * `getProductsJson()` return `null` here.
 */
function makeServiceWithUnseededCategoriesAndProducts(
  overrides?: {
    inventoryEntries?: InventoryEntry[];
    orders?: Order[];
    expenses?: Expense[];
    saleCredits?: SaleCredit[];
  },
  storeId: string = STORE_ID,
): DataSerializerService {
  const inv = overrides?.inventoryEntries ?? [mockInventoryEntry];
  const ords = overrides?.orders ?? [mockOrder];
  const exps = overrides?.expenses ?? [mockExpense];
  const creds = overrides?.saleCredits ?? [mockSaleCredit];

  const categoryRepository = new ProductCategoryRepository(storeId);
  const productRepository = new ProductRepository(storeId, categoryRepository);
  const inventoryReader: InventoryReader = {
    getAll: (_storeId: string) => makeInventoryMap(inv),
  };
  const orderReader: OrderReader = { getAll: () => ords };
  const expenseReader: ExpenseReader = { getAll: () => exps };
  const saleCreditReader: SaleCreditReader = { getAll: () => creds };

  return new DataSerializerService(
    storeId,
    categoryRepository,
    productRepository,
    inventoryReader,
    orderReader,
    expenseReader,
    saleCreditReader,
  );
}

/**
 * Reads the raw zip entries with zip.js directly, given an already-derived
 * password (e.g. `PASSWORD + STORE_ID`). Used to assert the Angular-compatible
 * entry names/shapes independently of DataSerializerService.import().
 */
async function readRawEntries(payload: Uint8Array, derivedPassword: string) {
  const blob = new Blob([payload]);
  const zipReader = new ZipReader(new BlobReader(blob), { password: derivedPassword });
  const entries = await zipReader.getEntries();
  await zipReader.close();
  return entries;
}

/** Narrows an `Entry` (DirectoryEntry | FileEntry) and reads its text content. */
async function getEntryText(entry: Entry): Promise<string> {
  if (entry.directory) throw new Error(`unexpected directory entry: ${entry.filename}`);
  return entry.getData(new TextWriter());
}

// ---------------------------------------------------------------------------

describe('DataSerializerService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // -------------------------------------------------------------------------
  // T1: Envelope round-trip — data arrays survive export→import unchanged
  // -------------------------------------------------------------------------

  describe('T1 — envelope round-trip', () => {
    it('categories survive export→import', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      const parsed = await svc.import(payload, PASSWORD);
      expect(parsed.categories).toHaveLength(1);
      expect(parsed.categories[0].id).toBe('cat-1');
      expect(parsed.categories[0].name).toBe('Bebidas');
    });

    it('products survive export→import with all fields', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      const parsed = await svc.import(payload, PASSWORD);
      expect(parsed.products).toHaveLength(1);
      expect(parsed.products[0].id).toBe('prod-1');
      expect(parsed.products[0].price).toBe(1500);
    });

    it('orders survive export→import', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      const parsed = await svc.import(payload, PASSWORD);
      expect(parsed.orders).toHaveLength(1);
      expect(parsed.orders[0].id).toBe('order-1');
      expect(parsed.orders[0].total).toBe(3000);
    });

    it('expenses survive export→import', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      const parsed = await svc.import(payload, PASSWORD);
      expect(parsed.expenses).toHaveLength(1);
      expect(parsed.expenses[0].id).toBe('exp-1');
    });

    it('saleCredits survive export→import', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      const parsed = await svc.import(payload, PASSWORD);
      expect(parsed.saleCredits).toHaveLength(1);
      expect(parsed.saleCredits[0].id).toBe('credit-1');
      expect(parsed.saleCredits[0].client).toBe('Juan');
    });
  });

  // -------------------------------------------------------------------------
  // T2: Angular-compatible ZIP shape — 6 named entries, Map-entry vs array
  // -------------------------------------------------------------------------

  describe('T2 — Angular-compatible 6-entry ZIP format', () => {
    it('produces exactly the 6 Angular-named entries', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      const entries = await readRawEntries(payload, PASSWORD + STORE_ID);
      const names = entries.map((e) => e.filename).sort();
      expect(names).toEqual([...ANGULAR_ENTRY_NAMES].sort());
    });

    it('each entry is reported as encrypted (password-AES)', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      const entries = await readRawEntries(payload, PASSWORD + STORE_ID);
      for (const entry of entries) {
        expect(entry.encrypted).toBe(true);
      }
    });

    it('categories.json is a Map-entry tuple array ([id, ProductCategory])', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      const entries = await readRawEntries(payload, PASSWORD + STORE_ID);
      const catEntry = entries.find((e) => e.filename === 'categories.json');
      expect(catEntry).toBeDefined();
      const text = await getEntryText(catEntry!);
      const parsed = JSON.parse(text) as [string, ProductCategory][];
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0][0]).toBe('cat-1');
      expect(parsed[0][1].name).toBe('Bebidas');
    });

    it('products.json is a Map-entry tuple array ([id, Product])', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      const entries = await readRawEntries(payload, PASSWORD + STORE_ID);
      const prodEntry = entries.find((e) => e.filename === 'products.json');
      const text = await getEntryText(prodEntry!);
      const parsed = JSON.parse(text) as [string, Product][];
      expect(parsed[0][0]).toBe('prod-1');
      expect(parsed[0][1].price).toBe(1500);
    });

    it('inventory-entries.json is a Map-entry tuple array keyed by productId ([productId, InventoryEntry[]])', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      const entries = await readRawEntries(payload, PASSWORD + STORE_ID);
      const invEntry = entries.find((e) => e.filename === 'inventory-entries.json');
      const text = await getEntryText(invEntry!);
      const parsed = JSON.parse(text) as [string, InventoryEntry[]][];
      expect(parsed[0][0]).toBe('prod-1');
      expect(Array.isArray(parsed[0][1])).toBe(true);
      expect(parsed[0][1][0].id).toBe('inv-1');
    });

    it('orders.json / expenses.json / sale-credits.json are plain arrays (not Map entries)', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      const entries = await readRawEntries(payload, PASSWORD + STORE_ID);

      const ordersEntry = entries.find((e) => e.filename === 'orders.json');
      const ordersParsed = JSON.parse(await getEntryText(ordersEntry!)) as Order[];
      expect(ordersParsed[0]).not.toBeInstanceOf(Array);
      expect(ordersParsed[0].id).toBe('order-1');

      const expensesEntry = entries.find((e) => e.filename === 'expenses.json');
      const expensesParsed = JSON.parse(await getEntryText(expensesEntry!)) as Expense[];
      expect(expensesParsed[0].id).toBe('exp-1');

      const creditsEntry = entries.find((e) => e.filename === 'sale-credits.json');
      const creditsParsed = JSON.parse(await getEntryText(creditsEntry!)) as SaleCredit[];
      expect(creditsParsed[0].id).toBe('credit-1');
    });
  });

  // -------------------------------------------------------------------------
  // T3: Password derivation — userPassword + selectedStoreId, NO separator
  // -------------------------------------------------------------------------

  describe('T3 — store-scoped password derivation (no separator)', () => {
    it('decrypts with plain concatenation password+storeId (no separator)', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      const entries = await readRawEntries(payload, PASSWORD + STORE_ID);
      expect(entries).toHaveLength(6);
    });

    it('fails to decrypt when a separator is inserted between password and storeId', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      const entries = await readRawEntries(payload, `${PASSWORD}:${STORE_ID}`);
      const catEntry = entries.find((e) => e.filename === 'categories.json')!;
      await expect(getEntryText(catEntry)).rejects.toThrow();
    });

    it('does not set an explicit encryptionStrength override (default AE-2/AES-256)', async () => {
      // No behavioral assertion beyond successful decrypt with the derived
      // password — the absence of an explicit encryptionStrength option in
      // the implementation is enforced by code review, matching Angular's
      // `serializeEncryptedZip` which also omits it (default = 3 = AES-256).
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      const entries = await readRawEntries(payload, PASSWORD + STORE_ID);
      expect(entries.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // T4: Wrong-password / wrong-store rejection — throws before any write
  // -------------------------------------------------------------------------

  describe('T4 — wrong-password / wrong-store rejection', () => {
    it('throws WrongPasswordError when decrypting with wrong password', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      await expect(svc.import(payload, WRONG_PASSWORD)).rejects.toThrow(WrongPasswordError);
    });

    it('throws WrongPasswordError when importing with the correct password but a different selectedStoreId', async () => {
      const svc = makeService(undefined, STORE_ID);
      const payload = await svc.export(PASSWORD);
      const otherStoreSvc = makeService(undefined, OTHER_STORE_ID);
      await expect(otherStoreSvc.import(payload, PASSWORD)).rejects.toThrow(WrongPasswordError);
    });

    it('WrongPasswordError is distinguishable by name', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      try {
        await svc.import(payload, WRONG_PASSWORD);
        throw new Error('Should have thrown');
      } catch (err) {
        expect((err as Error).name).toBe('WrongPasswordError');
      }
    });

    it('throws CorruptFileError for a non-zip payload', async () => {
      const svc = makeService();
      const garbage = new Uint8Array([1, 2, 3, 4, 5]);
      await expect(svc.import(garbage, PASSWORD)).rejects.toThrow(CorruptFileError);
    });
  });

  // -------------------------------------------------------------------------
  // T5: Full export→import round-trip (all 6 entities)
  // -------------------------------------------------------------------------

  describe('T5 — full export→import round-trip', () => {
    it('all entity counts match after round-trip', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      const parsed = await svc.import(payload, PASSWORD);
      expect(parsed.categories).toHaveLength(1);
      expect(parsed.products).toHaveLength(1);
      expect(parsed.inventoryEntries).toHaveLength(1);
      expect(parsed.orders).toHaveLength(1);
      expect(parsed.expenses).toHaveLength(1);
      expect(parsed.saleCredits).toHaveLength(1);
    });

    it('empty store produces valid empty arrays on import', async () => {
      const svc = makeService({
        categories: [],
        products: [],
        inventoryEntries: [],
        orders: [],
        expenses: [],
        saleCredits: [],
      });
      const payload = await svc.export(PASSWORD);
      const parsed = await svc.import(payload, PASSWORD);
      expect(parsed.categories).toEqual([]);
      expect(parsed.inventoryEntries).toEqual([]);
    });

    it('a never-synced store (categories/products localStorage keys never written) still exports/imports valid empty arrays, not Angular\'s null->"null" string crash', async () => {
      // Angular's own `getCategoriesJson()`/`getProductsJson()` are typed
      // `(): string` but their body is a plain `localStorage.getItem`
      // (`string | null`) with no guard — a genuinely never-synced store
      // (repo.ts never called for this key) would Blob-coerce that `null`
      // into the literal text "null", which is not a valid `[id, entity][]`
      // array on import. Per angular-bugs-policy this is fixed, not mirrored:
      // React falls back to a valid `'[]'` JSON string instead.
      const svc = makeServiceWithUnseededCategoriesAndProducts();
      const payload = await svc.export(PASSWORD);
      const parsed = await svc.import(payload, PASSWORD);
      expect(parsed.categories).toEqual([]);
      expect(parsed.products).toEqual([]);

      const entries = await readRawEntries(payload, PASSWORD + STORE_ID);
      const catEntry = entries.find((e) => e.filename === 'categories.json')!;
      const prodEntry = entries.find((e) => e.filename === 'products.json')!;
      expect(await getEntryText(catEntry)).toBe('[]');
      expect(await getEntryText(prodEntry)).toBe('[]');
    });
  });

  // -------------------------------------------------------------------------
  // T6: Inventory no-loss round-trip — all InventoryEntry fields survive
  // -------------------------------------------------------------------------

  describe('T6 — inventory field no-loss round-trip', () => {
    it('all InventoryEntry fields survive export→import', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      const parsed = await svc.import(payload, PASSWORD);
      const entry = parsed.inventoryEntries[0];
      expect(entry.id).toBe(mockInventoryEntry.id);
      expect(entry.productId).toBe(mockInventoryEntry.productId);
      expect(entry.quantity).toBe(mockInventoryEntry.quantity);
      expect(entry.available).toBe(mockInventoryEntry.available);
      expect(entry.costPrice).toBe(mockInventoryEntry.costPrice);
      expect(entry.order).toBe(mockInventoryEntry.order);
      // Serializer does NOT revive dates — JSON round-trip returns ISO strings
      expect(entry.date).toBe('2024-01-01T00:00:00.000Z');
      expect(entry.createdDate).toBe('2024-01-01T00:00:00.000Z');
      expect(entry.updatedDate).toBe('2024-01-02T00:00:00.000Z');
    });

    it('multiple inventory entries for multiple products all survive', async () => {
      const entry2: InventoryEntry = {
        ...mockInventoryEntry,
        id: 'inv-2',
        productId: 'prod-2',
        quantity: 50,
        available: 45,
      };
      const svc = makeService({ inventoryEntries: [mockInventoryEntry, entry2] });
      const payload = await svc.export(PASSWORD);
      const parsed = await svc.import(payload, PASSWORD);
      expect(parsed.inventoryEntries).toHaveLength(2);
      const ids = parsed.inventoryEntries.map((e) => e.id);
      expect(ids).toContain('inv-1');
      expect(ids).toContain('inv-2');
    });
  });
});
