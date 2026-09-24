import { describe, expect, it } from 'vitest';
import { Currency } from '@store-mgmt/domain';
import type { BaseResponseModel, UserModel } from '@store-mgmt/domain';
import { parseCsvProducts } from '../../csv-product-parser';
import { ProductOfflineService } from '../product-offline-service';
import { ProductRepository } from '../../repositories/product-repository';
import { ProductCategoryRepository } from '../../repositories/product-category-repository';
import { InventoryOfflineService } from '../../../../inventory/lib/services/inventory-offline-service';
import { useAuthStore } from '~/shared/lib/stores/auth-store';

const STORE_ID = 's1';
const ROW_PRICE = 10;
const ROW_COST = 6;
const ROW_QUANTITY = 12;
const ROW_NAME = 'Papas';
const ROW_CATEGORY = 'Snacks';
const EXISTING_CATEGORY = 'Bebidas';
const EXISTING_NAME = 'Coca Cola';

const MATRIX_DIRECTIONS = [
  { label: 'ausente', currency: undefined },
  { label: 'CUP', currency: Currency.CUP },
  { label: 'USD', currency: Currency.USD },
  { label: 'EUR', currency: Currency.EUR },
  { label: 'CLA', currency: Currency.CLA },
  { label: 'MLC', currency: Currency.MLC },
  { label: 'CAD', currency: Currency.CAD },
  { label: 'MXN', currency: Currency.MXN },
];

interface MatrixCase {
  mode: 'new' | 'existing';
  priceCurrency: Currency | undefined;
  costCurrency: Currency | undefined;
  title: string;
}

const MATRIX_CASES: MatrixCase[] = MATRIX_DIRECTIONS.flatMap((price) =>
  MATRIX_DIRECTIONS.flatMap((cost) => [
    {
      mode: 'new',
      priceCurrency: price.currency,
      costCurrency: cost.currency,
      title: `nuevo · precio=${price.label} costo=${cost.label}`,
    },
    {
      mode: 'existing',
      priceCurrency: price.currency,
      costCurrency: cost.currency,
      title: `existente · precio=${price.label} costo=${cost.label}`,
    },
  ]),
);

// response-envelope-nullability: `data` only narrows to non-null on the succeeded
// branch. These tests only ever exercise the success path, so unwrap once instead of
// repeating an `if (!x.succeeded) throw` guard at every assertion site.
function unwrap<T>(response: BaseResponseModel<T>): T {
  if (!response.succeeded) throw new Error('expected succeeded response');
  return response.data;
}

function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    id: 'u1',
    login: 'jdoe',
    fullName: 'Test User',
    cellPhone: '',
    email: 'jdoe@test.com',
    isActive: true,
    password: '',
    authToken: 'tok',
    refreshToken: 'ref',
    expiresIn: Date.now() + 1000000,
    roles: [],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: 's1',
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
    ...overrides,
  };
}

interface Fixture {
  productRepository: ProductRepository;
  categoryRepository: ProductCategoryRepository;
  service: ProductOfflineService;
  inventoryService: InventoryOfflineService;
}

function setup(): Fixture {
  localStorage.clear();
  useAuthStore.setState({
    user: makeUser({ login: 'jdoe' }),
    isAuthenticated: true,
    isLoading: false,
    error: null,
  });
  const categoryRepository = new ProductCategoryRepository(STORE_ID);
  const productRepository = new ProductRepository(STORE_ID, categoryRepository);
  const service = new ProductOfflineService(STORE_ID, productRepository, categoryRepository);
  const inventoryService = new InventoryOfflineService(STORE_ID, productRepository);
  return { productRepository, categoryRepository, service, inventoryService };
}

