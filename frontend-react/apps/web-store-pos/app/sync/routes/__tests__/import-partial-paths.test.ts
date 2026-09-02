import { describe, it, expect, beforeEach } from 'vitest';
import { Result, PaymentType, ExpenseType, OrderType } from '@store-mgmt/domain';
import type { ParsedData } from '~/sync/lib/services/data-serializer-service';
import { DataSynchronizerService } from '~/sync/lib/services/data-synchronizer-service';
import type {
  ExpenseImportService,
  InventoryImportService,
  OrderImportService,
  SaleCreditImportService,
} from '~/sync/lib/services/data-synchronizer-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';

/**
 * [FC-C3] sync/routes/import.tsx — additional paths — Vitest
 * docs/testing/frontend-coverage/FC-C3.md
 *
 * Tests success paths and partial-error paths that the existing
 * import-no-write.test.ts does not cover.
 */

const STORE_ID = 'store-import-paths';

function makeCategory(id: string, name: string, order = 1) {
  return { id, name, order, isActive: true };
}

function makeProduct(id: string, name: string, categoryId: string) {
  return {
    id,
    name,
    categoryId,
    categoryName: 'Test',
    price: 100,
    order: 1,
    availableToSale: true,
    discountFromInvantory: false,
    businessId: 'biz',
    isActive: true,
    createdDate: new Date('2024-01-01T00:00:00.000Z'),
    createdByName: 'admin',
  };
}

function makeNoopServices(): {
  inventory: InventoryImportService;
  order: OrderImportService;
  expense: ExpenseImportService;
  credit: SaleCreditImportService;
} {
  return {
    inventory: {
      getStorageInventoriesMap: () => new Map(),
      addImportedEntries: () => Result.Success(),
      updateImportedEntries: () => Result.Success(),
    },
    order: {
      getStorageOrders: () => [],
      addImportedOrder: () => Result.Success(),
      updateImportedOrder: () => Result.Success(),
    },
    expense: {
      getStorageExpenses: () => [],
      addImportedExpense: () => Result.Success(),
      updateImportedExpense: () => Result.Success(),
    },
    credit: {
      getStorageSaleCredits: () => [],
      addImportedSaleCredit: () => Result.Success(),
      updateImportedSaleCredit: () => Result.Success(),
    },
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('Import flow — full success', () => {
  it('sync returns succeeded=true with valid data', async () => {
    const categoryRepo = new ProductCategoryRepository(STORE_ID);
    const productRepo = new ProductRepository(STORE_ID, categoryRepo);
    const services = makeNoopServices();

    const synchronizer = new DataSynchronizerService(
      STORE_ID,
      categoryRepo,
      productRepo,
      services.inventory,
      services.order,
      services.expense,
      services.credit,
    );

    const data: ParsedData = {
      categories: [makeCategory('cat-1', 'Bebidas')],
      products: [makeProduct('prod-1', 'Coca-Cola', 'cat-1')],
      inventoryEntries: [],
      orders: [],
      expenses: [],
      saleCredits: [],
    };

    const result = await synchronizer.sync(data);
    expect(result.succeeded).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('categories and products persist after sync', async () => {
    const categoryRepo = new ProductCategoryRepository(STORE_ID);
    const productRepo = new ProductRepository(STORE_ID, categoryRepo);
    const services = makeNoopServices();

    const synchronizer = new DataSynchronizerService(
      STORE_ID,
      categoryRepo,
      productRepo,
      services.inventory,
      services.order,
      services.expense,
      services.credit,
    );

    const data: ParsedData = {
      categories: [makeCategory('cat-1', 'Bebidas')],
      products: [makeProduct('prod-1', 'Coca-Cola', 'cat-1')],
      inventoryEntries: [],
      orders: [],
      expenses: [],
      saleCredits: [],
    };

    await synchronizer.sync(data);

    expect(categoryRepo.getProductCategoryById('cat-1')).toBeDefined();
    expect(productRepo.getProductById('prod-1')).toBeDefined();
  });
});

describe('Import flow — partial errors', () => {
  it('sync returns succeeded=false when some products fail validation', async () => {
    const categoryRepo = new ProductCategoryRepository(STORE_ID);
    const productRepo = new ProductRepository(STORE_ID, categoryRepo);

    // Mock expense service to return a failure for one expense
    const services = makeNoopServices();
    services.expense.addImportedExpense = () =>
      Result.Failure([{ code: 'DuplicatedData', description: 'Duplicate' }]);

    const synchronizer = new DataSynchronizerService(
      STORE_ID,
      categoryRepo,
      productRepo,
      services.inventory,
      services.order,
      services.expense,
      services.credit,
    );

    const data: ParsedData = {
      categories: [makeCategory('cat-1', 'Bebidas')],
      products: [makeProduct('prod-1', 'Coca-Cola', 'cat-1')],
      inventoryEntries: [],
      orders: [],
      expenses: [{ id: 'exp-1', type: ExpenseType.Alquiler, total: 500, note: '', paymentType: PaymentType.Efectivo, date: new Date(), isActive: true, createdDate: new Date(), createdByName: 'admin' }],
      saleCredits: [],
    };

    const result = await synchronizer.sync(data);
    expect(result.succeeded).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('valid entities still sync even when one entity type fails', async () => {
    const categoryRepo = new ProductCategoryRepository(STORE_ID);
    const productRepo = new ProductRepository(STORE_ID, categoryRepo);

    const services = makeNoopServices();
    services.order.addImportedOrder = () =>
      Result.Failure([{ code: 'ValidationError', description: 'Bad order' }]);

    const synchronizer = new DataSynchronizerService(
      STORE_ID,
      categoryRepo,
      productRepo,
      services.inventory,
      services.order,
      services.expense,
      services.credit,
    );

    const data: ParsedData = {
      categories: [makeCategory('cat-1', 'Bebidas')],
      products: [makeProduct('prod-1', 'Coca-Cola', 'cat-1')],
      inventoryEntries: [],
      orders: [{ id: 'ord-1', orderItems: [], total: 500, itemsCount: 1, date: new Date(), type: OrderType.Normal, paymentType: PaymentType.Efectivo, isCredit: false, description: '', isActive: true, createdDate: new Date(), createdByName: 'admin' }],
      expenses: [],
      saleCredits: [],
    };

    const result = await synchronizer.sync(data);
    // Categories and products should still be synced even though orders failed
    expect(categoryRepo.getProductCategoryById('cat-1')).toBeDefined();
    expect(productRepo.getProductById('prod-1')).toBeDefined();
    // But orders failed
    expect(result.succeeded).toBe(false);
  });
});
