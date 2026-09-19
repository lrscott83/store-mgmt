import { beforeEach, describe, expect, it } from 'vitest';
import { BlobReader, BlobWriter, TextReader, ZipReader, ZipWriter } from '@zip.js/zip.js';
import { Result } from '@store-mgmt/domain';
import type { Elaboration, Product, ProductCategory, Recipe, Warehouse } from '@store-mgmt/domain';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { WarehouseOfflineService } from '~/inventory/lib/services/warehouse-offline-service';
import { RecipeOfflineService } from '~/inventory/lib/services/recipe-offline-service';
import { ElaborationOfflineService } from '~/inventory/lib/services/elaboration-offline-service';
import { DataSerializerService } from '../data-serializer-service';
import { DataSynchronizerService, SynchronizerErrors } from '../data-synchronizer-service';
import type {
  CategoryImportRepo,
  ExpenseImportService,
  InventoryImportService,
  OrderImportService,
  ProductImportRepo,
  SaleCreditImportService,
} from '../data-synchronizer-service';
import type { ParsedData } from '../data-serializer-service';

const STORE_ID = 'store-1';
const PASSWORD = 'pass';

const makeCategoryRepo = (): CategoryImportRepo => ({
  getStorageCategoriesMap: () => new Map(),
  addImportedProductCategory: () => Result.Success(),
  updateImportedProductCategory: () => Result.Success(),
  updateCategories: () => {},
});

/** Product import seam driven by an in-memory map — the "merged product set". */
const makeProductRepo = (products: Product[] = []): ProductImportRepo => {
  const map = new Map(products.map((product) => [product.id, product]));
  return {
    getStorageProductsMap: () => map,
    addImportedProduct: () => Result.Success(),
    updateImportedProduct: () => Result.Success(),
    updateProducts: () => {},
  };
};

const makeInventoryService = (): InventoryImportService => ({
  getStorageInventoriesMap: () => new Map(),
  addImportedEntries: () => Result.Success(),
  updateImportedEntries: () => Result.Success(),
});

const makeOrderService = (): OrderImportService => ({
  getStorageOrders: () => [],
  addImportedOrder: () => Result.Success(),
  updateImportedOrder: () => Result.Success(),
});

const makeExpenseService = (): ExpenseImportService => ({
  getStorageExpenses: () => [],
  addImportedExpense: () => Result.Success(),
  updateImportedExpense: () => Result.Success(),
});

const makeSaleCreditService = (): SaleCreditImportService => ({
  getStorageSaleCredits: () => [],
  addImportedSaleCredit: () => Result.Success(),
  updateImportedSaleCredit: () => Result.Success(),
});

function makeCategory(id: string): ProductCategory {
  return { id, name: id, order: 1, isActive: true };
}

function makeProduct(id: string, categoryId = 'cat-1'): Product {
  return {
    id,
    name: id,
    categoryId,
    categoryName: categoryId,
    price: 100,
    order: 1,
    availableToSale: true,
    discountFromInvantory: false,
    businessId: STORE_ID,
    isActive: true,
    createdDate: new Date(),
    createdByName: 'x',
  };
}

function makeRecipe(id: string, productId: string, isActive = true, outputQty = 1): Recipe {
  return {
    id,
    productId,
    outputQty,
    components: [{ productId: 'ing-1', qty: 1, scrapPct: 0 }],
    laborCost: 0,
    overheadPct: 0,
    isActive,
    createdDate: new Date(),
    createdByName: 'x',
  };
}

function makeElaboration(id: string, warehouseId: string): Elaboration {
  return {
    id,
    recipeId: 'rec-1',
    recipeName: 'Pan',
    productId: 'prod-1',
    warehouseId,
    batches: 1,
    producedQty: 1,
    components: [],
    laborCost: 0,
    overheadPct: 0,
    totalCost: 0,
    unitCost: 0,
    isActive: true,
    createdDate: new Date(),
    createdByName: 'x',
  };
}

function makeWarehouse(id: string, name: string): Warehouse {
  return { id, name, isActive: true, createdDate: new Date(), createdByName: 'x' };
}

function makeData(recipes: Recipe[] = [], elaborations: Elaboration[] = []): ParsedData {
  return {
    categories: [],
    products: [],
    inventoryEntries: [],
    orders: [],
    expenses: [],
    saleCredits: [],
    exchangeRates: [],
    warehouses: [],
    warehouseStockLevels: [],
    warehouseStockMovements: [],
    recipes,
    elaborations,
  };
}

function makeRecipeService(): RecipeOfflineService {
  const productRepo = new ProductRepository(STORE_ID, new ProductCategoryRepository(STORE_ID));
  return new RecipeOfflineService(STORE_ID, productRepo);
}

