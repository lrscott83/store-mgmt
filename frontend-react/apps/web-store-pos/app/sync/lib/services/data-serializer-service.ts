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
import type { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import type { ProductRepository } from '~/sales/lib/repositories/product-repository';

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

export const EDataFileName = {
  Categories: 'categories.json',
  Products: 'products.json',
  InventoryEntries: 'inventory-entries.json',
  Orders: 'orders.json',
  Expenses: 'expenses.json',
  SaleCredits: 'sale-credits.json',
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

/**
 * WU2 (rule 12 — eliminate-inventory-repository): mirrors Angular's
 * `InventoryOfflineService.getInventoryEntriesJson()` (a raw-string reader),
 * not a repository `getAll()` (Map-returning) reader — matches the
 * already-ratified `getCategoriesJson`/`getProductsJson` pattern (Flag #2).
 */
export interface InventoryReader {
  getInventoryEntriesJson(): string;
}

export interface OrderReader {
  getStorageOrders(): Order[];
}

export interface ExpenseReader {
  getStorageExpenses(): Expense[];
}

export interface SaleCreditReader {
  getStorageSaleCredits(): SaleCredit[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    private readonly categoryRepository: ProductCategoryRepository,
    private readonly productRepository: ProductRepository,
    private readonly inventoryService: InventoryReader,
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
    const orders = this.orderReader.getStorageOrders();
    const expenses = this.expenseReader.getStorageExpenses();
    const saleCredits = this.saleCreditReader.getStorageSaleCredits();

    // Angular parity (data-serializer.service.ts:83-84): reads the RAW stored
    // JSON string straight from the repository, no re-derivation via
    // toMapEntriesJson — byte-preserving pass-through, not a neutral refactor
    // (see Flag #2, product-service-parity tasks-slice8-cleanup.md).
    //
    // Angular's own repo signature lies about nullability (`getCategoriesJson():
    // string` when the body is a plain `localStorage.getItem`, which is
    // `string | null`) and never guards it — on a never-synced/empty store
    // this null is Blob-coerced into the literal 4-char text "null", which
    // fails to round-trip as a valid entity array on import. Per
    // angular-bugs-policy (fix, don't replicate), React guards this null with
    // a valid empty-array fallback instead of reproducing that crash.
    const categoriesJson = this.categoryRepository.getCategoriesJson() ?? '[]';
    const productsJson = this.productRepository.getProductsJson() ?? '[]';
    // Angular parity (data-serializer.service.ts:85): raw passthrough from
    // InventoryOfflineService.getInventoryEntriesJson() — no Map rebuild, no
    // re-serialize. Matches the Flag #2 pattern above; fixes the rule-10/12
    // defect where the deleted InventoryRepository.getAll() silently
    // swallowed corrupt localStorage into an empty Map on export.
    const inventoryJson = this.inventoryService.getInventoryEntriesJson();
    const ordersJson = JSON.stringify(orders);
    const expensesJson = JSON.stringify(expenses);
    const saleCreditsJson = JSON.stringify(saleCredits);

    const zipWriter = new ZipWriter(new BlobWriter('application/zip'), {
      password: this.derivePassword(password),
    });

    await zipWriter.add(EDataFileName.Categories, new TextReader(categoriesJson));
    await zipWriter.add(EDataFileName.Products, new TextReader(productsJson));
    await zipWriter.add(EDataFileName.InventoryEntries, new TextReader(inventoryJson));
    await zipWriter.add(EDataFileName.Orders, new TextReader(ordersJson));
    await zipWriter.add(EDataFileName.Expenses, new TextReader(expensesJson));
    await zipWriter.add(EDataFileName.SaleCredits, new TextReader(saleCreditsJson));

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
      EDataFileName.Categories,
      [],
    );
    const productEntries = parseJson<[string, Product][]>(contents, EDataFileName.Products, []);
    const inventoryEntryTuples = parseJson<[string, InventoryEntry[]][]>(
      contents,
      EDataFileName.InventoryEntries,
      [],
    );

    return {
      categories: categoryEntries.map(([, category]) => category),
      products: productEntries.map(([, product]) => product),
      inventoryEntries: inventoryEntryTuples.flatMap(([, entriesForProduct]) => entriesForProduct),
      orders: parseJson<Order[]>(contents, EDataFileName.Orders, []),
      expenses: parseJson<Expense[]>(contents, EDataFileName.Expenses, []),
      saleCredits: parseJson<SaleCredit[]>(contents, EDataFileName.SaleCredits, []),
    };
  }
}
