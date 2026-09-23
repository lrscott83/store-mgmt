import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Result, SalePaymentMethod } from '@store-mgmt/domain';
import type { StorePaymentMethodsConfig } from '../../../../shared/lib/payment-methods/store-payment-methods-config-service';
import type { ParsedData } from '../data-serializer-service';
import { DataSynchronizerService, SynchronizerErrors } from '../data-synchronizer-service';
import type {
  CategoryImportRepo,
  ExpenseImportService,
  InventoryImportService,
  OrderImportService,
  ProductImportRepo,
  SaleCreditImportService,
  StorePaymentMethodsImportService,
} from '../data-synchronizer-service';

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

const makeSaleCreditService = (): SaleCreditImportService => ({
  getStorageSaleCredits: () => [],
  addImportedSaleCredit: () => Result.Success(),
  updateImportedSaleCredit: () => Result.Success(),
});

function makeStorePaymentMethodsService(fail = false) {
  const setImportedStorePaymentMethods = vi.fn(
    (_config: StorePaymentMethodsConfig) =>
      fail ? Result.Failure([]) : Result.Success(),
  );
  const svc: StorePaymentMethodsImportService = { setImportedStorePaymentMethods };
  return { svc, setImportedStorePaymentMethods };
}

function makeData(
  storePaymentMethods?: StorePaymentMethodsConfig,
): ParsedData {
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
    channelRates: [],
    ...(storePaymentMethods !== undefined
      ? { storePaymentMethods }
      : {}),
  };
}

const CONFIG: StorePaymentMethodsConfig = {
  enabledMethods: [SalePaymentMethod.Efectivo, SalePaymentMethod.Transferencia],
};

describe('DataSynchronizerService — storePaymentMethods merge (store-payment-methods-backup)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('present config overwrites the local config, reporting one inserted outcome', async () => {
    const { svc: paymentMethodsSvc, setImportedStorePaymentMethods } =
      makeStorePaymentMethodsService();
    const svc = new DataSynchronizerService(
      STORE_ID,
      makeCategoryRepo(),
      makeProductRepo(),
      makeInventoryService(),
      makeOrderService(),
      makeExpenseService(),
      makeSaleCreditService(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      paymentMethodsSvc,
    );

    const result = await svc.sync(makeData(CONFIG));

    expect(result.succeeded).toBe(true);
    expect(setImportedStorePaymentMethods).toHaveBeenCalledTimes(1);
    expect(setImportedStorePaymentMethods).toHaveBeenCalledWith(CONFIG);
    const merge = result.merges.find((m) => m.entity === 'storePaymentMethods');
    expect(merge).toEqual({ entity: 'storePaymentMethods', inserted: 1, updated: 0 });
  });

  it('absent config (legacy archive) is a true no-op: NOT called, no outcome pushed, local config untouched', async () => {
    const { svc: paymentMethodsSvc, setImportedStorePaymentMethods } =
      makeStorePaymentMethodsService();
    const svc = new DataSynchronizerService(
      STORE_ID,
      makeCategoryRepo(),
      makeProductRepo(),
      makeInventoryService(),
      makeOrderService(),
      makeExpenseService(),
      makeSaleCreditService(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      paymentMethodsSvc,
    );

    const result = await svc.sync(makeData());

    expect(result.succeeded).toBe(true);
    expect(setImportedStorePaymentMethods).not.toHaveBeenCalled();
    expect(result.merges.find((m) => m.entity === 'storePaymentMethods')).toBeUndefined();
  });

  it('reports StorePaymentMethodsUnexpectedError when the write fails (break-only)', async () => {
    const { svc: paymentMethodsSvc } = makeStorePaymentMethodsService(true);
    const svc = new DataSynchronizerService(
      STORE_ID,
      makeCategoryRepo(),
      makeProductRepo(),
      makeInventoryService(),
      makeOrderService(),
      makeExpenseService(),
      makeSaleCreditService(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      paymentMethodsSvc,
    );

    const result = await svc.sync(makeData(CONFIG));

    expect(result.succeeded).toBe(false);
    const err = result.errors.find((e) => e.entity === 'storePaymentMethods');
    expect(err?.code).toBe(SynchronizerErrors.StorePaymentMethodsUnexpectedError.code);
  });

  it('reports StorePaymentMethodsUnexpectedError when the write throws', async () => {
    const { svc: paymentMethodsSvc } = makeStorePaymentMethodsService();
    paymentMethodsSvc.setImportedStorePaymentMethods = vi.fn(() => {
      throw new Error('storage exploded');
    });
    const svc = new DataSynchronizerService(
      STORE_ID,
      makeCategoryRepo(),
      makeProductRepo(),
      makeInventoryService(),
      makeOrderService(),
      makeExpenseService(),
      makeSaleCreditService(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      paymentMethodsSvc,
    );

    const result = await svc.sync(makeData(CONFIG));

    expect(result.succeeded).toBe(false);
    const err = result.errors.find((e) => e.entity === 'storePaymentMethods');
    expect(err?.code).toBe(SynchronizerErrors.StorePaymentMethodsUnexpectedError.code);
  });

  it('keeps the legacy merge contract when the service is omitted (legacy call sites)', async () => {
    const svc = new DataSynchronizerService(
      STORE_ID,
      makeCategoryRepo(),
      makeProductRepo(),
      makeInventoryService(),
      makeOrderService(),
      makeExpenseService(),
      makeSaleCreditService(),
    );

    const result = await svc.sync(makeData(CONFIG));

    expect(result.succeeded).toBe(true);
    expect(result.merges.map((m) => m.entity)).toEqual([
      'categories',
      'products',
      'inventoryEntries',
      'orders',
      'expenses',
      'saleCredits',
    ]);
  });
});