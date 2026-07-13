import { beforeEach, describe, expect, it } from 'vitest';
import type { Order, SaleCredit } from '@store-mgmt/domain';
import { Result } from '@store-mgmt/domain';
import { makeOrderRepoShim, makeSaleCreditRepoShim } from '../sync-repo-shims';
import { DataSynchronizerService } from '~/sync/lib/services/data-synchronizer-service';
import type {
  CategoryImportRepo,
  ExpenseImportService,
  InventoryImportService,
  ProductImportRepo,
} from '~/sync/lib/services/data-synchronizer-service';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';

const storeId = 's1';

function makeOrder(id: string, overrides: Partial<Order> = {}): Order {
  return {
    id,
    orderItems: [],
    total: 1000,
    itemsCount: 1,
    date: new Date('2024-06-01T00:00:00.000Z'),
    type: 0 as Order['type'],
    paymentType: 0 as Order['paymentType'],
    isCredit: false,
    description: '',
    isActive: true,
    createdDate: new Date('2024-06-01T00:00:00.000Z'),
    createdByName: 'admin',
    ...overrides,
  };
}

function makeSaleCredit(id: string, overrides: Partial<SaleCredit> = {}): SaleCredit {
  return {
    id,
    orderId: 'o1',
    client: 'Client',
    total: 500,
    date: new Date('2024-06-01T00:00:00.000Z'),
    paid: 0,
    isPaid: false,
    isActive: true,
    paidDate: null as unknown as Date,
    paidType: null as unknown as SaleCredit['paidType'],
    note: '',
    createdDate: new Date('2024-06-01T00:00:00.000Z'),
    createdByName: 'admin',
    ...overrides,
  };
}

