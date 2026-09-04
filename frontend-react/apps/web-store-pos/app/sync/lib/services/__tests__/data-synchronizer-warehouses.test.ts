import { beforeEach, describe, expect, it } from 'vitest';
import { Result } from '@store-mgmt/domain';
import type {
  ExchangeRate,
  Warehouse,
  WarehouseStockLevel,
  WarehouseStockMovement,
} from '@store-mgmt/domain';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { WarehouseOfflineService } from '~/inventory/lib/services/warehouse-offline-service';
import { DataSerializerService } from '../data-serializer-service';
import {
  DataSynchronizerService,
  SynchronizerErrors,
} from '../data-synchronizer-service';
import type {
  CategoryImportRepo,
  ExchangeRateImportService,
  ExpenseImportService,
  InventoryImportService,
  OrderImportService,
  ProductImportRepo,
  SaleCreditImportService,
} from '../data-synchronizer-service';
import type { ParsedData } from '../data-serializer-service';

const STORE_ID = 'store-1';

const makeCategoryRepo = (): CategoryImportRepo => ({
  getStorageCategoriesMap: () => new Map(),
  addImportedProductCategory: () => Result.Success(),
  updateImportedProductCategory: () => Result.Success(),
  updateCategories: () => {},
});

const makeProductRepo = (): ProductImportRepo => ({
  getStorageProductsMap: () => new Map(),
  addImportedProduct: () => Result.Success(),
  updateImportedProduct: () => Result.Success(),
  updateProducts: () => {},
});

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

const makeExchangeService = (): ExchangeRateImportService => ({
  getStorageExchangeRates: () => [] as ExchangeRate[],
  addImportedExchangeRate: () => Result.Success(),
  updateImportedExchangeRate: () => Result.Success(),
});

const makeSaleCreditService = (): SaleCreditImportService => ({
  getStorageSaleCredits: () => [],
  addImportedSaleCredit: () => Result.Success(),
  updateImportedSaleCredit: () => Result.Success(),
});

function makeWarehouse(id: string, name: string): Warehouse {
  return { id, name, isActive: true, createdDate: new Date(), createdByName: 'x' };
}

function makeLevel(warehouseId: string, productId: string, onHand: number, costPrice: number): WarehouseStockLevel {
  return { id: `${warehouseId}:${productId}`, warehouseId, productId, onHand, costPrice, createdDate: new Date() };
}

function makeMovement(id: string, warehouseId: string): WarehouseStockMovement {
  return {
    id,
    warehouseId,
    productId: 'prod-1',
    type: 'purchase_in',
    quantity: 10,
    reason: null,
    createdDate: new Date(),
    createdByName: 'x',
  };
}

function makeData(
  warehouses: Warehouse[],
  stockLevels: WarehouseStockLevel[],
  movements: WarehouseStockMovement[],
): ParsedData {
  return {
    categories: [],
    products: [],
    inventoryEntries: [],
    orders: [],
    expenses: [],
    saleCredits: [],
    exchangeRates: [],
    warehouses,
    warehouseStockLevels: stockLevels,
    warehouseStockMovements: movements,
  };
}

function makeWarehouseService() {
  const service = new WarehouseOfflineService(
    STORE_ID,
    new ProductRepository(STORE_ID, new ProductCategoryRepository(STORE_ID)),
    new InventoryOfflineService(
      STORE_ID,
      new ProductRepository(STORE_ID, new ProductCategoryRepository(STORE_ID)),
    ),
  );
  return service;
}

