import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Currency, Result, SalePaymentMethod } from '@store-mgmt/domain';
import type { ChannelRate } from '@store-mgmt/domain';
import type { ParsedData } from '../data-serializer-service';
import { DataSynchronizerService, SynchronizerErrors } from '../data-synchronizer-service';
import { ChannelRateOfflineService } from '../../../../management/channel-rates/lib/services/channel-rate-offline-service';
import type {
  CategoryImportRepo,
  ChannelRateImportService,
  ExpenseImportService,
  InventoryImportService,
  OrderImportService,
  ProductImportRepo,
  SaleCreditImportService,
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

function makeRate(id: string, value: number, effectiveFrom = '2026-09-01T00:00:00.000Z'): ChannelRate {
  return {
    id,
    method: SalePaymentMethod.Efectivo,
    currency: Currency.CUP,
    value,
    effectiveFrom: new Date(effectiveFrom),
  };
}

function makeChannelService(existing: ChannelRate[] = []) {
  const stored = [...existing];
  const addImportedChannelRate = vi.fn((rate: ChannelRate) => {
    stored.push(rate);
    return Result.Success();
  });
  const svc: ChannelRateImportService = {
    getStorageChannelRates: () => stored,
    addImportedChannelRate,
  };
  return { svc, stored, addImportedChannelRate };
}

function makeData(channelRates: ChannelRate[]): ParsedData {
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
    channelRates,
  };
}

describe('DataSynchronizerService — channelRates merge (multipayments T4)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('inserts imported rows that do not exist locally (append-only)', async () => {
    const channel = makeChannelService();
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
      channel.svc,
    );

    const result = await svc.sync(
      makeData([
        makeRate('rate-1', 700, '2026-09-01T00:00:00.000Z'),
        makeRate('rate-2', 750, '2026-09-10T00:00:00.000Z'),
      ]),
    );

    expect(result.succeeded).toBe(true);
    expect(channel.addImportedChannelRate).toHaveBeenCalledTimes(2);
    expect(channel.stored).toHaveLength(2);
    const merge = result.merges.find((m) => m.entity === 'channelRates');
    expect(merge).toEqual({ entity: 'channelRates', inserted: 2, updated: 0 });
  });

  it('skips rows whose id already exists locally — never overwrites', async () => {
    const channel = makeChannelService([makeRate('rate-1', 700)]);
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
      channel.svc,
    );

    const result = await svc.sync(makeData([makeRate('rate-1', 999)]));

    expect(result.succeeded).toBe(true);
    expect(channel.addImportedChannelRate).not.toHaveBeenCalled();
    expect(channel.stored).toHaveLength(1);
    expect(channel.stored[0].value).toBe(700);
    const merge = result.merges.find((m) => m.entity === 'channelRates');
    expect(merge).toEqual({ entity: 'channelRates', inserted: 0, updated: 0 });
  });

  it('skips a re-import of a row without id via the same deterministic derivation', async () => {
    const row: ChannelRate = {
      method: SalePaymentMethod.Transferencia,
      currency: Currency.MLC,
      value: 350,
      effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
    };
    const channel = makeChannelService([row]);
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
      channel.svc,
    );

    const result = await svc.sync(makeData([row]));

    expect(result.succeeded).toBe(true);
    expect(channel.addImportedChannelRate).not.toHaveBeenCalled();
    const merge = result.merges.find((m) => m.entity === 'channelRates');
    expect(merge).toEqual({ entity: 'channelRates', inserted: 0, updated: 0 });
  });

  it('matches a stored row with the derived id against an imported row that carries one (JSON round-trip)', async () => {
    // A row that came back from an archive has its dates as ISO strings; the
    // stored copy may have been imported earlier without an id. Both must
    // derive the same id, or the re-import would duplicate the row.
    const stored: ChannelRate = {
      method: SalePaymentMethod.Efectivo,
      currency: Currency.CUP,
      value: 700,
      effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
    };
    const channel = makeChannelService([stored]);
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
      channel.svc,
    );

    const incoming = {
      ...stored,
      effectiveFrom: '2026-09-01T00:00:00.000Z' as unknown as Date,
    };
    const result = await svc.sync(makeData([incoming]));

    expect(result.succeeded).toBe(true);
    expect(channel.addImportedChannelRate).not.toHaveBeenCalled();
  });

  it('keeps two id-less rows with the same channel + moment but different values', async () => {
    const channel = makeChannelService();
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
      channel.svc,
    );

    const base = {
      method: SalePaymentMethod.Efectivo,
      currency: Currency.CUP,
      effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
    };
    const result = await svc.sync(makeData([{ ...base, value: 700 }, { ...base, value: 750 }]));

    expect(result.succeeded).toBe(true);
    expect(channel.addImportedChannelRate).toHaveBeenCalledTimes(2);
    expect(channel.stored).toHaveLength(2);
    const merge = result.merges.find((m) => m.entity === 'channelRates');
    expect(merge).toEqual({ entity: 'channelRates', inserted: 2, updated: 0 });
  });

  it('reports ChannelRatesUnexpectedError when the write throws (break-only)', async () => {
    const channel = makeChannelService();
    channel.svc.addImportedChannelRate = vi.fn(() => {
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
      channel.svc,
    );

    const result = await svc.sync(makeData([makeRate('rate-1', 700)]));

    expect(result.succeeded).toBe(false);
    const err = result.errors.find((e) => e.entity === 'channelRates');
    expect(err?.code).toBe(SynchronizerErrors.ChannelRatesUnexpectedError.code);
  });

  it('reports ChannelRatesUnexpectedError for an invalid imported row and inserts nothing', async () => {
    // Drive the real import guard through the merge: value 0 is rejected by
    // ChannelRateOfflineService.addImportedChannelRate with a failed Result.
    const channelService = new ChannelRateOfflineService(STORE_ID);
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
      channelService,
    );

    const result = await svc.sync(makeData([makeRate('rate-0', 0)]));

    expect(result.succeeded).toBe(false);
    const err = result.errors.find((e) => e.entity === 'channelRates');
    expect(err?.code).toBe(SynchronizerErrors.ChannelRatesUnexpectedError.code);
    expect(channelService.getStorageChannelRates()).toHaveLength(0);
  });

  it('carries isActive through the import seam: a deactivated row stays inactive (T19b)', async () => {
    const channelService = new ChannelRateOfflineService(STORE_ID);
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
      channelService,
    );

    const result = await svc.sync(
      makeData([
        { ...makeRate('rate-active', 700), isActive: true },
        { ...makeRate('rate-inactive', 900, '2026-09-10T00:00:00.000Z'), isActive: false },
      ]),
    );

    expect(result.succeeded).toBe(true);
    const stored = channelService.getStorageChannelRates();
    expect(stored).toHaveLength(2);
    expect(stored.find((r) => r.id === 'rate-inactive')?.isActive).toBe(false);
    // The deactivated row is out of the cascade, so the older active row wins.
    const resolved = channelService.getRateAt(
      SalePaymentMethod.Efectivo,
      Currency.CUP,
      new Date('2026-09-20T00:00:00.000Z'),
    );
    expect(resolved.data?.value).toBe(700 * 1_000_000);
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

    const result = await svc.sync(makeData([makeRate('rate-1', 700)]));

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
