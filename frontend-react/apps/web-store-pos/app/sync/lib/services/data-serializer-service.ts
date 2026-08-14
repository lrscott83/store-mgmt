import {
  BlobReader,
  BlobWriter,
  TextReader,
  TextWriter,
  ZipReader,
  ZipWriter,
  configure,
} from '@zip.js/zip.js';
import type { Entry, FileEntry } from '@zip.js/zip.js';
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

export class WrongStoreError extends Error {
  readonly name = 'WrongStoreError';
  constructor(message = 'Backup belongs to another store') {
    super(message);
    Object.setPrototypeOf(this, WrongStoreError.prototype);
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
// v2 envelope (sync-export-import-v2)
// ---------------------------------------------------------------------------
//
// v2 adds an unencrypted `meta.json` FIRST entry (V2-01) so a password-free
// central-directory scan can detect the format and validate the store claim
// before any decryption or write (V2-05). The 6 data entries keep the
// Angular-compatible names and stay AES-encrypted under a password-only Web
// Crypto PBKDF2 key (V2-03). Legacy v1 archives — which have no meta.json —
// are still imported via the `password + selectedStoreId` fallback (V2-07).

/** v2 meta.json entry filename. */
export const V2_META_FILENAME = 'meta.json';

/** v2 envelope format version. */
export const V2_FORMAT_VERSION = 2;

/** PBKDF2 iteration count written to and honored from meta.json (V2-01/03). */
export const V2_ITERATIONS = 100_000;

/** PBKDF2 salt length in bytes — a fresh salt per export (V2-02). */
export const V2_SALT_BYTES = 16;

/** Plaintext envelope stored as meta.json — never contains entity data. */
export interface V2Meta {
  formatVersion: number;
  salt: string;
  iterations: number;
  storeId: string;
  exportedAt: string;
}

/**
 * Derives the 32-byte AES key for a v2 backup from the password ALONE
 * (V2-03/V2-04): PBKDF2-HMAC-SHA-256 over the raw UTF-8 password bytes — no
 * pre-hash, no storeId. The per-export salt and iteration count come from
 * meta.json. Mirrors `offline-crypto.ts`'s Web Crypto style.
 */
export async function deriveV2Key(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return new Uint8Array(bits);
}

/** Base64-encodes a byte array (mirror of offline-crypto.ts's local helper). */
function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Base64-decodes a byte array (mirror of offline-crypto.ts's local helper). */
function bytesFromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

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
 * v2 envelope (sync-export-import-v2): a ZIP whose FIRST entry is the
 * unencrypted `meta.json` envelope (formatVersion 2, fresh per-export salt,
 * iterations, storeId, exportedAt) followed by the 6 Angular-named data
 * entries (data.file.model.ts EDataFileName parity) each AES-encrypted under
 * the password-only PBKDF2 key described by meta.json. Legacy v1 archives —
 * and real Angular-exported archives, which carry no meta.json — import via
 * the `password + selectedStoreId` fallback. React never imports a real
 * Angular-exported archive (see engram decision #645); the gate is self
 * round-trip + entry-name/shape assertions against the documented format.
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
   * Reads all 6 entities and writes them as a v2 ZIP: an unencrypted
   * `meta.json` envelope first, then the 6 Angular-named data entries each
   * AES-encrypted with the per-export password-only key. zip.js's internal
   * PBKDF2-SHA-1 @ 1000-iteration KDF still runs over the per-entry key — it
   * is buried, not replaced (V2-04); the outer Web Crypto KDF dominates the
   * effective key derivation.
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

    // v2 envelope: a fresh salt per export (V2-02), password-only key (V2-03).
    const salt = crypto.getRandomValues(new Uint8Array(V2_SALT_BYTES));
    const key = await deriveV2Key(password, salt, V2_ITERATIONS);

    const meta: V2Meta = {
      formatVersion: V2_FORMAT_VERSION,
      salt: base64FromBytes(salt),
      iterations: V2_ITERATIONS,
      storeId: this.storeId,
      exportedAt: new Date().toISOString(),
    };

    // A writer-level password cannot be cleared per-entry (zip.js option
    // fallback rule), so the writer is constructed WITHOUT one; each data
    // entry gets the derived key as its own `rawPassword`, and meta.json is
    // added with no options at all — plaintext by construction (V2-01).
    const zipWriter = new ZipWriter(new BlobWriter('application/zip'));
    await zipWriter.add(V2_META_FILENAME, new TextReader(JSON.stringify(meta)));

    await zipWriter.add(EDataFileName.Categories, new TextReader(categoriesJson), {
      rawPassword: key,
    });
    await zipWriter.add(EDataFileName.Products, new TextReader(productsJson), {
      rawPassword: key,
    });
    await zipWriter.add(EDataFileName.InventoryEntries, new TextReader(inventoryJson), {
      rawPassword: key,
    });
    await zipWriter.add(EDataFileName.Orders, new TextReader(ordersJson), {
      rawPassword: key,
    });
    await zipWriter.add(EDataFileName.Expenses, new TextReader(expensesJson), {
      rawPassword: key,
    });
    await zipWriter.add(EDataFileName.SaleCredits, new TextReader(saleCreditsJson), {
      rawPassword: key,
    });

    const blob = await zipWriter.close();
    return new Uint8Array(await blob.arrayBuffer());
  }

  /**
   * Decrypts and parses all 6 entries. v2 archives (meta.json present)
   * validate the store claim BEFORE any decryption (WrongStoreError, V2-05);
   * legacy v1 archives (no meta.json — including Angular exports) fall back
   * to `password + selectedStoreId` (V2-07). Throws WrongPasswordError /
   * CorruptFileError / WrongStoreError before returning — no repository
   * write ever happens inside this method.
   */
  async import(payload: Uint8Array, password: string): Promise<ParsedData> {
    const blob = new Blob([payload]);
    // No reader-level password on purpose: zip.js reads the central directory
    // password-free for ANY archive, which is what lets a mixed v2 ZIP expose
    // meta.json plaintext while the 6 data entries stay encrypted (V2-01).
    const zipReader = new ZipReader(new BlobReader(blob));

    let entries: Awaited<ReturnType<typeof zipReader.getEntries>>;
    try {
      entries = await zipReader.getEntries();
    } catch {
      throw new CorruptFileError('ZIP extraction failed');
    }

    try {
      const metaEntry = entries.find(
        (entry): entry is FileEntry =>
          !entry.directory && entry.filename === V2_META_FILENAME,
      );
      if (metaEntry) {
        return await this.importV2(entries, metaEntry, password);
      }
      return await this.importV1Fallback(entries, password);
    } finally {
      await zipReader.close();
    }
  }

  /**
   * v2 path: reads the plaintext meta.json envelope, validates it, checks the
   * store claim (V2-05 — throws WrongStoreError BEFORE deriving the key or
   * writing anything), then decrypts the 6 data entries with the derived key
   * (V2-06 wrong-password semantics unchanged).
   */
  private async importV2(
    entries: Entry[],
    metaEntry: FileEntry,
    password: string,
  ): Promise<ParsedData> {
    let meta: V2Meta;
    try {
      const rawMeta = await metaEntry.getData(new TextWriter());
      const parsed = JSON.parse(rawMeta) as Partial<V2Meta>;
      if (parsed.formatVersion !== V2_FORMAT_VERSION) {
        throw new CorruptFileError('Unsupported backup format version');
      }
      meta = parsed as V2Meta;
    } catch (err) {
      if (err instanceof CorruptFileError) throw err;
      throw new CorruptFileError('Invalid backup envelope');
    }

    // V2-05: fail fast on a store mismatch, before any key derivation or
    // write. A malformed envelope that claims no store fails here too.
    if (meta.storeId !== this.storeId) {
      throw new WrongStoreError();
    }

    let key: Uint8Array;
    try {
      key = await deriveV2Key(password, bytesFromBase64(meta.salt), meta.iterations);
    } catch {
      throw new CorruptFileError('Invalid backup envelope');
    }

    const contents = new Map<string, string>();
    try {
      for (const entry of entries) {
        if (entry.directory || !entry.getData || entry.filename === V2_META_FILENAME) {
          continue;
        }
        const text = await entry.getData(new TextWriter(), { rawPassword: key });
        contents.set(entry.filename, text);
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'Invalid password') {
        throw new WrongPasswordError();
      }
      throw new WrongPasswordError('Decryption failed');
    }

    return this.parseContents(contents);
  }

  /**
   * Legacy v1 path (no meta.json): decrypts with `password + selectedStoreId`
   * (plain concatenation, no separator — Angular's deserializeEncryptedZip
   * derivation) passed per-entry, preserving v1 semantics for React v1 and
   * real Angular-exported archives (V2-07, SYNC-01/02).
   */
  private async importV1Fallback(
    entries: Entry[],
    password: string,
  ): Promise<ParsedData> {
    const contents = new Map<string, string>();
    try {
      for (const entry of entries) {
        if (entry.directory || !entry.getData) continue;
        const text = await entry.getData(new TextWriter(), {
          password: this.derivePassword(password),
        });
        contents.set(entry.filename, text);
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'Invalid password') {
        throw new WrongPasswordError();
      }
      throw new WrongPasswordError('Decryption failed');
    }

    return this.parseContents(contents);
  }

  private parseContents(contents: Map<string, string>): ParsedData {
    const categoryEntries = parseJson<[string, ProductCategory][]>(
      contents,
      EDataFileName.Categories,
      [],
    );
    const productEntries = parseJson<[string, Product][]>(contents, EDataFileName.Products, []);
    const rawInventory = parseJson<unknown>(contents, EDataFileName.InventoryEntries, []);

    // Angular's getInventoryEntriesJson() falls back to the literal `'{}'` when
    // a store has NO inventory entries (inventory-offline-service.ts:932) — a
    // valid OBJECT, not the `[productId, entries][]` array the sync format
    // expects. It parses cleanly, so parseJson's error fallback never fires and
    // a bare `.flatMap` on it would crash EVERY empty-inventory import (v2 and
    // the v1 fallback alike — this predates sync-export-import-v2). A non-array
    // inventory is an empty inventory, not corruption: Angular's own exports
    // carry this sentinel for stores without inventory.
    const inventoryEntries: InventoryEntry[] = Array.isArray(rawInventory)
      ? (rawInventory as [string, InventoryEntry[]][]).flatMap(
          ([, entriesForProduct]) => entriesForProduct,
        )
      : [];

    return {
      categories: categoryEntries.map(([, category]) => category),
      products: productEntries.map(([, product]) => product),
      inventoryEntries,
      orders: parseJson<Order[]>(contents, EDataFileName.Orders, []),
      expenses: parseJson<Expense[]>(contents, EDataFileName.Expenses, []),
      saleCredits: parseJson<SaleCredit[]>(contents, EDataFileName.SaleCredits, []),
    };
  }
}
