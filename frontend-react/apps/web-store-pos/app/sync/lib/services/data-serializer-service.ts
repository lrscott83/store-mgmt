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
  ChannelRate,
  Warehouse,
  WarehouseStockLevel,
  WarehouseStockMovement,
  Recipe,
  Elaboration,
} from '@store-mgmt/domain';
import type { StorePaymentMethodsConfig } from '~/shared/lib/payment-methods/store-payment-methods-config-service';
import type { QueuedMessage } from '~/shared/lib/messages/messages-offline-service';
import type { CashClosingStore } from '~/sales/lib/cash-closing/cash-closing-types';
import { emptyCashClosingStore } from '~/sales/lib/cash-closing/cash-closing-types';
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
  // retire-exchange-rates-register: the retired daily USD→MN register is no
  // longer written. Archives produced before the retirement still carry
  // `exchange-rates.json`, and an import IGNORES it — the entry is simply never
  // looked up, so an old backup imports exactly as a pre-feature one does.
  // warehouses (warehouses-plan): three more data entries, absent from
  // legacy archives (parsed as [] on import) and always written by exports.
  Warehouses: 'warehouses.json',
  WarehouseStockLevels: 'warehouse-stock-levels.json',
  WarehouseStockMovements: 'warehouse-stock-movements.json',
  // multipayments (T4): the append-only channel-rate register, absent from
  // legacy archives (parsed as [] on import) and always written by exports.
  ChannelRates: 'channel-rates.json',
  // elaboration-module: recipes and elaborations, absent from legacy
  // archives (parsed as [] on import) and always written by exports.
  Recipes: 'recipes.json',
  Elaborations: 'elaborations.json',
  // store-payment-methods-backup: the per-store payment-methods config, absent
  // from legacy archives. Unlike the list entries it is written ONLY when the
  // store actually has a config (absent = store never configured = default).
  StorePaymentMethods: 'store-payment-methods.json',
  // messaging-background-offline: the per-store offline outgoing message queue,
  // always written (empty array when the store has none) and parsed as [] for
  // legacy archives.
  MessagesQueue: 'messages-queue.json',
  // cierre-efectivo: the per-store cash-closing store — daily closings plus the
  // denomination catalog. Always written (empty store when the store has none)
  // and parsed as an empty store for legacy archives.
  CashClosings: 'cash-closings.json',
} as const;

// ---------------------------------------------------------------------------
// v2 envelope (sync-export-import-v2)
// ---------------------------------------------------------------------------
//
// v2 adds an unencrypted `meta.json` FIRST entry (V2-01) so a password-free
// central-directory scan can detect the format and validate the store claim
// before any decryption or write (V2-05). The data entries keep the
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

// ---------------------------------------------------------------------------
// v3 envelope (multi-store-backup)
// ---------------------------------------------------------------------------
//
// An Owner with several stores exports ALL of them in ONE archive. v3 keeps
// v2's password-only key derivation (same PBKDF2, same fresh salt) and its
// plaintext `meta.json` first entry, but the envelope lists every store and
// each store's data lives under its own `stores/<storeId>/` folder:
//
//   meta.json                                  <- plaintext
//   stores/<storeId>/categories.json           <- encrypted
//   stores/<storeId>/products.json             <- encrypted
//   ...
//
// v2 and v1 archives are NOT touched by any of this: `import()` still handles
// them exactly as before, and the multi-store path is only taken when
// `peekBackupFormatVersion()` reports 3. That is the backward-compatibility
// contract — an old backup still imports into the one store it describes.

export const V3_MULTI_FORMAT_VERSION = 3;

/** One store listed in a v3 archive's `meta.json`. */
export interface V3StoreRef {
  storeId: string;
  name?: string;
}

export interface V3Meta {
  formatVersion: typeof V3_MULTI_FORMAT_VERSION;
  salt: string;
  iterations: number;
  exportedAt: string;
  stores: V3StoreRef[];
}

/** One store's data inside a v3 archive, as `entryName -> plaintext JSON`. */
export interface StoreBackupEntries {
  storeId: string;
  name?: string;
  entries: Map<string, string>;
}