describe('DataSynchronizerService — warehouses merge (warehouses-plan)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('adds new warehouses, stock levels and movements', async () => {
    const warehouseSvc = makeWarehouseService();
    const svc = new DataSynchronizerService(
      STORE_ID,
      makeCategoryRepo(),
      makeProductRepo(),
      makeInventoryService(),
      makeOrderService(),
      makeExpenseService(),
      makeSaleCreditService(),
      undefined,
      warehouseSvc,
    );

    const result = await svc.sync(
      makeData(
        [makeWarehouse('wh-1', 'Central')],
        [makeLevel('wh-1', 'prod-1', 24, 660)],
        [makeMovement('mv-1', 'wh-1')],
      ),
    );

    expect(result.succeeded).toBe(true);
    expect(warehouseSvc.getStorageWarehouses()).toHaveLength(1);
    expect(warehouseSvc.getStorageStockLevels()).toHaveLength(1);
    expect(warehouseSvc.getStorageMovements()).toHaveLength(1);

    const entities = result.merges.map((m) => m.entity);
    expect(entities).toContain('warehouses');
    expect(entities).toContain('warehouseStockLevels');
    expect(entities).toContain('warehouseStockMovements');
    expect(result.merges.find((m) => m.entity === 'warehouses')).toEqual({
      entity: 'warehouses',
      inserted: 1,
      updated: 0,
    });
    expect(result.merges.find((m) => m.entity === 'warehouseStockLevels')).toEqual({
      entity: 'warehouseStockLevels',
      inserted: 1,
      updated: 0,
    });
    expect(result.merges.find((m) => m.entity === 'warehouseStockMovements')).toEqual({
      entity: 'warehouseStockMovements',
      inserted: 1,
      updated: 0,
    });
  });

  it('updates existing warehouses and stock levels by key; movements never duplicate', async () => {
    const warehouseSvc = makeWarehouseService();
    // Seed existing rows through the service (real storage).
    warehouseSvc.addImportedWarehouse(makeWarehouse('wh-1', 'Viejo'));
    warehouseSvc.addImportedStockLevel(makeLevel('wh-1', 'prod-1', 10, 700));
    warehouseSvc.addImportedMovement(makeMovement('mv-1', 'wh-1'));

    const svc = new DataSynchronizerService(
      STORE_ID,
      makeCategoryRepo(),
      makeProductRepo(),
      makeInventoryService(),
      makeOrderService(),
      makeExpenseService(),
      makeSaleCreditService(),
      undefined,
      warehouseSvc,
    );

    const result = await svc.sync(
      makeData(
        [makeWarehouse('wh-1', 'Nuevo')],
        [makeLevel('wh-1', 'prod-1', 24, 660)],
        // mv-1 ya existe localmente → se salta; mv-2 es nuevo → se agrega.
        [makeMovement('mv-1', 'wh-1'), makeMovement('mv-2', 'wh-1')],
      ),
    );

    expect(result.succeeded).toBe(true);
    expect(warehouseSvc.getWarehouseById('wh-1')!.name).toBe('Nuevo');
    expect(warehouseSvc.getStockLevel('wh-1', 'prod-1')!.onHand).toBe(24);
    expect(warehouseSvc.getStorageMovements()).toHaveLength(2);
    expect(result.merges.find((m) => m.entity === 'warehouses')).toEqual({
      entity: 'warehouses',
      inserted: 0,
      updated: 1,
    });
    expect(result.merges.find((m) => m.entity === 'warehouseStockMovements')).toEqual({
      entity: 'warehouseStockMovements',
      inserted: 1,
      updated: 0,
    });
  });

  it('reports WarehousesUnexpectedError when the write throws (break-only)', async () => {
    const warehouseSvc = makeWarehouseService();
    const broken = warehouseSvc as WarehouseOfflineService & {
      addImportedWarehouse: (w: Warehouse) => Result;
    };
    broken.addImportedWarehouse = () => {
      throw new Error('storage exploded');
    };

    const svc = new DataSynchronizerService(
      STORE_ID,
      makeCategoryRepo(),
      makeProductRepo(),
      makeInventoryService(),
      makeOrderService(),
      makeExpenseService(),
      makeSaleCreditService(),
      undefined,
      broken,
    );

    const result = await svc.sync(makeData([makeWarehouse('wh-1', 'Central')], [], []));
    expect(result.succeeded).toBe(false);
    const err = result.errors.find((e) => e.entity === 'warehouses');
    expect(err?.code).toBe(SynchronizerErrors.WarehousesUnexpectedError.code);
  });

  it('keeps a 7-entity merge contract when the warehouse service is omitted (legacy call sites)', async () => {
    const svc = new DataSynchronizerService(
      STORE_ID,
      makeCategoryRepo(),
      makeProductRepo(),
      makeInventoryService(),
      makeOrderService(),
      makeExpenseService(),
      makeSaleCreditService(),
      makeExchangeService(),
    );

    const result = await svc.sync(makeData([makeWarehouse('wh-1', 'Central')], [], []));
    expect(result.succeeded).toBe(true);
    expect(result.merges.map((m) => m.entity)).toEqual([
      'categories',
      'products',
      'inventoryEntries',
      'orders',
      'expenses',
      'saleCredits',
      'exchangeRates',
    ]);
  });
});

describe('DataSerializerService — warehouses roundtrip (warehouses-plan)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('exports and imports the three warehouse entities', async () => {
    const categoryRepository = new ProductCategoryRepository(STORE_ID);
    const productRepository = new ProductRepository(STORE_ID, categoryRepository);
    const inventorySvc = new InventoryOfflineService(STORE_ID, productRepository);
    const warehouseSvc = new WarehouseOfflineService(STORE_ID, productRepository, inventorySvc);

    categoryRepository.addImportedProductCategory({
      id: 'cat-1',
      name: 'Cerveza',
      order: 1,
      isActive: true,
    });
    productRepository.addImportedProduct({
      id: 'prod-1',
      name: 'Cerveza X',
      categoryId: 'cat-1',
      categoryName: 'Cerveza',
      price: 700,
      order: 1,
      availableToSale: true,
      discountFromInvantory: true,
      businessId: STORE_ID,
      isActive: true,
      createdDate: new Date(),
      createdByName: 'x',
    });

    warehouseSvc.createWarehouse('Central');
    const movement = warehouseSvc.recordMovement({
      type: 'purchase_in',
      warehouseId: warehouseSvc.getStorageWarehouses()[0].id,
      productId: 'prod-1',
      quantity: 24,
      costPrice: 660,
    });
    expect(movement.succeeded).toBe(true);

    const serializer = new DataSerializerService(
      STORE_ID,
      categoryRepository,
      productRepository,
      inventorySvc,
      { getStorageOrders: () => [] },
      { getStorageExpenses: () => [] },
      { getStorageSaleCredits: () => [] },
      { getStorageExchangeRates: () => [] },
      warehouseSvc,
    );

    const payload = await serializer.export('pass');
    const parsed = await serializer.import(payload, 'pass');

    expect(parsed.warehouses).toHaveLength(1);
    expect(parsed.warehouseStockLevels).toHaveLength(1);
    expect(parsed.warehouseStockMovements).toHaveLength(1);
    expect(parsed.warehouses[0].name).toBe('Central');
    expect(parsed.warehouseStockLevels[0].onHand).toBe(24);
    expect(parsed.warehouseStockLevels[0].costPrice).toBe(660);
    expect(parsed.warehouseStockMovements[0].type).toBe('purchase_in');
  });
});