describe('sync-repo-shims (sync-local storage, re-homes the deleted BaseRepository for import.tsx)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('no BaseRepository import — sync-local shims replace it, not reintroduce it', () => {
    it('makeOrderRepoShim/makeSaleCreditRepoShim source does not reference BaseRepository', () => {
      for (const factory of [makeOrderRepoShim, makeSaleCreditRepoShim]) {
        expect(factory.toString()).not.toContain('BaseRepository');
      }
    });
  });

  describe('Order/SaleCredit shims — PLAIN-ARRAY wire-format at the SAME key as order/sale-credit offline services, Map exposed to the synchronizer', () => {
    it('order shim upsert persists a PLAIN array (not [id, order] pairs) at lizoft.store-orders-{storeId}', () => {
      const shim = makeOrderRepoShim();
      shim.upsert(storeId, makeOrder('o1'));

      const raw = localStorage.getItem(`lizoft.store-orders-${storeId}`);
      const parsed = JSON.parse(raw!);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0]).toEqual(expect.objectContaining({ id: 'o1' }));
      expect(Array.isArray(parsed[0])).toBe(false);
    });

    it('order shim getAll exposes a Map keyed by id even though on-disk storage is a plain array', () => {
      localStorage.setItem(`lizoft.store-orders-${storeId}`, JSON.stringify([makeOrder('o1')]));

      const shim = makeOrderRepoShim();
      const all = shim.getAll(storeId);
      expect(all).toBeInstanceOf(Map);
      expect(all.get('o1')?.id).toBe('o1');
    });

    it('order shim getAll reads back a plain array previously written by OrderOfflineService (same key)', () => {
      localStorage.setItem(
        `lizoft.store-orders-${storeId}`,
        JSON.stringify([makeOrder('o1'), makeOrder('o2')]),
      );

      const shim = makeOrderRepoShim();
      expect(shim.getAll(storeId).size).toBe(2);
    });

    it('saleCredit shim upsert persists a PLAIN array at lizoft.store-saleCredits-{storeId}', () => {
      const shim = makeSaleCreditRepoShim();
      shim.upsert(storeId, makeSaleCredit('sc1'));

      const raw = localStorage.getItem(`lizoft.store-saleCredits-${storeId}`);
      const parsed = JSON.parse(raw!);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0]).toEqual(expect.objectContaining({ id: 'sc1' }));
      expect(Array.isArray(parsed[0])).toBe(false);
    });

    it('saleCredit shim getAll exposes a Map keyed by id from plain-array on-disk storage', () => {
      localStorage.setItem(
        `lizoft.store-saleCredits-${storeId}`,
        JSON.stringify([makeSaleCredit('sc1')]),
      );

      const shim = makeSaleCreditRepoShim();
      const all = shim.getAll(storeId);
      expect(all).toBeInstanceOf(Map);
      expect(all.get('sc1')?.id).toBe('sc1');
    });

    it('order shim upsert on an existing id replaces it in place (array stays same length)', () => {
      const shim = makeOrderRepoShim();
      shim.upsert(storeId, makeOrder('o1', { total: 100 }));
      shim.upsert(storeId, makeOrder('o1', { total: 200 }));

      const raw = localStorage.getItem(`lizoft.store-orders-${storeId}`);
      const parsed = JSON.parse(raw!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].total).toBe(200);
    });
  });

  // 6.3 — integration: DataSynchronizerService (orchestration UNCHANGED) driven by the
  // sync-local shims, then read back through the REAL repository/offline-service classes.
  //
  // NOTE (product-sync-import-validation-parity, WU1): categories/products no longer route
  // through `makeCategoryRepoShim`/`makeProductRepoShim` — they route through the REAL
  // `ProductCategoryRepository`/`ProductRepository` (see
  // `data-synchronizer-service.test.ts` T2/T9 for that coverage). The category-shim
  // integration case that lived here is superseded and removed; only noop cat/prod stand-
  // ins remain, required solely to satisfy `DataSynchronizerService`'s constructor for the
  // ORDER-focused assertion below. Full shim-factory retirement (WU2) prunes the
  // remaining Category/Product shim-behavior tests above and deletes the factories
  // themselves from `sync-repo-shims.ts`.
  describe('Integration — DataSynchronizerService orchestration unchanged, storage now re-homed via shims', () => {
    const noopInventoryService: InventoryImportService = {
      getStorageInventoriesMap: () => new Map(),
      addImportedEntries: () => Result.Success(),
      updateImportedEntries: () => Result.Success(),
    };
    const noopExpenseService: ExpenseImportService = {
      getStorageExpenses: () => [],
      addImportedExpense: () => Result.Success(),
      updateImportedExpense: () => Result.Success(),
    };
    const noopCategoryRepo: CategoryImportRepo = {
      getStorageCategoriesMap: () => new Map(),
      addImportedProductCategory: () => Result.Success(),
      updateImportedProductCategory: () => Result.Success(),
      updateCategories: () => {},
    };
    const noopProductRepo: ProductImportRepo = {
      getStorageProductsMap: () => new Map(),
      addImportedProduct: () => Result.Success(),
      updateImportedProduct: () => Result.Success(),
      updateProducts: () => {},
    };

    it('an order import merge leaves lizoft.store-orders-{storeId} in plain-array form readable by OrderOfflineService', async () => {
      const synchronizer = new DataSynchronizerService(
        storeId,
        noopCategoryRepo,
        noopProductRepo,
        noopInventoryService,
        makeOrderRepoShim(),
        noopExpenseService,
        makeSaleCreditRepoShim(),
      );

      const order = makeOrder('o1', { total: 777 });
      const result = await synchronizer.sync({
        categories: [],
        products: [],
        inventoryEntries: [],
        orders: [order],
        expenses: [],
        saleCredits: [],
      });

      expect(result.succeeded).toBe(true);
      const raw = localStorage.getItem(`lizoft.store-orders-${storeId}`);
      const parsed = JSON.parse(raw!);
      expect(Array.isArray(parsed[0])).toBe(false);
      expect(parsed[0].id).toBe('o1');

      const realService = new OrderOfflineService(storeId);
      expect(realService.getStorageOrders().find((o) => o.id === 'o1')?.total).toBe(777);
    });
  });
});
