import { describe, it, expect, beforeEach } from 'vitest';
import { BlobReader, BlobWriter, TextReader, TextWriter, ZipReader, ZipWriter } from '@zip.js/zip.js';
import type { Entry, EntryGetDataOptions } from '@zip.js/zip.js';
import {
  DataSerializerService,
  WrongPasswordError,
  WrongStoreError,
  CorruptFileError,
  EDataFileName,
  deriveV2Key,
  V2_META_FILENAME,
  V2_FORMAT_VERSION,
  V2_ITERATIONS,
  V2_SALT_BYTES,
} from '../data-serializer-service';
import type { V2Meta } from '../data-serializer-service';
import type {
  InventoryReader,
  OrderReader,
  ExpenseReader,
  SaleCreditReader,
  ExchangeRateReader,
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
  ExchangeRate,
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

// daily-exchange-rate: the seventh data entry added on top of Angular's six.
// warehouses-plan: three more entries (warehouses, stock levels, movements).
const ALL_ENTRY_NAMES = [
  ...ANGULAR_ENTRY_NAMES,
  'exchange-rates.json',
  'warehouses.json',
  'warehouse-stock-levels.json',
  'warehouse-stock-movements.json',
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
 * WU2: `InventoryReader` is now a raw-JSON-string reader (mirrors
 * `InventoryOfflineService.getInventoryEntriesJson()`), not a Map-returning
 * `getAll()` reader — build the exact Map-entries wire-format string a real
 * service would produce.
 */
function makeInventoryJson(entries: InventoryEntry[]): string {
  return JSON.stringify(Array.from(makeInventoryMap(entries).entries()));
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
    exchangeRates?: ExchangeRate[];
  },
  storeId: string = STORE_ID,
): DataSerializerService {
  const cats = overrides?.categories ?? [mockCategory];
  const prods = overrides?.products ?? [mockProduct];
  const inv = overrides?.inventoryEntries ?? [mockInventoryEntry];
  const ords = overrides?.orders ?? [mockOrder];
  const exps = overrides?.expenses ?? [mockExpense];
  const creds = overrides?.saleCredits ?? [mockSaleCredit];
  const rates = overrides?.exchangeRates ?? [];

  seedCategories(storeId, cats);
  seedProducts(storeId, prods);
  const categoryRepository = new ProductCategoryRepository(storeId);
  const productRepository = new ProductRepository(storeId, categoryRepository);
  const inventoryReader: InventoryReader = {
    getInventoryEntriesJson: () => makeInventoryJson(inv),
  };
  const orderReader: OrderReader = { getStorageOrders: () => ords };
  const expenseReader: ExpenseReader = { getStorageExpenses: () => exps };
  const saleCreditReader: SaleCreditReader = { getStorageSaleCredits: () => creds };
  const exchangeRateReader: ExchangeRateReader = { getStorageExchangeRates: () => rates };

  return new DataSerializerService(
    storeId,
    categoryRepository,
    productRepository,
    inventoryReader,
    orderReader,
    expenseReader,
    saleCreditReader,
    exchangeRateReader,
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
    getInventoryEntriesJson: () => makeInventoryJson(inv),
  };
  const orderReader: OrderReader = { getStorageOrders: () => ords };
  const expenseReader: ExpenseReader = { getStorageExpenses: () => exps };
  const saleCreditReader: SaleCreditReader = { getStorageSaleCredits: () => creds };

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
 * Reads the raw zip entries of a LEGACY v1 archive with zip.js directly,
 * given an already-derived password (e.g. `PASSWORD + STORE_ID`).
 */
async function readRawEntries(payload: Uint8Array, derivedPassword: string) {
  const blob = new Blob([payload]);
  const zipReader = new ZipReader(new BlobReader(blob), { password: derivedPassword });
  const entries = await zipReader.getEntries();
  await zipReader.close();
  return entries;
}

/**
 * Reads a v2 archive with a password-free reader (mixed ZIP: plaintext
 * meta.json + encrypted data entries), returning the parsed envelope AND the
 * password-only derived key so tests can assert on the data entries without
 * going through `DataSerializerService.import()`.
 */
async function readRawEntriesV2(payload: Uint8Array, password: string) {
  const blob = new Blob([payload]);
  const zipReader = new ZipReader(new BlobReader(blob));
  const entries = await zipReader.getEntries();
  const metaEntry = entries.find(
    (e) => !e.directory && e.filename === V2_META_FILENAME,
  );
  if (!metaEntry || metaEntry.directory) {
    throw new Error('v2 archive is missing meta.json');
  }
  const meta = JSON.parse(await metaEntry.getData(new TextWriter())) as V2Meta;
  const key = await deriveV2Key(password, toBase64Bytes(meta.salt), meta.iterations);
  await zipReader.close();
  return { entries, meta, key };
}

/** Narrows an `Entry` (DirectoryEntry | FileEntry) and reads its text content. */
async function getEntryText(entry: Entry, options?: EntryGetDataOptions): Promise<string> {
  if (entry.directory) throw new Error(`unexpected directory entry: ${entry.filename}`);
  return entry.getData(new TextWriter(), options);
}

/** Base64-decodes a byte array (test-side mirror of the service's private helper). */
function toBase64Bytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Base64-encodes a byte array (test-side mirror of the service's private helper). */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Builds a LEGACY v1 archive: the 6 Angular-named entries encrypted with the
 * derived string password (`password + storeId`, writer-level), NO meta.json.
 * Used to pin the v1 fallback path (V2-07, SYNC-01/02).
 */
async function buildLegacyV1Zip(
  payloads: Record<string, string>,
  derivedPassword: string,
): Promise<Uint8Array> {
  const zipWriter = new ZipWriter(new BlobWriter('application/zip'), {
    password: derivedPassword,
  });
  for (const [name, text] of Object.entries(payloads)) {
    await zipWriter.add(name, new TextReader(text));
  }
  const blob = await zipWriter.close();
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Builds a v2 archive with a custom iteration count (V2-03 fixture): the
 * import path must honor `meta.iterations` rather than assume the constant.
 */
async function buildV2ZipWithIterations(
  payloads: Record<string, string>,
  password: string,
  iterations: number,
): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(V2_SALT_BYTES));
  const key = await deriveV2Key(password, salt, iterations);
  const zipWriter = new ZipWriter(new BlobWriter('application/zip'));
  await zipWriter.add(
    V2_META_FILENAME,
    new TextReader(
      JSON.stringify({
        formatVersion: V2_FORMAT_VERSION,
        salt: toBase64(salt),
        iterations,
        storeId: STORE_ID,
        exportedAt: new Date().toISOString(),
      } satisfies V2Meta),
    ),
  );
  for (const [name, text] of Object.entries(payloads)) {
    await zipWriter.add(name, new TextReader(text), { rawPassword: key });
  }
  const blob = await zipWriter.close();
  return new Uint8Array(await blob.arrayBuffer());
}

/** The 6 Angular-named payloads for a legacy v1 archive (matches makeService defaults). */
function makeV1Payloads(): Record<string, string> {
  return {
    [EDataFileName.Categories]: JSON.stringify([['cat-1', mockCategory]] as [string, ProductCategory][]),
    [EDataFileName.Products]: JSON.stringify([['prod-1', mockProduct]] as [string, Product][]),
    [EDataFileName.InventoryEntries]: JSON.stringify([
      ['prod-1', [mockInventoryEntry]],
    ] as [string, InventoryEntry[]][]),
    [EDataFileName.Orders]: JSON.stringify([mockOrder]),
    [EDataFileName.Expenses]: JSON.stringify([mockExpense]),
    [EDataFileName.SaleCredits]: JSON.stringify([mockSaleCredit]),
  };
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
  // T2: v2 ZIP shape — meta.json envelope + the 6 Angular-named entries +
  // the daily-exchange-rate seventh entry (exchange-rates.json)
  // -------------------------------------------------------------------------

  describe('T2 — v2 envelope: meta.json + all data entries', () => {
    it('produces meta.json plus exactly the 10 data entries', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      const { entries } = await readRawEntriesV2(payload, PASSWORD);
      const names = entries.map((e) => e.filename).sort();
      expect(names).toEqual(['meta.json', ...ALL_ENTRY_NAMES].sort());
    });

    // parity-audit-remediation Slice 2: naming-only alignment with Angular's
    // EDataFileName enum (data.file.model.ts:6-13) — PascalCase members, same string values.
    it('EDataFileName mirrors Angular\'s PascalCase member names with unchanged string values, plus the daily-exchange-rate seventh entry and the three warehouses entries', () => {
      expect(EDataFileName).toEqual({
        Categories: 'categories.json',
        Products: 'products.json',
        InventoryEntries: 'inventory-entries.json',
        Orders: 'orders.json',
        Expenses: 'expenses.json',
        SaleCredits: 'sale-credits.json',
        ExchangeRates: 'exchange-rates.json',
        Warehouses: 'warehouses.json',
        WarehouseStockLevels: 'warehouse-stock-levels.json',
        WarehouseStockMovements: 'warehouse-stock-movements.json',
      });
    });

    it('meta.json is NOT encrypted while all 6 data entries are (V2-01)', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      const { entries } = await readRawEntriesV2(payload, PASSWORD);
      const metaEntry = entries.find((e) => e.filename === 'meta.json')!;
      expect(metaEntry.encrypted).toBe(false);
      for (const entry of entries) {
        if (entry.filename === 'meta.json') continue;
        expect(entry.encrypted).toBe(true);
      }
    });

    it('meta.json carries the v2 envelope fields (formatVersion 2, salt 16B, iterations 100000, storeId, exportedAt ISO) (V2-01)', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      const { meta } = await readRawEntriesV2(payload, PASSWORD);
      expect(meta.formatVersion).toBe(2);
      expect(toBase64Bytes(meta.salt)).toHaveLength(16);
      expect(meta.iterations).toBe(100_000);
      expect(meta.storeId).toBe(STORE_ID);
      expect(new Date(meta.exportedAt).toISOString()).toBe(meta.exportedAt);
    });

    it('each export gets a FRESH salt (V2-02)', async () => {
      const svc = makeService();
      const payloadA = await svc.export(PASSWORD);
      const payloadB = await svc.export(PASSWORD);
      const { meta: metaA } = await readRawEntriesV2(payloadA, PASSWORD);
      const { meta: metaB } = await readRawEntriesV2(payloadB, PASSWORD);
      expect(metaA.salt).not.toBe(metaB.salt);
      expect(toBase64Bytes(metaA.salt)).not.toEqual(toBase64Bytes(metaB.salt));
    });

    it('categories.json is a Map-entry tuple array ([id, ProductCategory])', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      const { entries, key } = await readRawEntriesV2(payload, PASSWORD);
      const catEntry = entries.find((e) => e.filename === 'categories.json');
      expect(catEntry).toBeDefined();
      const text = await getEntryText(catEntry!, { rawPassword: key });
      const parsed = JSON.parse(text) as [string, ProductCategory][];
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0][0]).toBe('cat-1');
      expect(parsed[0][1].name).toBe('Bebidas');
    });

    it('products.json is a Map-entry tuple array ([id, Product])', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      const { entries, key } = await readRawEntriesV2(payload, PASSWORD);
      const prodEntry = entries.find((e) => e.filename === 'products.json');
      const text = await getEntryText(prodEntry!, { rawPassword: key });
      const parsed = JSON.parse(text) as [string, Product][];
      expect(parsed[0][0]).toBe('prod-1');
      expect(parsed[0][1].price).toBe(1500);
    });

    it('inventory-entries.json is a Map-entry tuple array keyed by productId ([productId, InventoryEntry[]])', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      const { entries, key } = await readRawEntriesV2(payload, PASSWORD);
      const invEntry = entries.find((e) => e.filename === 'inventory-entries.json');
      const text = await getEntryText(invEntry!, { rawPassword: key });
      const parsed = JSON.parse(text) as [string, InventoryEntry[]][];
      expect(parsed[0][0]).toBe('prod-1');
      expect(Array.isArray(parsed[0][1])).toBe(true);
      expect(parsed[0][1][0].id).toBe('inv-1');
    });

    it('orders.json / expenses.json / sale-credits.json are plain arrays (not Map entries)', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      const { entries, key } = await readRawEntriesV2(payload, PASSWORD);

      const ordersEntry = entries.find((e) => e.filename === 'orders.json');
      const ordersParsed = JSON.parse(await getEntryText(ordersEntry!, { rawPassword: key })) as Order[];
      expect(ordersParsed[0]).not.toBeInstanceOf(Array);
      expect(ordersParsed[0].id).toBe('order-1');

      const expensesEntry = entries.find((e) => e.filename === 'expenses.json');
      const expensesParsed = JSON.parse(await getEntryText(expensesEntry!, { rawPassword: key })) as Expense[];
      expect(expensesParsed[0].id).toBe('exp-1');

      const creditsEntry = entries.find((e) => e.filename === 'sale-credits.json');
      const creditsParsed = JSON.parse(await getEntryText(creditsEntry!, { rawPassword: key })) as SaleCredit[];
      expect(creditsParsed[0].id).toBe('credit-1');
    });

    it('exports inventory-entries.json as the RAW string returned by getInventoryEntriesJson() — passthrough, not a repository getAll()+Map-rebuild+stringify sequence (WU2)', async () => {
      const categoryRepository = new ProductCategoryRepository(STORE_ID);
      const productRepository = new ProductRepository(STORE_ID, categoryRepository);
      seedCategories(STORE_ID, [mockCategory]);
      seedProducts(STORE_ID, [mockProduct]);
      const rawInventoryJson = '[["prod-1",[{"id":"inv-1","weird":true}]]]';
      const inventoryReader: InventoryReader = { getInventoryEntriesJson: () => rawInventoryJson };
      const svc = new DataSerializerService(
        STORE_ID,
        categoryRepository,
        productRepository,
        inventoryReader,
        { getStorageOrders: () => [] },
        { getStorageExpenses: () => [] },
        { getStorageSaleCredits: () => [] },
      );

      const payload = await svc.export(PASSWORD);
      const { entries, key } = await readRawEntriesV2(payload, PASSWORD);
      const invEntry = entries.find((e) => e.filename === 'inventory-entries.json')!;
      expect(await getEntryText(invEntry, { rawPassword: key })).toBe(rawInventoryJson);
    });

    it('exports corrupt/malformed inventory JSON AS-IS, NOT silently emptied (parity fix vs the deleted InventoryRepository.getAll, which swallowed parse errors to an empty Map)', async () => {
      const categoryRepository = new ProductCategoryRepository(STORE_ID);
      const productRepository = new ProductRepository(STORE_ID, categoryRepository);
      seedCategories(STORE_ID, [mockCategory]);
      seedProducts(STORE_ID, [mockProduct]);
      const corrupt = '{not valid json';
      const inventoryReader: InventoryReader = { getInventoryEntriesJson: () => corrupt };
      const svc = new DataSerializerService(
        STORE_ID,
        categoryRepository,
        productRepository,
        inventoryReader,
        { getStorageOrders: () => [] },
        { getStorageExpenses: () => [] },
        { getStorageSaleCredits: () => [] },
      );

      const payload = await svc.export(PASSWORD);
      const { entries, key } = await readRawEntriesV2(payload, PASSWORD);
      const invEntry = entries.find((e) => e.filename === 'inventory-entries.json')!;
      expect(await getEntryText(invEntry, { rawPassword: key })).toBe(corrupt);
    });
  });

  // -------------------------------------------------------------------------
  // T3: v2 password-only KDF — PBKDF2-HMAC-SHA-256, 32 bytes, no storeId
  // -------------------------------------------------------------------------

  describe('T3 — v2 password-only key derivation (V2-03/V2-04)', () => {
    it('deriveV2Key produces a 32-byte key', async () => {
      const salt = crypto.getRandomValues(new Uint8Array(V2_SALT_BYTES));
      const key = await deriveV2Key(PASSWORD, salt, V2_ITERATIONS);
      expect(key).toHaveLength(32);
    });

    it('is deterministic for the same password + salt (no storeId/time in the KDF)', async () => {
      const salt = crypto.getRandomValues(new Uint8Array(V2_SALT_BYTES));
      const a = await deriveV2Key(PASSWORD, salt, V2_ITERATIONS);
      const b = await deriveV2Key(PASSWORD, salt, V2_ITERATIONS);
      expect(a).toEqual(b);
    });

    it('a different password produces a different key', async () => {
      const salt = crypto.getRandomValues(new Uint8Array(V2_SALT_BYTES));
      const a = await deriveV2Key(PASSWORD, salt, V2_ITERATIONS);
      const b = await deriveV2Key(WRONG_PASSWORD, salt, V2_ITERATIONS);
      expect(a).not.toEqual(b);
    });

    it('the iteration count feeds the KDF — a different count yields a different key', async () => {
      const salt = crypto.getRandomValues(new Uint8Array(V2_SALT_BYTES));
      const a = await deriveV2Key(PASSWORD, salt, V2_ITERATIONS);
      const b = await deriveV2Key(PASSWORD, salt, 50_000);
      expect(a).not.toEqual(b);
    });

    it('import honors meta.iterations rather than assuming the export constant (V2-03)', async () => {
      const svc = makeService();
      const payload = await buildV2ZipWithIterations(makeV1Payloads(), PASSWORD, 50_000);
      const parsed = await svc.import(payload, PASSWORD);
      expect(parsed.categories[0].id).toBe('cat-1');
      expect(parsed.products[0].id).toBe('prod-1');
    });

    it('v2 data entries are NOT decryptable with password+storeId (the password-only key replaces the v1 string derivation) (V2-04)', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      const { entries } = await readRawEntriesV2(payload, PASSWORD);
      const catEntry = entries.find((e) => e.filename === 'categories.json')!;
      await expect(getEntryText(catEntry, { password: PASSWORD + STORE_ID })).rejects.toThrow();
    });

    it('does not set an explicit encryptionStrength override (default AE-2/AES-256)', async () => {
      // No behavioral assertion beyond successful decrypt with the derived
      // key — the absence of an explicit encryptionStrength option in
      // the implementation is enforced by code review, matching Angular's
      // `serializeEncryptedZip` which also omits it (default = 3 = AES-256).
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      const { entries, key } = await readRawEntriesV2(payload, PASSWORD);
      const catEntry = entries.find((e) => e.filename === 'categories.json')!;
      expect(JSON.parse(await getEntryText(catEntry, { rawPassword: key }))).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // T4: Wrong-password / wrong-store rejection — throws before any write
  // -------------------------------------------------------------------------

  describe('T4 — wrong-password / wrong-store rejection', () => {
    it('throws WrongPasswordError when decrypting with wrong password (V2-06)', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      await expect(svc.import(payload, WRONG_PASSWORD)).rejects.toThrow(WrongPasswordError);
    });

    it('throws WrongStoreError — not WrongPasswordError — with the correct password but a different store (V2-05)', async () => {
      const svc = makeService(undefined, STORE_ID);
      const payload = await svc.export(PASSWORD);
      const otherStoreSvc = makeService(undefined, OTHER_STORE_ID);
      await expect(otherStoreSvc.import(payload, PASSWORD)).rejects.toThrow(WrongStoreError);
      try {
        await otherStoreSvc.import(payload, PASSWORD);
        throw new Error('Should have thrown');
      } catch (err) {
        expect((err as Error).name).toBe('WrongStoreError');
      }
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

    it('WrongStoreError is distinguishable by name and defaults to an informative message', () => {
      expect(new WrongStoreError().name).toBe('WrongStoreError');
      expect(new WrongStoreError().message).toBe('Backup belongs to another store');
    });

    it('throws CorruptFileError for a non-zip payload (V2-12)', async () => {
      const svc = makeService();
      const garbage = new Uint8Array([1, 2, 3, 4, 5]);
      await expect(svc.import(garbage, PASSWORD)).rejects.toThrow(CorruptFileError);
    });
  });

  // -------------------------------------------------------------------------
  // T5: Legacy v1 fallback — archives without meta.json (V2-07, SYNC-01/02)
  // -------------------------------------------------------------------------

  describe('T5 — legacy v1 fallback (no meta.json)', () => {
    it('imports a v1 archive with the correct password via password+storeId (V2-07)', async () => {
      const payload = await buildLegacyV1Zip(makeV1Payloads(), PASSWORD + STORE_ID);
      const svc = makeService();
      const parsed = await svc.import(payload, PASSWORD);
      expect(parsed.categories[0].id).toBe('cat-1');
      expect(parsed.products[0].id).toBe('prod-1');
      expect(parsed.inventoryEntries[0].id).toBe('inv-1');
      expect(parsed.orders[0].id).toBe('order-1');
      expect(parsed.expenses[0].id).toBe('exp-1');
      expect(parsed.saleCredits[0].id).toBe('credit-1');
    });

    it('v1 remains store-scoped: an archive derived for another storeId fails (SYNC-02)', async () => {
      const payload = await buildLegacyV1Zip(makeV1Payloads(), PASSWORD + OTHER_STORE_ID);
      const svc = makeService(undefined, STORE_ID);
      await expect(svc.import(payload, PASSWORD)).rejects.toThrow(WrongPasswordError);
    });

    it('throws WrongPasswordError for a v1 archive with the wrong password', async () => {
      const payload = await buildLegacyV1Zip(makeV1Payloads(), PASSWORD + STORE_ID);
      const svc = makeService();
      await expect(svc.import(payload, WRONG_PASSWORD)).rejects.toThrow(WrongPasswordError);
    });

    it('decrypts with plain concatenation password+storeId, no separator (v1 parity)', async () => {
      const payload = await buildLegacyV1Zip(makeV1Payloads(), PASSWORD + STORE_ID);
      const entries = await readRawEntries(payload, PASSWORD + STORE_ID);
      expect(entries).toHaveLength(6);
    });

    it('fails to decrypt a v1 archive when a separator is inserted between password and storeId', async () => {
      const payload = await buildLegacyV1Zip(makeV1Payloads(), PASSWORD + STORE_ID);
      const entries = await readRawEntries(payload, `${PASSWORD}:${STORE_ID}`);
      const catEntry = entries.find((e) => e.filename === 'categories.json')!;
      await expect(getEntryText(catEntry)).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // T6: Full export→import round-trip (all 6 entities)
  // -------------------------------------------------------------------------

  describe('T6 — full export→import round-trip', () => {
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

    it('empty store produces valid empty arrays on import (V2-11)', async () => {
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

      const { entries, key } = await readRawEntriesV2(payload, PASSWORD);
      const catEntry = entries.find((e) => e.filename === 'categories.json')!;
      const prodEntry = entries.find((e) => e.filename === 'products.json')!;
      expect(await getEntryText(catEntry, { rawPassword: key })).toBe('[]');
      expect(await getEntryText(prodEntry, { rawPassword: key })).toBe('[]');
    });
  });

  // -------------------------------------------------------------------------
  // T7: Inventory no-loss round-trip — all InventoryEntry fields survive
  // -------------------------------------------------------------------------

  describe('T7 — inventory field no-loss round-trip', () => {
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

    it("Angular's `'{}'` empty-inventory sentinel imports as EMPTY inventory, not a crash — getInventoryEntriesJson() falls back to the literal '{}' when a store has no inventory (a valid OBJECT, so parseJson's error fallback never fires and a bare .flatMap would throw). The guard must hold for BOTH the v2 path and the legacy v1 fallback", async () => {
      // This is exactly what a real export of an inventory-less store contains:
      // the Angular raw-string reader Blob-coerces its `'{}'` fallback into the
      // zip entry, and the old v1 import path had the same `.flatMap` crash.
      const emptyInventoryPayloads = {
        ...makeV1Payloads(),
        [EDataFileName.InventoryEntries]: '{}',
      };

      const v2Payload = await buildV2ZipWithIterations(emptyInventoryPayloads, PASSWORD, V2_ITERATIONS);
      const v2Parsed = await makeService().import(v2Payload, PASSWORD);
      expect(v2Parsed.inventoryEntries).toEqual([]);
      expect(v2Parsed.categories).toHaveLength(1);
      expect(v2Parsed.products).toHaveLength(1);

      const v1Payload = await buildLegacyV1Zip(emptyInventoryPayloads, PASSWORD + STORE_ID);
      const v1Parsed = await makeService().import(v1Payload, PASSWORD);
      expect(v1Parsed.inventoryEntries).toEqual([]);
      expect(v1Parsed.categories).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // T8 — daily-exchange-rate: exchange-rates.json seventh data entry
  // -------------------------------------------------------------------------

  describe('T8 — daily USD→MN register entry (daily-exchange-rate)', () => {
    const mockRate = (id: string, value: number): ExchangeRate => ({
      id,
      date: new Date(`2026-08-0${id.slice(-1)}T00:00:00.000Z`),
      value,
    });

    it('export writes exchange-rates.json and import parses it back', async () => {
      const rates = [mockRate('2026-08-01', 120), mockRate('2026-08-02', 120), mockRate('2026-08-03', 125)];
      const svc = makeService({ categories: [], products: [], exchangeRates: rates });
      const payload = await svc.export(PASSWORD);
      const parsed = await svc.import(payload, PASSWORD);

      expect(parsed.exchangeRates).toHaveLength(3);
      expect(parsed.exchangeRates.map((r) => r.id)).toEqual([
        '2026-08-01',
        '2026-08-02',
        '2026-08-03',
      ]);
      expect(parsed.exchangeRates[2].value).toBe(125);
    });

    it('an export with no register records still carries an empty exchange-rates.json entry', async () => {
      const svc = makeService({ categories: [], products: [], exchangeRates: [] });
      const payload = await svc.export(PASSWORD);
      const parsed = await svc.import(payload, PASSWORD);
      expect(parsed.exchangeRates).toEqual([]);
    });

    it('a legacy archive WITHOUT exchange-rates.json imports with an empty register (backwards compatible)', async () => {
      // makeV1Payloads()/buildLegacyV1Zip build an archive from the six
      // Angular entry names only — the seventh entry simply does not exist in
      // archives exported before this feature.
      const v1Payload = await buildLegacyV1Zip(
        makeV1Payloads(),
        PASSWORD + STORE_ID,
      );
      const parsed = await makeService().import(v1Payload, PASSWORD);
      expect(parsed.exchangeRates).toEqual([]);
      expect(parsed.categories).toHaveLength(1);
    });
  });
});