/**
 * ZIP entry name of one store's data file in a v3 archive. The store folder
 * keeps stores from ever sharing an entry name, which is what makes a single
 * archive able to carry all of them.
 */
/** Folder inside the zip that holds every store's files. */
export const V3_STORES_FOLDER = 'stores/';

export function storeArchiveEntryName(storeId: string, fileName: string): string {
  return `${V3_STORES_FOLDER}${storeId}/${fileName}`;
}

/**
 * Reads ONLY the plaintext `meta.json` envelope (no data entry is decrypted)
 * and reports its format version. `null` means "no envelope" — a legacy v1
 * archive, which must keep importing through the single-store path.
 */
export async function peekBackupFormatVersion(payload: Uint8Array): Promise<number | null> {
  const zipReader = new ZipReader(new BlobReader(new Blob([payload])));
  let entries: Awaited<ReturnType<typeof zipReader.getEntries>>;
  try {
    entries = await zipReader.getEntries();
  } catch {
    throw new CorruptFileError('ZIP extraction failed');
  }

  try {
    const metaEntry = entries.find(
      (entry): entry is FileEntry => !entry.directory && entry.filename === V2_META_FILENAME,
    );
    if (!metaEntry) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(await metaEntry.getData(new TextWriter()));
    } catch {
      throw new CorruptFileError('Invalid backup envelope');
    }
    const version = (parsed as { formatVersion?: unknown } | null)?.formatVersion;
    return typeof version === 'number' ? version : null;
  } finally {
    await zipReader.close();
  }
}

/**
 * Writes a single-store v2 archive. Extracted from `export()` so the same
 * envelope code serves the store-bound exporter and the multi-store one.
 */