function makeWarehouseService(): WarehouseOfflineService {
  const productRepo = new ProductRepository(STORE_ID, new ProductCategoryRepository(STORE_ID));
  return new WarehouseOfflineService(
    STORE_ID,
    productRepo,
    new InventoryOfflineService(STORE_ID, productRepo),
  );
}

function makeElaborationService(): ElaborationOfflineService {
  const productRepo = new ProductRepository(STORE_ID, new ProductCategoryRepository(STORE_ID));
  const recipeSvc = new RecipeOfflineService(STORE_ID, productRepo);
  const warehouseSvc = new WarehouseOfflineService(
    STORE_ID,
    productRepo,
    new InventoryOfflineService(STORE_ID, productRepo),
  );
  return new ElaborationOfflineService(
    STORE_ID,
    productRepo,
    recipeSvc,
    warehouseSvc,
    new InventoryOfflineService(STORE_ID, productRepo),
  );
}

/** Builds the synchronizer with the elaboration services, leaving the
 * non-elaboration seams as inert mocks (they are not under test here). */
function makeSynchronizer(opts: {
  productRepo?: ProductImportRepo;
  warehouseSvc?: WarehouseOfflineService;
  recipeSvc?: RecipeOfflineService;
  elaborationSvc?: ElaborationOfflineService;
}): DataSynchronizerService {
  return new DataSynchronizerService(
    STORE_ID,
    makeCategoryRepo(),
    opts.productRepo ?? makeProductRepo(),
    makeInventoryService(),
    makeOrderService(),
    makeExpenseService(),
    makeSaleCreditService(),
    undefined,
    opts.warehouseSvc,
    opts.recipeSvc,
    opts.elaborationSvc,
  );
}

async function readEntryNames(payload: Uint8Array): Promise<string[]> {
  const zipReader = new ZipReader(new BlobReader(new Blob([payload])));
  const entries = await zipReader.getEntries();
  await zipReader.close();
  return entries.map((entry) => entry.filename).sort();
}

