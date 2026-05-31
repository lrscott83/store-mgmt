import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import type {
  ProductCategory,
  Product,
  InventoryEntry,
  Order,
  Expense,
  SaleCredit,
} from '@store-mgmt/domain';

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
// Envelope types
// ---------------------------------------------------------------------------

export interface SyncEnvelope {
  version: 1;
  exportedAt: string;
  storeId: string;
  entities: {
    categories: ProductCategory[];
    products: Product[];
    inventoryEntries: InventoryEntry[];
    orders: Order[];
    expenses: Expense[];
    saleCredits: SaleCredit[];
  };
}

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
// Crypto constants
// ---------------------------------------------------------------------------

const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flattenInventoryMap(map: Map<string, InventoryEntry[]>): InventoryEntry[] {
  const result: InventoryEntry[] = [];
  for (const entries of map.values()) {
    result.push(...entries);
  }
  return result;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ---------------------------------------------------------------------------
// DataSerializerService
// ---------------------------------------------------------------------------

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

  /**
   * Reads all 6 entities, wraps them in a uniform envelope, zips with fflate,
   * then encrypts with AES-GCM (PBKDF2/SHA-256, 210k iterations).
   * Returns: [salt(16)][iv(12)][AES-GCM ciphertext+tag]
   */
  async export(password: string): Promise<Uint8Array> {
    // 1. Collect entities
    const categories = this.categoryReader.getAll();
    const products = this.productReader.getAll();
    const inventoryEntries = flattenInventoryMap(this.inventoryRepo.getAll(this.storeId));
    const orders = this.orderReader.getAll();
    const expenses = this.expenseReader.getAll();
    const saleCredits = this.saleCreditReader.getAll();

    // 2. Build uniform envelope
    const envelope: SyncEnvelope = {
      version: 1,
      exportedAt: new Date().toISOString(),
      storeId: this.storeId,
      entities: { categories, products, inventoryEntries, orders, expenses, saleCredits },
    };

    // 3. ZIP the envelope (single JSON file for simplicity — envelope contains all)
    const jsonBytes = strToU8(JSON.stringify(envelope));
    const zipped = zipSync({ 'sync-data.json': jsonBytes });

    // 4. Derive AES-GCM key with random salt
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const key = await deriveKey(password, salt);

    // 5. Encrypt the zipped bytes
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      zipped,
    );

    // 6. Prepend [salt(16)][iv(12)] to the ciphertext+tag
    const header = new Uint8Array(SALT_BYTES + IV_BYTES);
    header.set(salt, 0);
    header.set(iv, SALT_BYTES);

    const cipherBytes = new Uint8Array(ciphertext);
    const result = new Uint8Array(header.byteLength + cipherBytes.byteLength);
    result.set(header, 0);
    result.set(cipherBytes, header.byteLength);

    return result;
  }

  /**
   * Decrypts the payload (AES-GCM), unzips, parses the envelope.
   * Throws WrongPasswordError on auth-tag failure before any write.
   * Throws CorruptFileError on bad envelope shape.
   */
  async import(payload: Uint8Array, password: string): Promise<ParsedData> {
    // 1. Slice header
    const salt = payload.slice(0, SALT_BYTES);
    const iv = payload.slice(SALT_BYTES, SALT_BYTES + IV_BYTES);
    const cipher = payload.slice(SALT_BYTES + IV_BYTES);

    // 2. Derive key from password + salt
    const key = await deriveKey(password, salt);

    // 3. Decrypt — auth-tag failure → WrongPasswordError (no writes happen before this)
    let zipped: ArrayBuffer;
    try {
      zipped = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'OperationError') {
        throw new WrongPasswordError();
      }
      throw new WrongPasswordError('Decryption failed');
    }

    // 4. Unzip
    let unzipped: ReturnType<typeof unzipSync>;
    try {
      unzipped = unzipSync(new Uint8Array(zipped));
    } catch {
      throw new CorruptFileError('ZIP extraction failed');
    }

    // 5. Parse envelope
    const jsonFile = unzipped['sync-data.json'];
    if (!jsonFile) {
      throw new CorruptFileError('Missing sync-data.json in archive');
    }

    let envelope: unknown;
    try {
      envelope = JSON.parse(strFromU8(jsonFile));
    } catch {
      throw new CorruptFileError('Invalid JSON in archive');
    }

    // 6. Validate envelope shape
    if (
      typeof envelope !== 'object' ||
      envelope === null ||
      (envelope as SyncEnvelope).version !== 1 ||
      typeof (envelope as SyncEnvelope).entities !== 'object' ||
      (envelope as SyncEnvelope).entities === null
    ) {
      throw new CorruptFileError('Invalid envelope version or missing entities');
    }

    const env = envelope as SyncEnvelope;
    const ent = env.entities;

    return {
      categories: Array.isArray(ent.categories) ? ent.categories : [],
      products: Array.isArray(ent.products) ? ent.products : [],
      inventoryEntries: Array.isArray(ent.inventoryEntries) ? ent.inventoryEntries : [],
      orders: Array.isArray(ent.orders) ? ent.orders : [],
      expenses: Array.isArray(ent.expenses) ? ent.expenses : [],
      saleCredits: Array.isArray(ent.saleCredits) ? ent.saleCredits : [],
    };
  }
}