/** Seeds a CUP product (Bebidas/Coca Cola, price 15, no currency) and returns its id — the update path's target. */
function seedExistingProduct(ctx: Fixture): string {
  const categoryId = ctx.categoryRepository.addProductCategoryByName(EXISTING_CATEGORY);
  ctx.productRepository.addProduct(categoryId, EXISTING_NAME, 15, '', 1, true, true, true);
  return ctx.productRepository.getProductsByCategoryId(categoryId)[0].id;
}

/**
 * Stored-entry read-back through the USER-FACING view. `getActiveInventoryEntriesStorage()`
 * projects entries to InventoryEntryView; since csv-import-currency-matrix (2026-09-24) the
 * view carries `currency` (it previously dropped it, so UIs showed CUP for USD costs). Reading
 * the view locks BOTH the stored value and the display contract: deleting either the
 * `currency ?? DEFAULT_CURRENCY` line in createInventoryEntry or the `currency: entry.currency`
 * map line in the view fails these cells.
 */
function findEntry(inventoryService: InventoryOfflineService, productId: string) {
  return inventoryService
    .getActiveInventoryEntriesStorage()
    .find((e) => e.productId === productId);
}

/**
 * The exact view orchestration (products.tsx handleCsvImport): currenciesAllowed gates both
 * CSV currencies, then createCsvProducts, then one inventory entry per created row carrying
 * quantity > 0, cost = row cost ?? row price, with the row's costCurrency.
 */
async function runImport(ctx: Fixture, c: MatrixCase, currenciesAllowed: boolean) {
  const row = {
    category: c.mode === 'existing' ? EXISTING_CATEGORY : ROW_CATEGORY,
    name: c.mode === 'existing' ? EXISTING_NAME : ROW_NAME,
    price: ROW_PRICE,
    cost: ROW_COST,
    quantity: ROW_QUANTITY,
    currency: currenciesAllowed ? c.priceCurrency : undefined,
    costCurrency: currenciesAllowed ? c.costCurrency : undefined,
  };
  if (c.mode === 'existing') seedExistingProduct(ctx);
  const createdRow = unwrap(await ctx.service.createCsvProducts([row])).created[0];
  expect(createdRow.existing).toBe(c.mode === 'existing');
  // View orchestration (products.tsx:383-391): one inventory entry per created row
  // carrying quantity > 0, cost = row cost ?? row price, with the row's costCurrency.
  if (createdRow.quantity && createdRow.quantity > 0) {
    ctx.inventoryService.createInventoryEntry(
      createdRow.id,
      createdRow.quantity,
      createdRow.cost ?? createdRow.price,
      createdRow.costCurrency,
    );
  }
  const product = ctx.productRepository.getProductById(createdRow.id)!;
  const entry = findEntry(ctx.inventoryService, createdRow.id);
  if (!entry) throw new Error(`expected an inventory entry for product ${createdRow.id}`);
  return { createdRow, product, entry };
}

/** Same chain, but fed from a raw CSV string through the real parser (smoke path). */
async function importCsv(ctx: Fixture, csvText: string, currenciesAllowed: boolean) {
  const { products } = parseCsvProducts(csvText);
  const csvProducts = products.map((row) => ({
    category: row.category,
    name: row.name,
    price: row.price,
    cost: row.cost,
    quantity: row.quantity,
    currency: currenciesAllowed ? row.currency : undefined,
    costCurrency: currenciesAllowed ? row.costCurrency : undefined,
  }));
  const createdRows = unwrap(await ctx.service.createCsvProducts(csvProducts)).created;
  // View orchestration (products.tsx:383-391): one inventory entry per created row
  // carrying quantity > 0, cost = row cost ?? row price, with the row's costCurrency.
  for (const created of createdRows) {
    if (!created.quantity || created.quantity <= 0) continue;
    ctx.inventoryService.createInventoryEntry(
      created.id,
      created.quantity,
      created.cost ?? created.price,
      created.costCurrency,
    );
  }
  const createdRow = createdRows[0]!;
  const product = ctx.productRepository.getProductById(createdRow.id)!;
  const entry = findEntry(ctx.inventoryService, createdRow.id);
  if (!entry) throw new Error(`expected an inventory entry for product ${createdRow.id}`);
  return { createdRow, product, entry };
}

