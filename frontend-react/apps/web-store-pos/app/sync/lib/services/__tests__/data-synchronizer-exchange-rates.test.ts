import { describe, expect, it, vi } from 'vitest';
import { Result } from '@store-mgmt/domain';
import type { ExchangeRate } from '@store-mgmt/domain';
import type { ParsedData } from '../data-serializer-service';
import {
  DataSynchronizerService,
  SynchronizerErrors,
} from '../data-synchronizer-service';
import type {
  CategoryImportRepo,
  ExpenseImportService,
  InventoryImportService,
  OrderImportService,
  ProductImportRepo,
  SaleCreditImportService,
} from '../data-synchronizer-service';
import type { ExchangeRateImportService } from '../data-synchronizer-service';

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

function makeRate(id: string, value: number): ExchangeRate {
  return { id, date: new Date(`${id}T00:00:00.000Z`), value };
}

function makeExchangeService(existing: ExchangeRate[] = []) {
  const stored = [...existing];
  const addImportedExchangeRate = vi.fn((rate: ExchangeRate) => {
    stored.push(rate);
    return Result.Success();
  });
  const updateImportedExchangeRate = vi.fn((rate: ExchangeRate) => {
    const i = stored.findIndex((r) => r.id === rate.id);
    if (i >= 0) stored[i] = rate;
    return Result.Success();
  });
  const svc: ExchangeRateImportService = {
    getStorageExchangeRates: () => stored,
    addImportedExchangeRate,
    updateImportedExchangeRate,
  };
  return { svc, stored, addImportedExchangeRate, updateImportedExchangeRate };
}

function makeData(exchangeRates: ExchangeRate[]): ParsedData {
  return {
    categories: [],
    products: [],
    inventoryEntries: [],
    orders: [],
    expenses: [],
    saleCredits: [],
    exchangeRates,
  };
}

describe('DataSynchronizerService — exchangeRates merge (daily-exchange-rate)', () => {
  it('adds imported day records that do not exist locally', async () => {
    const exchange = makeExchangeService();
    const svc = new DataSynchronizerService(
      STORE_ID,
      makeCategoryRepo(),
      makeProductRepo(),
      makeInventoryService(),
      makeOrderService(),
      makeExpenseService(),
      makeSaleCreditService(),
      exchange.svc,
    );

    const result = await svc.sync(makeData([makeRate('2026-08-01', 120), makeRate('2026-08-02', 120)]));

    expect(result.succeeded).toBe(true);
    expect(exchange.addImportedExchangeRate).toHaveBeenCalledTimes(2);
    const merge = result.merges.find((m) => m.entity === 'exchangeRates');
    expect(merge).toEqual({ entity: 'exchangeRates', inserted: 2, updated: 0 });
  });

  it('updates (by day-key id) imported records that already exist', async () => {
    const exchange = makeExchangeService([makeRate('2026-08-01', 120)]);
    const svc = new DataSynchronizerService(
      STORE_ID,
      makeCategoryRepo(),
      makeProductRepo(),
      makeInventoryService(),
      makeOrderService(),
      makeExpenseService(),
      makeSaleCreditService(),
      exchange.svc,
    );

    const result = await svc.sync(makeData([makeRate('2026-08-01', 320)]));

    expect(result.succeeded).toBe(true);
    expect(exchange.addImportedExchangeRate).not.toHaveBeenCalled();
    expect(exchange.updateImportedExchangeRate).toHaveBeenCalledTimes(1);
    expect(exchange.stored[0].value).toBe(320);
    const merge = result.merges.find((m) => m.entity === 'exchangeRates');
    expect(merge).toEqual({ entity: 'exchangeRates', inserted: 0, updated: 1 });
  });

  it('reports ExchangeRatesUnexpectedError when the write throws (break-only)', async () => {
    const exchange = makeExchangeService();
    exchange.svc.addImportedExchangeRate = vi.fn(() => {
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
      exchange.svc,
    );

    const result = await svc.sync(makeData([makeRate('2026-08-01', 120)]));

    expect(result.succeeded).toBe(false);
    const err = result.errors.find((e) => e.entity === 'exchangeRates');
    expect(err?.code).toBe(SynchronizerErrors.ExchangeRatesUnexpectedError.code);
  });

  it('keeps a 6-entity merge contract when the service is omitted (legacy call sites)', async () => {
    const svc = new DataSynchronizerService(
      STORE_ID,
      makeCategoryRepo(),
      makeProductRepo(),
      makeInventoryService(),
      makeOrderService(),
      makeExpenseService(),
      makeSaleCreditService(),
    );

    const result = await svc.sync(makeData([makeRate('2026-08-01', 120)]));
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
