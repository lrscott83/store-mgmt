import {
  BlobReader,
  BlobWriter,
  TextReader,
  TextWriter,
  ZipReader,
  ZipWriter,
  configure,
} from '@zip.js/zip.js';
import type {
  ProductCategory,
  Product,
  InventoryEntry,
  Order,
  Expense,
  SaleCredit,
} from '@store-mgmt/domain';

// ---------------------------------------------------------------------------
// zip.js runtime configuration
// ---------------------------------------------------------------------------
//
// zip.js defaults to offloading (de)compression to a Web Worker. That worker
// script needs a bundler-aware `Worker` global, which is unavailable under
// Vitest/jsdom (and irrelevant for SSR). Disabling it does not change the
// produced ZIP bytes/format — it is purely an execution-strategy setting —
// so it has no effect on Angular interop.
configure({ useWebWorkers: false });

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class WrongPasswordError extends Error {
  readonly name = 'WrongPasswordError';
  constructor(message = 'Wrong password or corrupted file') {
    super(message);
    Object.setPrototypeOf(this, WrongPasswordError.prototype);
  }
}

export class CorruptFileError extends Error {
  readonly name = 'CorruptFileError';
  constructor(message = 'File is corrupt or has an unsupported format') {
    super(message);
    Object.setPrototypeOf(this, CorruptFileError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Angular-compatible entry names (data.file.model.ts EDataFileName parity)
// ---------------------------------------------------------------------------

const ENTRY_NAMES = {
  categories: 'categories.json',
  products: 'products.json',
  inventoryEntries: 'inventory-entries.json',
  orders: 'orders.json',
  expenses: 'expenses.json',
  saleCredits: 'sale-credits.json',
} as const;

// ---------------------------------------------------------------------------
// Parsed data shape
// ---------------------------------------------------------------------------

export interface ParsedData {
  categories: ProductCategory[];
  products: Product[];
  inventoryEntries: InventoryEntry[];
  orders: Order[];
  expenses: Expense[];
  saleCredits: SaleCredit[];
}

// ---------------------------------------------------------------------------
// Service dependencies (injected as interfaces to keep service unit-testable)
// ---------------------------------------------------------------------------

export interface CategoryReader {
  getAll(): ProductCategory[];
}

export interface ProductReader {
  getAll(): Product[];
}

export interface InventoryReader {
  getAll(storeId: string): Map<string, InventoryEntry[]>;
}

export interface OrderReader {
  getAll(): Order[];
}

export interface ExpenseReader {
  getAll(): Expense[];
}

export interface SaleCreditReader {
  getAll(): SaleCredit[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toMapEntriesJson<T>(items: T[], idOf: (item: T) => string): string {
  return JSON.stringify(items.map((item) => [idOf(item), item]));
}

function parseJson<T>(contents: Map<string, string>, name: string, fallback: T): T {
  const raw = contents.get(name);
  if (raw === undefined) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new CorruptFileError(`Invalid JSON in ${name}`);
  }
}

// ---------------------------------------------------------------------------
// DataSerializerService
// ---------------------------------------------------------------------------

/**
 * Angular-compatible sync backup serializer.
 *
 * Matches `frontend/src/app/application/synchronization/data-serializer.service.ts`
 * 1:1: a ZIP with 6 separate password-AES JSON entries (WinZip AE spec, zip.js
 * default AES-256/AE-2 — no explicit `encryptionStrength` override), the
 * decryption password being `password + selectedStoreId` (plain concatenation,
 * no separator). This is parity BY FORMAT AND LOGIC SPECIFICATION — React never
 * imports a real Angular-exported archive (see engram decision #645); the gate
 * is self round-trip + entry-name/shape assertions against the documented format.
 */
export class DataSerializerService {
  constructor(
    private readonly storeId: string,
    private readonly categoryReader: CategoryReader,
    private readonly productReader: ProductReader,
    private readonly inventoryRepo: InventoryReader,
    private readonly orderReader: OrderReader,
    private readonly expenseReader: ExpenseReader,
    private readonly saleCreditReader: SaleCreditReader,
  ) {}

  private derivePassword(password: string): string {
    // Angular: `password + this.authService.currentUserValue.selectedStoreId`.
    // Plain concatenation, password first, NO separator.
    return password + this.storeId;
  }

  /**
   * Reads all 6 entities and writes them as separate password-AES JSON
   * entries in a single ZIP, matching Angular's `serializeEncryptedZip`.
   */
  async export(password: string): Promise<Uint8Array> {
    const categories = this.categoryReader.getAll();
    const products = this.productReader.getAll();
    const inventoryMap = this.inventoryRepo.getAll(this.storeId);
    const orders = this.orderReader.getAll();
    const expenses = this.expenseReader.getAll();
    const saleCredits = this.saleCreditReader.getAll();

    const categoriesJson = toMapEntriesJson(categories, (c) => c.id);
    const productsJson = toMapEntriesJson(products, (p) => p.id);
    const inventoryJson = JSON.stringify(Array.from(inventoryMap.entries()));
    const ordersJson = JSON.stringify(orders);
    const expensesJson = JSON.stringify(expenses);
    const saleCreditsJson = JSON.stringify(saleCredits);

    const zipWriter = new ZipWriter(new BlobWriter('application/zip'), {
      password: this.derivePassword(password),
    });

    await zipWriter.add(ENTRY_NAMES.categories, new TextReader(categoriesJson));
    await zipWriter.add(ENTRY_NAMES.products, new TextReader(productsJson));
    await zipWriter.add(ENTRY_NAMES.inventoryEntries, new TextReader(inventoryJson));
    await zipWriter.add(ENTRY_NAMES.orders, new TextReader(ordersJson));
    await zipWriter.add(ENTRY_NAMES.expenses, new TextReader(expensesJson));
    await zipWriter.add(ENTRY_NAMES.saleCredits, new TextReader(saleCreditsJson));

    const blob = await zipWriter.close();
    return new Uint8Array(await blob.arrayBuffer());
  }

  /**
   * Decrypts and parses all 6 entries, matching Angular's
   * `deserializeEncryptedZip`. Throws WrongPasswordError/CorruptFileError
   * before returning — no repository write ever happens inside this method.
   */
  async import(payload: Uint8Array, password: string): Promise<ParsedData> {
    const blob = new Blob([payload]);
    const zipReader = new ZipReader(new BlobReader(blob), {
      password: this.derivePassword(password),
    });

    let entries: Awaited<ReturnType<typeof zipReader.getEntries>>;
    try {
      entries = await zipReader.getEntries();
    } catch {
      throw new CorruptFileError('ZIP extraction failed');
    }

    const contents = new Map<string, string>();
    try {
      for (const entry of entries) {
        if (entry.directory || !entry.getData) continue;
        const text = await entry.getData(new TextWriter());
        contents.set(entry.filename, text);
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'Invalid password') {
        throw new WrongPasswordError();
      }
      throw new WrongPasswordError('Decryption failed');
    } finally {
      await zipReader.close();
    }

    const categoryEntries = parseJson<[string, ProductCategory][]>(
      contents,
      ENTRY_NAMES.categories,
      [],
    );
    const productEntries = parseJson<[string, Product][]>(contents, ENTRY_NAMES.products, []);
    const inventoryEntryTuples = parseJson<[string, InventoryEntry[]][]>(
      contents,
      ENTRY_NAMES.inventoryEntries,
      [],
    );

    return {
      categories: categoryEntries.map(([, category]) => category),
      products: productEntries.map(([, product]) => product),
      inventoryEntries: inventoryEntryTuples.flatMap(([, entriesForProduct]) => entriesForProduct),
      orders: parseJson<Order[]>(contents, ENTRY_NAMES.orders, []),
      expenses: parseJson<Expense[]>(contents, ENTRY_NAMES.expenses, []),
      saleCredits: parseJson<SaleCredit[]>(contents, ENTRY_NAMES.saleCredits, []),
    };
  }
}