/**
 * Builds a LEGACY v1 archive (no meta.json) encrypted with the derived string
 * password (`password + storeId`) — the shape of an archive written before the
 * recipes/elaborations entries existed.
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

describe('DataSynchronizerService — recipes merge (elaboration-module)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('adds new recipes whose finished product exists in the merged product set', async () => {
    const recipeSvc = makeRecipeService();
    const svc = makeSynchronizer({
      productRepo: makeProductRepo([makeProduct('prod-1')]),
      recipeSvc,
    });

    const result = await svc.sync(makeData([makeRecipe('rec-1', 'prod-1')]));

    expect(result.succeeded).toBe(true);
    expect(recipeSvc.getStorageRecipes()).toHaveLength(1);
    expect(result.merges.find((m) => m.entity === 'recipes')).toEqual({
      entity: 'recipes',
      inserted: 1,
      updated: 0,
    });
  });

  it('resolves a finished product imported in the same run (order-independent)', async () => {
    const categoryRepo = new ProductCategoryRepository(STORE_ID);
    const productRepo = new ProductRepository(STORE_ID, categoryRepo);
    categoryRepo.addImportedProductCategory(makeCategory('cat-1'));
    const recipeSvc = new RecipeOfflineService(STORE_ID, productRepo);
    const svc = new DataSynchronizerService(
      STORE_ID,
      categoryRepo,
      productRepo,
      makeInventoryService(),
      makeOrderService(),
      makeExpenseService(),
      makeSaleCreditService(),
      undefined,
      undefined,
      recipeSvc,
    );

    const result = await svc.sync({
      ...makeData([makeRecipe('rec-1', 'prod-1')]),
      categories: [makeCategory('cat-1')],
      products: [makeProduct('prod-1')],
    });

    expect(result.succeeded).toBe(true);
    expect(recipeSvc.getStorageRecipes()).toHaveLength(1);
  });

  it('rejects a recipe whose finished product is not in the merged product set', async () => {
    const recipeSvc = makeRecipeService();
    const svc = makeSynchronizer({ productRepo: makeProductRepo([]), recipeSvc });

    const result = await svc.sync(makeData([makeRecipe('rec-1', 'missing-product')]));

    expect(result.succeeded).toBe(false);
    expect(recipeSvc.getStorageRecipes()).toHaveLength(0);
    const err = result.errors.find((e) => e.entity === 'recipes');
    expect(err?.code).toBe(SynchronizerErrors.RecipesUnexpectedError.code);
  });

  it('enforces one active recipe per product across the merge (existing local active)', async () => {
    const recipeSvc = makeRecipeService();
    recipeSvc.addImportedRecipe(makeRecipe('rec-active', 'prod-1'));
    const svc = makeSynchronizer({
      productRepo: makeProductRepo([makeProduct('prod-1')]),
      recipeSvc,
    });

    const result = await svc.sync(makeData([makeRecipe('rec-2', 'prod-1')]));

    expect(result.succeeded).toBe(false);
    const stored = recipeSvc.getStorageRecipes();
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('rec-active');
    const err = result.errors.find((e) => e.entity === 'recipes');
    expect(err?.code).toBe(SynchronizerErrors.RecipesUnexpectedError.code);
  });

  it('enforces at most one active recipe per product among the incoming rows', async () => {
    const recipeSvc = makeRecipeService();
    const svc = makeSynchronizer({
      productRepo: makeProductRepo([makeProduct('prod-1')]),
      recipeSvc,
    });

    const result = await svc.sync(
      makeData([makeRecipe('rec-1', 'prod-1'), makeRecipe('rec-2', 'prod-1')]),
    );

    expect(result.succeeded).toBe(false);
    const stored = recipeSvc.getStorageRecipes();
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('rec-1');
  });

  it('allows updating the same active recipe (never its own duplicate)', async () => {
    const recipeSvc = makeRecipeService();
    recipeSvc.addImportedRecipe(makeRecipe('rec-1', 'prod-1', true, 1));
    const svc = makeSynchronizer({
      productRepo: makeProductRepo([makeProduct('prod-1')]),
      recipeSvc,
    });

    const result = await svc.sync(makeData([makeRecipe('rec-1', 'prod-1', true, 8)]));

    expect(result.succeeded).toBe(true);
    expect(recipeSvc.getStorageRecipes()[0].outputQty).toBe(8);
    expect(result.merges.find((m) => m.entity === 'recipes')).toEqual({
      entity: 'recipes',
      inserted: 0,
      updated: 1,
    });
  });

  it('reports RecipesUnexpectedError when the write throws (break-only)', async () => {
    const recipeSvc = makeRecipeService();
    recipeSvc.addImportedRecipe = () => {
      throw new Error('storage exploded');
    };
    const svc = makeSynchronizer({
      productRepo: makeProductRepo([makeProduct('prod-1')]),
      recipeSvc,
    });

    const result = await svc.sync(makeData([makeRecipe('rec-1', 'prod-1')]));

    expect(result.succeeded).toBe(false);
    const err = result.errors.find((e) => e.entity === 'recipes');
    expect(err?.code).toBe(SynchronizerErrors.RecipesUnexpectedError.code);
  });
});

describe('DataSynchronizerService — elaborations merge (elaboration-module)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('adds new elaborations whose warehouse exists in the merged warehouse set', async () => {
    const warehouseSvc = makeWarehouseService();
    warehouseSvc.addImportedWarehouse(makeWarehouse('wh-1', 'Central'));
    const elaborationSvc = makeElaborationService();
    const svc = makeSynchronizer({ warehouseSvc, elaborationSvc });

    const result = await svc.sync(makeData([], [makeElaboration('el-1', 'wh-1')]));

    expect(result.succeeded).toBe(true);
    expect(elaborationSvc.getStorageElaborations()).toHaveLength(1);
    expect(result.merges.find((m) => m.entity === 'elaborations')).toEqual({
      entity: 'elaborations',
      inserted: 1,
      updated: 0,
    });
  });

  it('resolves a warehouse imported in the same run', async () => {
    const warehouseSvc = makeWarehouseService();
    const elaborationSvc = makeElaborationService();
    const svc = makeSynchronizer({ warehouseSvc, elaborationSvc });

    const result = await svc.sync({
      ...makeData([], [makeElaboration('el-1', 'wh-1')]),
      warehouses: [makeWarehouse('wh-1', 'Central')],
    });

    expect(result.succeeded).toBe(true);
    expect(elaborationSvc.getStorageElaborations()).toHaveLength(1);
  });

  it('rejects an elaboration whose warehouse does not exist', async () => {
    const warehouseSvc = makeWarehouseService();
    const elaborationSvc = makeElaborationService();
    const svc = makeSynchronizer({ warehouseSvc, elaborationSvc });

    const result = await svc.sync(makeData([], [makeElaboration('el-1', 'missing-wh')]));

    expect(result.succeeded).toBe(false);
    expect(elaborationSvc.getStorageElaborations()).toHaveLength(0);
    const err = result.errors.find((e) => e.entity === 'elaborations');
    expect(err?.code).toBe(SynchronizerErrors.ElaborationsUnexpectedError.code);
  });

  it('updates an existing elaboration by id', async () => {
    const warehouseSvc = makeWarehouseService();
    warehouseSvc.addImportedWarehouse(makeWarehouse('wh-1', 'Central'));
    const elaborationSvc = makeElaborationService();
    elaborationSvc.addImportedElaboration(makeElaboration('el-1', 'wh-1'));
    const svc = makeSynchronizer({ warehouseSvc, elaborationSvc });

    const result = await svc.sync(makeData([], [makeElaboration('el-1', 'wh-1')]));

    expect(result.succeeded).toBe(true);
    expect(elaborationSvc.getStorageElaborations()).toHaveLength(1);
    expect(result.merges.find((m) => m.entity === 'elaborations')).toEqual({
      entity: 'elaborations',
      inserted: 0,
      updated: 1,
    });
  });

  it('reports ElaborationsUnexpectedError when the write throws (break-only)', async () => {
    const warehouseSvc = makeWarehouseService();
    warehouseSvc.addImportedWarehouse(makeWarehouse('wh-1', 'Central'));
    const elaborationSvc = makeElaborationService();
    elaborationSvc.addImportedElaboration = () => {
      throw new Error('storage exploded');
    };
    const svc = makeSynchronizer({ warehouseSvc, elaborationSvc });

    const result = await svc.sync(makeData([], [makeElaboration('el-1', 'wh-1')]));

    expect(result.succeeded).toBe(false);
    const err = result.errors.find((e) => e.entity === 'elaborations');
    expect(err?.code).toBe(SynchronizerErrors.ElaborationsUnexpectedError.code);
  });
});

describe('DataSerializerService — recipes + elaborations roundtrip (elaboration-module)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function makeSerializer() {
    const categoryRepo = new ProductCategoryRepository(STORE_ID);
    const productRepo = new ProductRepository(STORE_ID, categoryRepo);
    categoryRepo.addImportedProductCategory(makeCategory('cat-1'));
    productRepo.addImportedProduct(makeProduct('prod-1'));
    const inventorySvc = new InventoryOfflineService(STORE_ID, productRepo);
    const warehouseSvc = new WarehouseOfflineService(STORE_ID, productRepo, inventorySvc);
    const recipeSvc = new RecipeOfflineService(STORE_ID, productRepo);
    const elaborationSvc = new ElaborationOfflineService(
      STORE_ID,
      productRepo,
      recipeSvc,
      warehouseSvc,
      inventorySvc,
    );
    const serializer = new DataSerializerService(
      STORE_ID,
      categoryRepo,
      productRepo,
      inventorySvc,
      { getStorageOrders: () => [] },
      { getStorageExpenses: () => [] },
      { getStorageSaleCredits: () => [] },
      { getStorageExchangeRates: () => [] },
      warehouseSvc,
      recipeSvc,
      elaborationSvc,
    );
    return { serializer, recipeSvc, elaborationSvc };
  }

  it('exports a recipes.json and an elaborations.json entry', async () => {
    const { serializer, recipeSvc, elaborationSvc } = makeSerializer();
    recipeSvc.addImportedRecipe(makeRecipe('rec-1', 'prod-1'));
    elaborationSvc.addImportedElaboration(makeElaboration('el-1', 'wh-1'));

    const payload = await serializer.export(PASSWORD);
    const names = await readEntryNames(payload);

    expect(names).toContain('recipes.json');
    expect(names).toContain('elaborations.json');
  });

  it('restores recipes and elaborations on import', async () => {
    const { serializer, recipeSvc, elaborationSvc } = makeSerializer();
    recipeSvc.addImportedRecipe(makeRecipe('rec-1', 'prod-1'));
    elaborationSvc.addImportedElaboration(makeElaboration('el-1', 'wh-1'));

    const payload = await serializer.export(PASSWORD);
    const parsed = await serializer.import(payload, PASSWORD);

    expect(parsed.recipes).toHaveLength(1);
    expect(parsed.recipes?.[0].id).toBe('rec-1');
    expect(parsed.elaborations).toHaveLength(1);
    expect(parsed.elaborations?.[0].id).toBe('el-1');
  });

  it('imports a legacy zip without recipes/elaborations as zero of them, without error', async () => {
    const payload = await buildLegacyV1Zip(
      { 'products.json': '[]' },
      PASSWORD + STORE_ID,
    );
    const { serializer, recipeSvc, elaborationSvc } = makeSerializer();

    const parsed = await serializer.import(payload, PASSWORD);

    expect(parsed.recipes).toEqual([]);
    expect(parsed.elaborations).toEqual([]);

    const svc = makeSynchronizer({ recipeSvc, elaborationSvc });
    const result = await svc.sync(parsed);

    expect(result.succeeded).toBe(true);
    expect(result.merges.find((m) => m.entity === 'recipes')).toEqual({
      entity: 'recipes',
      inserted: 0,
      updated: 0,
    });
    expect(result.merges.find((m) => m.entity === 'elaborations')).toEqual({
      entity: 'elaborations',
      inserted: 0,
      updated: 0,
    });
  });
});
