import { beforeEach, describe, expect, it } from 'vitest';
import type { Order, Product, ProductCategory, SaleCredit } from '@store-mgmt/domain';
import { Result } from '@store-mgmt/domain';
import {
  makeCategoryRepoShim,
  makeOrderRepoShim,
  makeProductRepoShim,
  makeSaleCreditRepoShim,
} from '../sync-repo-shims';
import { DataSynchronizerService } from '~/sync/lib/services/data-synchronizer-service';
import type {
  ExpenseImportService,
  InventoryImportService,
} from '~/sync/lib/services/data-synchronizer-service';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';

const storeId = 's1';

function makeCategory(id: string, overrides: Partial<ProductCategory> = {}): ProductCategory {
  return { id, name: `Category ${id}`, order: 0, isActive: true, ...overrides };
}

function makeProduct(id: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    name: `Product ${id}`,
    categoryId: 'cat-1',
    categoryName: 'Cat 1',
    price: 10,
    order: 0,
    availableToSale: true,
    discountFromInvantory: true,
    businessId: '',
    isActive: true,
    createdDate: new Date('2024-01-01T00:00:00.000Z'),
    createdByName: 'test',
    ...overrides,
  };
}

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
    it('makeCategoryRepoShim/makeProductRepoShim/makeOrderRepoShim/makeSaleCreditRepoShim source does not reference BaseRepository', () => {
      for (const factory of [
        makeCategoryRepoShim,
        makeProductRepoShim,
        makeOrderRepoShim,
        makeSaleCreditRepoShim,
      ]) {
        expect(factory.toString()).not.toContain('BaseRepository');
      }
    });
  });

  describe('Category/Product shims — Map-entries wire-format at the SAME key as ProductCategoryRepository/ProductRepository', () => {
    it('category shim upsert persists Map-entries at lizoft.store-product-categories-{storeId}', () => {
      const shim = makeCategoryRepoShim();
      shim.upsert(storeId, makeCategory('c1'));

      const raw = localStorage.getItem(`lizoft.store-product-categories-${storeId}`);
      const parsed = JSON.parse(raw!);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0]).toEqual(['c1', expect.objectContaining({ id: 'c1' })]);
    });

    it('category shim getAll reads back what ProductCategoryRepository wrote (Map-entries)', () => {
      const entries: [string, ProductCategory][] = [['c1', makeCategory('c1', { name: 'Bebidas' })]];
      localStorage.setItem(`lizoft.store-product-categories-${storeId}`, JSON.stringify(entries));

      const shim = makeCategoryRepoShim();
      const all = shim.getAll(storeId);
      expect(all.get('c1')?.name).toBe('Bebidas');
    });

    it('category shim save bulk-overwrites the whole Map (used for whole-type revert)', () => {
      const shim = makeCategoryRepoShim();
      shim.upsert(storeId, makeCategory('c1'));
      shim.upsert(storeId, makeCategory('c2'));

      shim.save(storeId, new Map([['c1', makeCategory('c1')]]));

      expect(shim.getAll(storeId).size).toBe(1);
      expect(shim.getAll(storeId).has('c2')).toBe(false);
    });

    it('product shim upsert persists Map-entries at lizoft.store-products-{storeId}', () => {
      const shim = makeProductRepoShim();
      shim.upsert(storeId, makeProduct('p1'));

      const raw = localStorage.getItem(`lizoft.store-products-${storeId}`);
      const parsed = JSON.parse(raw!);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0]).toEqual(['p1', expect.objectContaining({ id: 'p1' })]);
    });

    it('product shim getAll reads back what ProductRepository wrote (Map-entries)', () => {
      const entries: [string, Product][] = [['p1', makeProduct('p1', { name: 'Ron' })]];
      localStorage.setItem(`lizoft.store-products-${storeId}`, JSON.stringify(entries));

      const shim = makeProductRepoShim();
      expect(shim.getAll(storeId).get('p1')?.name).toBe('Ron');
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

    it('a category import merge leaves lizoft.store-product-categories-{storeId} in Map-entries form readable by ProductCategoryRepository', async () => {
      const synchronizer = new DataSynchronizerService(
        storeId,
        makeCategoryRepoShim(),
        makeProductRepoShim(),
        noopInventoryService,
        makeOrderRepoShim(),
        noopExpenseService,
        makeSaleCreditRepoShim(),
      );

      const category = makeCategory('c1', { name: 'Bebidas' });
      const result = await synchronizer.sync({
        categories: [category],
        products: [],
        inventoryEntries: [],
        orders: [],
        expenses: [],
        saleCredits: [],
      });

      expect(result.succeeded).toBe(true);
      const raw = localStorage.getItem(`lizoft.store-product-categories-${storeId}`);
      const parsed = JSON.parse(raw!);
      expect(Array.isArray(parsed[0]) && parsed[0][0] === 'c1').toBe(true);

      const realRepo = new ProductCategoryRepository(storeId);
      expect(realRepo.getProductCategoryById('c1')?.name).toBe('Bebidas');
    });

    it('an order import merge leaves lizoft.store-orders-{storeId} in plain-array form readable by OrderOfflineService', async () => {
      const synchronizer = new DataSynchronizerService(
        storeId,
        makeCategoryRepoShim(),
        makeProductRepoShim(),
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