export async function writeSingleStoreArchive(
  storeId: string,
  contents: Map<string, string>,
  password: string,
): Promise<Uint8Array> {
  // v2 envelope: a fresh salt per export (V2-02), password-only key (V2-03).
  const salt = crypto.getRandomValues(new Uint8Array(V2_SALT_BYTES));
  const key = await deriveV2Key(password, salt, V2_ITERATIONS);
  const meta: V2Meta = {
    formatVersion: V2_FORMAT_VERSION,
    salt: base64FromBytes(salt),
    iterations: V2_ITERATIONS,
    storeId,
    exportedAt: new Date().toISOString(),
  };

  const zipWriter = new ZipWriter(new BlobWriter('application/zip'));
  await zipWriter.add(V2_META_FILENAME, new TextReader(JSON.stringify(meta)));
  for (const [fileName, text] of contents) {
    await zipWriter.add(fileName, new TextReader(text), { rawPassword: key });
  }

  const blob = await zipWriter.close();
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Writes a v3 multi-store archive: one plaintext `meta.json` listing every
 * store, then each store's entries under `stores/<storeId>/`, all encrypted
 * with the SAME password-derived key (v2's derivation, reused verbatim).
 */
export async function writeMultiStoreArchive(
  stores: StoreBackupEntries[],
  password: string,
): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(V2_SALT_BYTES));
  const key = await deriveV2Key(password, salt, V2_ITERATIONS);
  const meta: V3Meta = {
    formatVersion: V3_MULTI_FORMAT_VERSION,
    salt: base64FromBytes(salt),
    iterations: V2_ITERATIONS,
    exportedAt: new Date().toISOString(),
    stores: stores.map((store) =>
      store.name ? { storeId: store.storeId, name: store.name } : { storeId: store.storeId },
    ),
  };

  const zipWriter = new ZipWriter(new BlobWriter('application/zip'));
  await zipWriter.add(V2_META_FILENAME, new TextReader(JSON.stringify(meta)));
  for (const store of stores) {
    for (const [fileName, text] of store.entries) {
      await zipWriter.add(storeArchiveEntryName(store.storeId, fileName), new TextReader(text), {
        rawPassword: key,
      });
    }
  }

  const blob = await zipWriter.close();
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Reads a v3 multi-store archive. Throws CorruptFileError for a missing or
 * incompatible envelope and WrongPasswordError when the entries do not decrypt
 * — the SAME error contract the single-store path exposes, so the UI keeps
 * showing one set of messages. Entries under a store folder the envelope does
 * not list are ignored rather than decrypted.
 */
export async function readMultiStoreArchive(
  payload: Uint8Array,
  password: string,
): Promise<StoreBackupEntries[]> {
  const zipReader = new ZipReader(new BlobReader(new Blob([payload])));
  let entries: Awaited<ReturnType<typeof zipReader.getEntries>>;
  try {
    entries = await zipReader.getEntries();
  } catch {
    throw new CorruptFileError('ZIP extraction failed');
  }

  try {
    const metaEntry = entries.find(
      (entry): entry is FileEntry => !entry.directory && entry.filename === V2_META_FILENAME,
    );
    if (!metaEntry) throw new CorruptFileError('Backup has no envelope');

    let meta: V3Meta;
    try {
      const parsed = JSON.parse(await metaEntry.getData(new TextWriter())) as Partial<V3Meta>;
      if (parsed.formatVersion !== V3_MULTI_FORMAT_VERSION) {
        throw new CorruptFileError('Unsupported backup format version');
      }
      if (typeof parsed.salt !== 'string' || typeof parsed.iterations !== 'number') {
        throw new CorruptFileError('Invalid backup envelope');
      }
      if (!Array.isArray(parsed.stores)) {
        throw new CorruptFileError('Invalid backup envelope');
      }
      const stores: V3StoreRef[] = [];
      for (const ref of parsed.stores) {
        if (!ref || typeof ref.storeId !== 'string' || ref.storeId === '') {
          throw new CorruptFileError('Invalid backup envelope');
        }
        stores.push({
          storeId: ref.storeId,
          ...(typeof ref.name === 'string' ? { name: ref.name } : {}),
        });
      }
      meta = {
        formatVersion: V3_MULTI_FORMAT_VERSION,
        salt: parsed.salt,
        iterations: parsed.iterations,
        exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
        stores,
      };
    } catch (err) {
      if (err instanceof CorruptFileError) throw err;
      throw new CorruptFileError('Invalid backup envelope');
    }

    let key: Uint8Array;
    try {
      key = await deriveV2Key(password, bytesFromBase64(meta.salt), meta.iterations);
    } catch {
      throw new CorruptFileError('Invalid backup envelope');
    }

    const contentsByStore = new Map<string, Map<string, string>>();
    for (const store of meta.stores) {
      contentsByStore.set(store.storeId, new Map<string, string>());
    }

    try {
      for (const entry of entries) {
        if (entry.directory || !entry.getData || entry.filename === V2_META_FILENAME) continue;
        const parsedEntry = parseStoreArchiveEntryName(entry.filename, contentsByStore);
        if (!parsedEntry) continue;
        const text = await entry.getData(new TextWriter(), { rawPassword: key });
        contentsByStore.get(parsedEntry.storeId)!.set(parsedEntry.fileName, text);
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'Invalid password') {
        throw new WrongPasswordError();
      }
      throw new WrongPasswordError('Decryption failed');
    }

    return meta.stores.map((store) => ({
      storeId: store.storeId,
      ...(store.name ? { name: store.name } : {}),
      entries: contentsByStore.get(store.storeId)!,
    }));
  } finally {
    await zipReader.close();
  }
}

/**
 * Splits `stores/<storeId>/<fileName>` into its parts, returning null for any
 * entry that is not inside a store folder listed by the envelope.
 */
function parseStoreArchiveEntryName(
  entryName: string,
  contentsByStore: Map<string, Map<string, string>>,
): { storeId: string; fileName: string } | null {
  if (!entryName.startsWith(V3_STORES_FOLDER)) return null;
  const rest = entryName.slice(V3_STORES_FOLDER.length);
  const separator = rest.indexOf('/');
  if (separator <= 0) return null;
  const storeId = rest.slice(0, separator);
  const fileName = rest.slice(separator + 1);
  if (!fileName) return null;
  if (!contentsByStore.has(storeId)) return null;
  return { storeId, fileName };
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
  /**
   * RETIRED (retire-exchange-rates-register). Typed as a permissive
   * `readonly unknown[]` and never populated or read: an archive carrying
   * `exchange-rates.json` is ignored. The field survives ONLY so
   * pre-existing `ParsedData` fixtures — some of which live in sync test files
   * outside this feature's edit surface — keep compiling; nothing in the app
   * sets it.
   */
  exchangeRates?: readonly unknown[];
  warehouses: Warehouse[];
  warehouseStockLevels: WarehouseStockLevel[];
  warehouseStockMovements: WarehouseStockMovement[];
  channelRates: ChannelRate[];
  // elaboration-module: OPTIONAL so the literals built by pre-existing sync
  // tests/call sites keep compiling. `parseContents` always populates them
  // (legacy archives → []), so real imports never see `undefined`.
  recipes?: Recipe[];
  elaborations?: Elaboration[];
  // store-payment-methods-backup: OPTIONAL — populated ONLY when the archive
  // carries the entry, left `undefined` otherwise. Absent must stay
  // distinguishable from present so an import of an older backup never
  // touches the local config (absent → no-op, unlike the list entries whose
  // absent → [] is a legitimate empty merge).
  storePaymentMethods?: StorePaymentMethodsConfig;
  // messaging-background-offline: OPTIONAL so the literals built by pre-existing
  // sync tests/call sites keep compiling. `parseContents` always populates it
  // (legacy archives → []), so real imports never see `undefined`.
  messagesQueue?: QueuedMessage[];
  // cierre-efectivo (2026-10-14): OPTIONAL so pre-existing sync tests/call
  // sites keep compiling. `parseContents` always populates it (legacy archives
  // → empty store), so real imports never see `undefined`.
  cashClosings?: CashClosingStore;
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

/**
 * Channel-rate reader seam (multipayments): the offline service owns the
 * append-only register; the serializer only reads it for export.
 */
export interface ChannelRateReader {
  getStorageChannelRates(): ChannelRate[];
}

export interface WarehouseReader {
  getStorageWarehouses(): Warehouse[];
  getStorageStockLevels(): WarehouseStockLevel[];
  getStorageMovements(): WarehouseStockMovement[];
}

/**
 * Recipe read seam — the raw stored-JSON string straight from the offline
 * service (elaboration-module). Mirrors the exchange-rates reader shape, but
 * reads the service's already-serialized JSON seam rather than an array (the
 * recipe service exposes `getStorageRecipesJson`).
 */
export interface RecipeReader {
  getStorageRecipesJson(): string;
}

/** Elaboration read seam — mirror of {@link RecipeReader}. */
export interface ElaborationReader {
  getStorageElaborationsJson(): string;
}

/**
 * Store payment-methods config read seam (store-payment-methods-backup): the
 * offline service owns the per-store config; the serializer only reads it for
 * export. `null` means the key is absent (store never configured) — the entry
 * is then NOT written, because absent config is semantically "default".
 */
export interface StorePaymentMethodsReader {
  getStorageStorePaymentMethods(): StorePaymentMethodsConfig | null;
}

/**
 * Offline message-queue read seam (messaging-background-offline): the offline
 * service owns the per-store queue; the serializer only reads its raw stored
 * JSON for export. Mirrors {@link RecipeReader}.
 */
export interface MessagesQueueReader {
  getStorageMessagesQueueJson(): string;
}

/**
 * Cash-closing store read seam (cierre-efectivo): the offline service owns the
 * per-store closings + denomination catalog; the serializer only reads its raw
 * stored JSON for export. Mirrors {@link MessagesQueueReader}.
 */
export interface CashClosingReader {
  getStorageCashClosingsJson(): string;
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

/**
 * Parses the store-payment-methods entry distinguishing ABSENT from PRESENT
 * (store-payment-methods-backup): an archive that never carries the entry
 * (legacy) yields `undefined` — the import must then leave the local config
 * untouched — while a present entry yields the config object. Unlike the list
 * entries, `[]` would be a wrong "absent" spelling: it is a valid config
 * shape here neither semantically nor structurally, and a present-but-invalid
 * entry must still fail loudly via `CorruptFileError`.
 */
function parseOptionalStorePaymentMethods(
  contents: Map<string, string>,
): StorePaymentMethodsConfig | undefined {
  const raw = contents.get(EDataFileName.StorePaymentMethods);
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw) as StorePaymentMethodsConfig;
  } catch {
    throw new CorruptFileError(`Invalid JSON in ${EDataFileName.StorePaymentMethods}`);
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
 * iterations, storeId, exportedAt) followed by the data entries (the 6
 * Angular-named originals plus exchange-rates, warehouses and the
 * elaboration module's recipes/elaborations — data.file.model.ts
 * EDataFileName parity) each AES-encrypted under
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
    // Optional (warehouses-plan): legacy call sites/tests that predate the
    // module omit it; exports then write empty entries and imports parse []
    // for archives that carry none.
    private readonly warehouseReader?: WarehouseReader,
    // Optional (multipayments T4): legacy call sites/tests that predate the
    // channel-rate register omit it; exports then write an empty entry and
    // imports parse [] for archives that carry none.
    private readonly channelRateReader?: ChannelRateReader,
    // Optional (elaboration-module): same legacy-call-site allowance as above;
    // exports then write `[]` and imports parse [] for archives without them.
    private readonly recipeReader?: RecipeReader,
    private readonly elaborationReader?: ElaborationReader,
    // Optional (store-payment-methods-backup): legacy call sites/tests that
    // predate the config omit it; exports then write NO entry and imports leave
    // the field `undefined` for archives that carry none (absent = do not touch
    // the local config on import).
    private readonly storePaymentMethodsReader?: StorePaymentMethodsReader,
    // Optional (messaging-background-offline): legacy call sites/tests that
    // predate the offline message queue omit it; exports then write an empty
    // entry and imports parse [] for archives that carry none.
    private readonly messagesQueueReader?: MessagesQueueReader,
    // Optional (cierre-efectivo): legacy call sites/tests that predate the daily
    // cash-closing omit it; exports then write an empty store and imports parse
    // an empty store for archives that carry none.
    private readonly cashClosingReader?: CashClosingReader,
  ) {}

  private derivePassword(password: string): string {
    // Angular: `password + this.authService.currentUserValue.selectedStoreId`.
    // Plain concatenation, password first, NO separator.
    return password + this.storeId;
  }

  /**
   * Every entry this store's archive carries, as `entryName -> plaintext
   * JSON`, in the SAME order `export()` writes them. Split out so the
   * multi-store backup reuses these exact read seams (raw-JSON passthrough
   * included) for EVERY store instead of a second copy that could drift.
   */
  async collectEntries(): Promise<Map<string, string>> {
    const orders = this.orderReader.getStorageOrders();
    const expenses = this.expenseReader.getStorageExpenses();
    const saleCredits = this.saleCreditReader.getStorageSaleCredits();
    const warehouses = this.warehouseReader?.getStorageWarehouses() ?? [];
    const warehouseStockLevels = this.warehouseReader?.getStorageStockLevels() ?? [];
    const warehouseStockMovements = this.warehouseReader?.getStorageMovements() ?? [];
    const channelRates = this.channelRateReader?.getStorageChannelRates() ?? [];

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
    const warehousesJson = JSON.stringify(warehouses);
    const warehouseStockLevelsJson = JSON.stringify(warehouseStockLevels);
    const warehouseStockMovementsJson = JSON.stringify(warehouseStockMovements);
    const channelRatesJson = JSON.stringify(channelRates);
    // elaboration-module: passthrough from the services' own raw-JSON seams.
    const recipesJson = this.recipeReader?.getStorageRecipesJson() ?? '[]';
    const elaborationsJson = this.elaborationReader?.getStorageElaborationsJson() ?? '[]';
    // store-payment-methods-backup: absent key (store never configured) →
    // NO entry — "absent" in the archive means "default" on import, so a
    // null reader result must stay byte-absent rather than become an empty
    // object in the zip.
    const storePaymentMethods =
      this.storePaymentMethodsReader?.getStorageStorePaymentMethods() ?? null;
    // messaging-background-offline: raw passthrough from the offline service's
    // JSON seam; always written (empty array when the store has no queue).
    const messagesQueueJson = this.messagesQueueReader?.getStorageMessagesQueueJson() ?? '[]';
    // cierre-efectivo: raw passthrough from the offline service's JSON seam;
    // always written (an empty store when the store has no closings).
    const cashClosingsJson =
      this.cashClosingReader?.getStorageCashClosingsJson() ??
      JSON.stringify(emptyCashClosingStore());

    const contents = new Map<string, string>();
    contents.set(EDataFileName.Categories, categoriesJson);
    contents.set(EDataFileName.Products, productsJson);
    contents.set(EDataFileName.InventoryEntries, inventoryJson);
    contents.set(EDataFileName.Orders, ordersJson);
    contents.set(EDataFileName.Expenses, expensesJson);
    contents.set(EDataFileName.SaleCredits, saleCreditsJson);
    contents.set(EDataFileName.Warehouses, warehousesJson);
    contents.set(EDataFileName.WarehouseStockLevels, warehouseStockLevelsJson);
    contents.set(EDataFileName.WarehouseStockMovements, warehouseStockMovementsJson);
    contents.set(EDataFileName.ChannelRates, channelRatesJson);
    contents.set(EDataFileName.Recipes, recipesJson);
    contents.set(EDataFileName.Elaborations, elaborationsJson);
    if (storePaymentMethods) {
      contents.set(EDataFileName.StorePaymentMethods, JSON.stringify(storePaymentMethods));
    }
    contents.set(EDataFileName.MessagesQueue, messagesQueueJson);
    contents.set(EDataFileName.CashClosings, cashClosingsJson);

    return contents;
  }

  /**
   * Reads all entities and writes them as a v2 ZIP: an unencrypted
   * `meta.json` envelope first, then the data entries each AES-encrypted
   * with the per-export password-only key (V2-01/V2-03).
   */
  async export(password: string): Promise<Uint8Array> {
    return writeSingleStoreArchive(this.storeId, await this.collectEntries(), password);
  }

  /**
   * Decrypts and parses all entries. v2 archives (meta.json present)
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
    // meta.json plaintext while the data entries stay encrypted (V2-01).
    const zipReader = new ZipReader(new BlobReader(blob));

    let entries: Awaited<ReturnType<typeof zipReader.getEntries>>;
    try {
      entries = await zipReader.getEntries();
    } catch {
      throw new CorruptFileError('ZIP extraction failed');
    }

    try {
      const metaEntry = entries.find(
        (entry): entry is FileEntry => !entry.directory && entry.filename === V2_META_FILENAME,
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
   * writing anything), then decrypts the data entries with the derived key
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
  private async importV1Fallback(entries: Entry[], password: string): Promise<ParsedData> {
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

  /**
   * Returns the current store data as a plain ParsedData object, without any
   * encryption or ZIP packaging. Used for debug exports (visible only to
   * `lrscott`). This method reads directly from the same repositories/services
   * as `export()`, but returns the parsed objects instead of a ZIP payload.
   */
  async exportPlainData(): Promise<ParsedData> {
    const orders = this.orderReader.getStorageOrders();
    const expenses = this.expenseReader.getStorageExpenses();
    const saleCredits = this.saleCreditReader.getStorageSaleCredits();
    const warehouses = this.warehouseReader?.getStorageWarehouses() ?? [];
    const warehouseStockLevels = this.warehouseReader?.getStorageStockLevels() ?? [];
    const warehouseStockMovements = this.warehouseReader?.getStorageMovements() ?? [];
    const channelRates = this.channelRateReader?.getStorageChannelRates() ?? [];
    // elaboration-module: parse the services' raw-JSON seams (reader optional).
    const recipes = this.recipeReader
      ? (JSON.parse(this.recipeReader.getStorageRecipesJson()) as Recipe[])
      : [];
    const elaborations = this.elaborationReader
      ? (JSON.parse(this.elaborationReader.getStorageElaborationsJson()) as Elaboration[])
      : [];
    // store-payment-methods-backup: parse the single config object, or leave
    // it undefined when the store has none (absent = default, same semantics
    // as the ZIP entry).
    const storePaymentMethods =
      this.storePaymentMethodsReader?.getStorageStorePaymentMethods() ?? undefined;
    // messaging-background-offline: parse the service's raw-JSON seam (reader
    // optional → empty queue).
    const messagesQueue = this.messagesQueueReader
      ? (JSON.parse(this.messagesQueueReader.getStorageMessagesQueueJson()) as QueuedMessage[])
      : [];
    // cierre-efectivo: parse the service's raw-JSON seam (reader optional →
    // empty store).
    const cashClosings = this.cashClosingReader
      ? (JSON.parse(this.cashClosingReader.getStorageCashClosingsJson()) as CashClosingStore)
      : emptyCashClosingStore();

    // Categories and products: read raw JSON and parse
    const categoriesJson = this.categoryRepository.getCategoriesJson() ?? '[]';
    const productsJson = this.productRepository.getProductsJson() ?? '[]';
    const inventoryJson = this.inventoryService.getInventoryEntriesJson();

    // Parse to objects
    const categoryEntries = JSON.parse(categoriesJson) as [string, ProductCategory][];
    const productEntries = JSON.parse(productsJson) as [string, Product][];
    const rawInventory = JSON.parse(inventoryJson) as unknown;
    const inventoryEntries: InventoryEntry[] = Array.isArray(rawInventory)
      ? (rawInventory as [string, InventoryEntry[]][]).flatMap(
          ([, entriesForProduct]) => entriesForProduct,
        )
      : [];

    return {
      categories: categoryEntries.map(([, category]) => category),
      products: productEntries.map(([, product]) => product),
      inventoryEntries,
      orders,
      expenses,
      saleCredits,
      warehouses,
      warehouseStockLevels,
      warehouseStockMovements,
      channelRates,
      recipes,
      elaborations,
      storePaymentMethods,
      messagesQueue,
      cashClosings,
    };
  }

  /**
   * Parses one store's entries into `ParsedData`. Public so the multi-store
   * import can reuse the exact same parse rules (missing entries, `'{}'`
   * sentinel, absent payment-methods) for EVERY store in an archive.
   */
  parseContents(contents: Map<string, string>): ParsedData {
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
      // `exchange-rates.json` is DELIBERATELY absent: the retired register is
      // never read, so an archive written before the retirement imports
      // unchanged instead of failing (retire-exchange-rates-register).
      // Legacy archives carry no warehouses entries → [].
      warehouses: parseJson<Warehouse[]>(contents, EDataFileName.Warehouses, []),
      warehouseStockLevels: parseJson<WarehouseStockLevel[]>(
        contents,
        EDataFileName.WarehouseStockLevels,
        [],
      ),
      warehouseStockMovements: parseJson<WarehouseStockMovement[]>(
        contents,
        EDataFileName.WarehouseStockMovements,
        [],
      ),
      // Legacy archives carry no channel-rates entry → [].
      channelRates: parseJson<ChannelRate[]>(contents, EDataFileName.ChannelRates, []),
      // Legacy archives (v1/Angular) carry no recipes/elaborations → [].
      recipes: parseJson<Recipe[]>(contents, EDataFileName.Recipes, []),
      elaborations: parseJson<Elaboration[]>(contents, EDataFileName.Elaborations, []),
      // store-payment-methods-backup: absent entry → `undefined` (legacy
      // archive: import must NOT touch the local config); present → config.
      storePaymentMethods: parseOptionalStorePaymentMethods(contents),
      // messaging-background-offline: legacy archives carry no messages-queue
      // entry → [].
      messagesQueue: parseJson<QueuedMessage[]>(contents, EDataFileName.MessagesQueue, []),
      // cierre-efectivo: legacy archives carry no cash-closings entry → empty store.
      cashClosings: parseJson<CashClosingStore>(
        contents,
        EDataFileName.CashClosings,
        emptyCashClosingStore(),
      ),
    };
  }
}
