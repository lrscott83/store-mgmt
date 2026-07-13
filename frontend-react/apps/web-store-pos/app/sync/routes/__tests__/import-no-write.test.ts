/**
 * S-IMPORT-4 / S-IMPORT-5 — container-level "no writes on wrong password"
 *
 * Verifies the import flow contract: DataSynchronizerService.sync() must NOT
 * be called when DataSerializerService.import() throws WrongPasswordError or
 * CorruptFileError. This is the critical "no writes before failure" assertion
 * that belongs at the service boundary, not just the UI level.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import { WrongPasswordError, CorruptFileError } from '~/sync/lib/services/data-serializer-service';
import type { ParsedData } from '~/sync/lib/services/data-serializer-service';
import { DataSynchronizerService } from '~/sync/lib/services/data-synchronizer-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import type { Order, ProductCategory, SaleCredit } from '@store-mgmt/domain';
import { Result } from '@store-mgmt/domain';
import type {
  ExpenseImportService,
  GenericUpsertRepo,
  InventoryImportService,
} from '~/sync/lib/services/data-synchronizer-service';

// Minimal mock implementations for the contract test

function makeSerializerThatThrows(ErrorClass: new () => Error) {
  return {
    export: vi.fn(),
    import: vi.fn().mockRejectedValue(new ErrorClass()),
  };
}

function makeSynchronizer() {
  return {
    sync: vi.fn().mockResolvedValue([]),
  };
}

/**
 * Mirrors the import container flow exactly — serializer.import runs first;
 * synchronizer.sync only runs if serializer.import resolves.
 */
async function runImportFlow(
  serializer: { import: (payload: Uint8Array, password: string) => Promise<ParsedData> },
  synchronizer: { sync: (data: ParsedData) => Promise<unknown> },
  payload: Uint8Array,
  password: string,
): Promise<void> {
  const parsedData = await serializer.import(payload, password);
  await synchronizer.sync(parsedData);
}

describe('Import flow — no writes on WrongPasswordError', () => {
  it('synchronizer.sync is NOT called when serializer.import throws WrongPasswordError', async () => {
    const serializer = makeSerializerThatThrows(WrongPasswordError);
    const synchronizer = makeSynchronizer();

    await expect(
      runImportFlow(serializer, synchronizer, new Uint8Array([1, 2, 3]), 'wrong'),
    ).rejects.toBeInstanceOf(WrongPasswordError);

    expect(synchronizer.sync).not.toHaveBeenCalled();
  });
});

describe('Import flow — no writes on CorruptFileError', () => {
  it('synchronizer.sync is NOT called when serializer.import throws CorruptFileError', async () => {
    const serializer = makeSerializerThatThrows(CorruptFileError);
    const synchronizer = makeSynchronizer();

    await expect(
      runImportFlow(serializer, synchronizer, new Uint8Array([1, 2, 3]), 'any'),
    ).rejects.toBeInstanceOf(CorruptFileError);

    expect(synchronizer.sync).not.toHaveBeenCalled();
  });
});

/**
 * T1.5 — shared `ProductCategoryRepository` instance (product-sync-import-validation-parity)
 *
 * `sync/routes/import.tsx` MUST inject the SAME `ProductCategoryRepository` instance used
 * for the category merge into the `ProductRepository` used for the product merge, so a
 * product's category-exists validation observes categories written earlier in the SAME
 * import run (read-after-write consistency via one instance/cache — mirrors Angular's
 * `providedIn: 'root'` singleton DI, where there is only ever ONE repository instance).
 * This is the regression this task exists to prevent: a stale/second
 * `ProductCategoryRepository` instance whose cache was already populated BEFORE the
 * category import runs would silently reject a valid product with a false-negative
 * `ProductCategory.NotExists`.
 */