describe('CSV import currency — matriz completa (servicios reales)', () => {
  describe('con MultiMonedas ACTIVO', () => {
    it.each(MATRIX_CASES)('$title', async (c) => {
      const ctx = setup();
      const { product, entry } = await runImport(ctx, c, true);
      expect(product.price).toBe(ROW_PRICE);
      expect(product.currency).toBe(c.priceCurrency ?? Currency.CUP);
      expect(entry.costPrice).toBe(ROW_COST);
      expect(entry.quantity).toBe(ROW_QUANTITY);
      expect(entry.currency).toBe(c.costCurrency ?? Currency.CUP);
    });
  });

  describe('sin MultiMonedas (siempre CUP)', () => {
    it.each(MATRIX_CASES)('$title', async (c) => {
      const ctx = setup();
      const { product, entry } = await runImport(ctx, c, false);
      expect(product.currency).toBe(Currency.CUP);
      expect(entry.currency).toBe(Currency.CUP);
      expect(product.price).toBe(ROW_PRICE);
      expect(entry.costPrice).toBe(ROW_COST);
      expect(entry.quantity).toBe(ROW_QUANTITY);
    });
  });
});

describe('smoke parser -> cadena de servicios', () => {
  const CSV_USD_USD =
    'categoria,nombre,precio,precio_moneda,costo,precio_costo,cantidad\nSnacks,Chips,10,usd,6,usd,12';

  it('CON módulo activo: usd/usd -> producto USD y entrada USD', async () => {
    const ctx = setup();
    const { product, entry } = await importCsv(ctx, CSV_USD_USD, true);
    expect(product.currency).toBe(Currency.USD);
    expect(entry.currency).toBe(Currency.USD);
    expect(product.price).toBe(10);
    expect(entry.costPrice).toBe(6);
    expect(entry.quantity).toBe(12);
  });

  it('CON módulo activo + producto existente: eur/mlc sobre Bebidas/Coca Cola -> producto EUR y entrada MLC', async () => {
    const ctx = setup();
    seedExistingProduct(ctx);
    const { product, entry } = await importCsv(
      ctx,
      'categoria,nombre,precio,precio_moneda,costo,precio_costo,cantidad\nBebidas,Coca Cola,10,eur,6,mlc,12',
      true,
    );
    expect(product.currency).toBe(Currency.EUR);
    expect(entry.currency).toBe(Currency.MLC);
  });

  it('SIN módulo: el mismo usd/usd -> producto CUP y entrada CUP', async () => {
    const ctx = setup();
    const { product, entry } = await importCsv(ctx, CSV_USD_USD, false);
    expect(product.currency).toBe(Currency.CUP);
    expect(entry.currency).toBe(Currency.CUP);
  });

  it('CON módulo activo, columnas de moneda ausentes -> producto CUP y entrada CUP', async () => {
    const ctx = setup();
    const { product, entry } = await importCsv(
      ctx,
      'categoria,nombre,precio,costo,cantidad\nSnacks,Chips,10,6,12',
      true,
    );
    expect(product.currency).toBe(Currency.CUP);
    expect(entry.currency).toBe(Currency.CUP);
    expect(entry.costPrice).toBe(6);
  });
});

