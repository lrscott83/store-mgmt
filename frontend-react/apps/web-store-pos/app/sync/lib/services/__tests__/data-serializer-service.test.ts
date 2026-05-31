import { describe, it, expect, vi } from 'vitest';
import { unzipSync } from 'fflate';
import {
  DataSerializerService,
  WrongPasswordError,
  CorruptFileError,
} from '../data-serializer-service';
import type {
  CategoryReader,
  ProductReader,
  InventoryReader,
  OrderReader,
  ExpenseReader,
  SaleCreditReader,
  ParsedData,
} from '../data-serializer-service';
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
const PASSWORD = 'hunter2-correct-horse';
const WRONG_PASSWORD = 'not-the-right-password!';

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

function makeService(overrides?: {
  categories?: ProductCategory[];
  products?: Product[];
  inventoryEntries?: InventoryEntry[];
  orders?: Order[];
  expenses?: Expense[];
  saleCredits?: SaleCredit[];
}): DataSerializerService {
  const cats = overrides?.categories ?? [mockCategory];
  const prods = overrides?.products ?? [mockProduct];
  const inv = overrides?.inventoryEntries ?? [mockInventoryEntry];
  const ords = overrides?.orders ?? [mockOrder];
  const exps = overrides?.expenses ?? [mockExpense];
  const creds = overrides?.saleCredits ?? [mockSaleCredit];

  const categoryReader: CategoryReader = { getAll: () => cats };
  const productReader: ProductReader = { getAll: () => prods };
  const inventoryReader: InventoryReader = {
    getAll: (_storeId: string) => makeInventoryMap(inv),
  };
  const orderReader: OrderReader = { getAll: () => ords };
  const expenseReader: ExpenseReader = { getAll: () => exps };
  const saleCreditReader: SaleCreditReader = { getAll: () => creds };

  return new DataSerializerService(
    STORE_ID,
    categoryReader,
    productReader,
    inventoryReader,
    orderReader,
    expenseReader,
    saleCreditReader,
  );
}

// ---------------------------------------------------------------------------
// T1: Envelope round-trip — data arrays survive export→import unchanged
// ---------------------------------------------------------------------------

describe('DataSerializerService', () => {
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
  // T2: ZIP round-trip — data is array (not Map entries)
  // -------------------------------------------------------------------------

  describe('T2 — uniform array format (no Map entries)', () => {
    it('categories.data is a plain array (not Map-entry tuples)', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      const parsed = await svc.import(payload, PASSWORD);
      // If data were serialized as Map entries it would be [[id, obj], ...]
      // A plain array means the first element is the entity object itself
      expect(Array.isArray(parsed.categories)).toBe(true);
      expect(parsed.categories[0]).not.toBeInstanceOf(Array);
    });

    it('inventoryEntries.data is a flat array of InventoryEntry objects', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      const parsed = await svc.import(payload, PASSWORD);
      expect(Array.isArray(parsed.inventoryEntries)).toBe(true);
      expect(parsed.inventoryEntries[0]).not.toBeInstanceOf(Array);
      expect(typeof parsed.inventoryEntries[0].productId).toBe('string');
    });
  });

  // -------------------------------------------------------------------------
  // T3: Encryption round-trip — encrypt→decrypt produces identical bytes
  // -------------------------------------------------------------------------

  describe('T3 — encryption round-trip', () => {
    it('encrypting with the same password twice produces different ciphertexts (random salt+iv)', async () => {
      const svc = makeService();
      const p1 = await svc.export(PASSWORD);
      const p2 = await svc.export(PASSWORD);
      // Different salts/IVs → different ciphertexts (probabilistic; always true in practice)
      expect(Buffer.from(p1).toString('hex')).not.toBe(Buffer.from(p2).toString('hex'));
    });

    it('returns a Uint8Array with length > 28 (at least salt+iv+some ciphertext)', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      expect(payload).toBeInstanceOf(Uint8Array);
      expect(payload.byteLength).toBeGreaterThan(28);
    });

    it('decrypting with the correct password succeeds and returns all 6 entity arrays', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      const parsed = await svc.import(payload, PASSWORD);
      expect(parsed).toHaveProperty('categories');
      expect(parsed).toHaveProperty('products');
      expect(parsed).toHaveProperty('inventoryEntries');
      expect(parsed).toHaveProperty('orders');
      expect(parsed).toHaveProperty('expenses');
      expect(parsed).toHaveProperty('saleCredits');
    });
  });

  // -------------------------------------------------------------------------
  // T4: Wrong-password rejection — throws before any write
  // -------------------------------------------------------------------------

  describe('T4 — wrong-password rejection', () => {
    it('throws WrongPasswordError when decrypting with wrong password', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      await expect(svc.import(payload, WRONG_PASSWORD)).rejects.toThrow(WrongPasswordError);
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

    it('wrong password does not modify any data (no side-effect spies triggered)', async () => {
      const svc = makeService();
      const payload = await svc.export(PASSWORD);
      // import() must throw before returning any parsed data.
      // NOTE: asserting that synchronizer repo writes are NOT called belongs in the
      // Slice 2 container test where import() and sync() are wired together.
      await expect(svc.import(payload, WRONG_PASSWORD)).rejects.toThrow(WrongPasswordError);
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

  // -------------------------------------------------------------------------
  // S-1: ZIP contains exactly one member named sync-data.json (single-envelope layout)
  // -------------------------------------------------------------------------

  describe('S-1 — single-envelope ZIP layout', () => {
    it('the exported ZIP contains exactly one member: sync-data.json', async () => {
      const PBKDF2_HEADER = 28; // salt(16) + iv(12)
      const svc = makeService();
      const payload = await svc.export(PASSWORD);

      // Slice header and decrypt to recover the raw zip bytes
      const salt = payload.slice(0, 16);
      const iv = payload.slice(16, 28);
      const cipher = payload.slice(28);

      const enc = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(PASSWORD),
        'PBKDF2',
        false,
        ['deriveKey'],
      );
      const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 210_000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt'],
      );
      const zipBytes = new Uint8Array(
        await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher),
      );

      // Unzip and inspect members
      const members = unzipSync(zipBytes);
      const memberNames = Object.keys(members);

      expect(memberNames).toHaveLength(1);
      expect(memberNames[0]).toBe('sync-data.json');
    });
  });
});