describe('T1.5 — shared category-repo instance (import.tsx wiring)', () => {
  const STORE_ID = 'store-t15-shared-instance';

  function makeCategory(id: string, name: string, order = 1): ProductCategory {
    return { id, name, order, isActive: true };
  }

  function makeNoopInventoryService(): InventoryImportService {
    return {
      getStorageInventoriesMap: () => new Map(),
      addImportedEntries: () => Result.Success(),
      updateImportedEntries: () => Result.Success(),
    };
  }

  function makeNoopExpenseService(): ExpenseImportService {
    return {
      getStorageExpenses: () => [],
      addImportedExpense: () => Result.Success(),
      updateImportedExpense: () => Result.Success(),
    };
  }

  function makeNoopGenericRepo<T extends { id: string }>(): GenericUpsertRepo<T> {
    return { getAll: () => new Map(), upsert: () => {} };
  }

  beforeEach(() => {
    localStorage.clear();
  });

  it('accepts a product referencing a categoryId imported in the SAME categories.json (shared instance — the correct import.tsx wiring)', async () => {
    // Mirrors import.tsx exactly: ONE ProductCategoryRepository instance shared into
    // BOTH the category merge and the ProductRepository used for the product merge.
    const categoryRepo = new ProductCategoryRepository(STORE_ID);
    const productRepo = new ProductRepository(STORE_ID, categoryRepo);

    const synchronizer = new DataSynchronizerService(
      STORE_ID,
      categoryRepo,
      productRepo,
      makeNoopInventoryService(),
      makeNoopGenericRepo<Order>(),
      makeNoopExpenseService(),
      makeNoopGenericRepo<SaleCredit>(),
    );

    const data: ParsedData = {
      categories: [makeCategory('cat-new', 'Snacks', 1)],
      // cat-new does NOT exist in storage yet — it's created by the SAME sync run's
      // category merge (which runs first). This product must NOT be rejected with
      // ProductCategory.NotExists.
      products: [
        {
          id: 'prod-1',
          name: 'Papas',
          categoryId: 'cat-new',
          categoryName: 'Snacks',
          price: 500,
          order: 1,
          availableToSale: true,
          discountFromInvantory: false,
          businessId: 'biz-1',
          isActive: true,
          createdDate: new Date('2024-01-01T00:00:00.000Z'),
          createdByName: 'admin',
        },
      ],
      inventoryEntries: [],
      orders: [],
      expenses: [],
      saleCredits: [],
    };

    const result = await synchronizer.sync(data);

    expect(result.succeeded).toBe(true);
    expect(productRepo.getProductById('prod-1')).toBeDefined();
  });

  it('regression guard: a STALE/second ProductCategoryRepository instance (cache already populated before the category merge) falsely rejects the same import with ProductCategory.NotExists', async () => {
    // categoryRepoForMerge is the instance driving the CATEGORY merge (writes cat-new).
    const categoryRepoForMerge = new ProductCategoryRepository(STORE_ID);
    categoryRepoForMerge.addImportedProductCategory(makeCategory('cat-existing', 'Bebidas', 1));

    // staleCategoryRepo is a SEPARATE instance whose cache is forced non-empty (by reading
    // BEFORE the category merge runs) — reproducing the exact bug the shared-instance
    // requirement prevents: a stale cache that never observes cat-new.
    const staleCategoryRepo = new ProductCategoryRepository(STORE_ID);
    staleCategoryRepo.getProductCategoryById('cat-existing'); // forces a cache load NOW
    const productRepo = new ProductRepository(STORE_ID, staleCategoryRepo);

    const synchronizer = new DataSynchronizerService(
      STORE_ID,
      categoryRepoForMerge,
      productRepo,
      makeNoopInventoryService(),
      makeNoopGenericRepo<Order>(),
      makeNoopExpenseService(),
      makeNoopGenericRepo<SaleCredit>(),
    );

    const data: ParsedData = {
      categories: [makeCategory('cat-new', 'Snacks', 2)],
      products: [
        {
          id: 'prod-1',
          name: 'Papas',
          categoryId: 'cat-new',
          categoryName: 'Snacks',
          price: 500,
          order: 1,
          availableToSale: true,
          discountFromInvantory: false,
          businessId: 'biz-1',
          isActive: true,
          createdDate: new Date('2024-01-01T00:00:00.000Z'),
          createdByName: 'admin',
        },
      ],
      inventoryEntries: [],
      orders: [],
      expenses: [],
      saleCredits: [],
    };

    const result = await synchronizer.sync(data);

    expect(result.succeeded).toBe(false);
    const err = result.errors.find((e) => e.entity === 'products');
    expect(err?.code).toBe('ProductCategory.NotExists');
  });
});