describe('casos borde', () => {
  it('cantidad ausente -> crea el producto pero NO crea entrada de inventario', async () => {
    const ctx = setup();
    const createdRow = unwrap(
      await ctx.service.createCsvProducts([
        {
          category: ROW_CATEGORY,
          name: ROW_NAME,
          price: ROW_PRICE,
          currency: Currency.USD,
          costCurrency: Currency.USD,
        },
      ]),
    ).created[0];
    expect(ctx.productRepository.getProductById(createdRow.id)?.currency).toBe(Currency.USD);
    expect(
      ctx.inventoryService.getActiveInventoryEntriesStorage().find((e) => e.productId === createdRow.id),
    ).toBeUndefined();
  });

  it('cantidad <= 0 (p.ej. -3) -> NO crea entrada de inventario', async () => {
    const ctx = setup();
    const createdRow = unwrap(
      await ctx.service.createCsvProducts([
        {
          category: ROW_CATEGORY,
          name: ROW_NAME,
          price: ROW_PRICE,
          cost: ROW_COST,
          quantity: -3,
          currency: Currency.USD,
          costCurrency: Currency.USD,
        },
      ]),
    ).created[0];
    expect(ctx.productRepository.getProductById(createdRow.id)?.currency).toBe(Currency.USD);
    expect(
      ctx.inventoryService.getActiveInventoryEntriesStorage().find((e) => e.productId === createdRow.id),
    ).toBeUndefined();
  });

  it('costo ausente -> la entrada nace con el PRECIO de la fila y su costCurrency (decisión #7/#16)', async () => {
    const ctx = setup();
    const createdRow = unwrap(
      await ctx.service.createCsvProducts([
        {
          category: ROW_CATEGORY,
          name: ROW_NAME,
          price: ROW_PRICE,
          quantity: ROW_QUANTITY,
          costCurrency: Currency.USD,
        },
      ]),
    ).created[0];
    // View orchestration (products.tsx:383-391): entry carries quantity > 0, cost = row cost ?? row price.
    if (createdRow.quantity && createdRow.quantity > 0) {
      ctx.inventoryService.createInventoryEntry(
        createdRow.id,
        createdRow.quantity,
        createdRow.cost ?? createdRow.price,
        createdRow.costCurrency,
      );
    }
    const product = ctx.productRepository.getProductById(createdRow.id)!;
    const entry = findEntry(ctx.inventoryService, createdRow.id)!;
    expect(entry.costPrice).toBe(ROW_PRICE);
    expect(entry.currency).toBe(Currency.USD);
    expect(product.currency).toBe(Currency.CUP);
  });

  it('producto existente en USD re-importado sin columna de moneda conserva USD (ausente nunca resetea); el costCurrency de la fila sí dirige la entrada', async () => {
    const ctx = setup();
    const categoryId = ctx.categoryRepository.addProductCategoryByName(EXISTING_CATEGORY);
    ctx.productRepository.addProduct(
      categoryId,
      EXISTING_NAME,
      15,
      '',
      1,
      true,
      true,
      true,
      undefined,
      undefined,
      Currency.USD,
    );
    const existingId = ctx.productRepository.getProductsByCategoryId(categoryId)[0].id;

    const createdRow = unwrap(
      await ctx.service.createCsvProducts([
        {
          category: EXISTING_CATEGORY,
          name: EXISTING_NAME,
          price: ROW_PRICE,
          cost: ROW_COST,
          quantity: ROW_QUANTITY,
          costCurrency: Currency.USD,
        },
      ]),
    ).created[0];
    expect(createdRow.existing).toBe(true);
    expect(createdRow.id).toBe(existingId);
    // View orchestration (products.tsx:383-391): entry carries quantity > 0, cost = row cost ?? row price.
    if (createdRow.quantity && createdRow.quantity > 0) {
      ctx.inventoryService.createInventoryEntry(
        createdRow.id,
        createdRow.quantity,
        createdRow.cost ?? createdRow.price,
        createdRow.costCurrency,
      );
    }
    const product = ctx.productRepository.getProductById(createdRow.id)!;
    const entry = findEntry(ctx.inventoryService, createdRow.id)!;
    expect(product.currency).toBe(Currency.USD);
    expect(entry.currency).toBe(Currency.USD);
    expect(entry.costPrice).toBe(ROW_COST);
  });
});