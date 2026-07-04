import type { InventoryEntry } from '@store-mgmt/domain';
import type { ParsedData } from './data-serializer-service';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface EntityMergeResult {
  entity: string;
  inserted: number;
  updated: number;
}

export interface SyncEntityError {
  entity: string;
  code: string;
  message: string;
}

export interface SyncResult {
  succeeded: boolean;
  errors: SyncEntityError[];
  merges: EntityMergeResult[];
}

// ---------------------------------------------------------------------------
// Angular parity error codes (SynchronizerErrors + name-uniqueness guards)
// ---------------------------------------------------------------------------
//
// Angular's synchronizer defines exactly 4 "UnexpectedError" codes (Products,
// Categories, Orders, Inventory) — Expenses and SaleCredits reuse
// `OrdersUnexpectedError` in `frontend/.../data-synchronizer.service.ts`
// (`synchronizeExpenses`/`synchronizeSaleCredits` catch blocks both push
// `SynchronizerErrors.OrdersUnexpectedError`). Replicated here verbatim for
// logic parity, per the binding design (engram #642).

export const SynchronizerErrors = {
  CategoriesUnexpectedError: {
    code: 'Synchronizer.CategoriesUnexpectedError',
    message: 'Ocurrió un error inesperado al sincronizar las categorias.',
  },
  ProductsUnexpectedError: {
    code: 'Synchronizer.ProductsUnexpectedError',
    message: 'Ocurrió un error inesperado al sincronizar los productos.',
  },
  OrdersUnexpectedError: {
    code: 'Synchronizer.OrdersUnexpectedError',
    message: 'Ocurrió un error inesperado al sincronizar las ventas.',
  },
  InventoryUnexpectedError: {
    code: 'Synchronizer.InventoryUnexpectedError',
    message: 'Ocurrió un error inesperado al sincronizar el inventario.',
  },
  CategoryNameExists: {
    code: 'ProductCategory.NameExists',
    message: 'El nombre de la categoría ya existe.',
  },
  ProductNameExists: {
    code: 'Product.NameExists',
    message: 'El nombre del producto ya existe.',
  },
} as const;

// ---------------------------------------------------------------------------
// Repository interfaces (injected for testability)
// ---------------------------------------------------------------------------

/**
 * Repos backing entity types that get a name-uniqueness guard AND a
 * whole-type revert-to-pre-import-snapshot on first failed item
 * (Categories, Products — see Angular `ProductCategoryRepository`/
 * `ProductRepository` `addProductCategoryData`/`addProductData`).
 */
export interface NameUniqueRepo<T extends { id: string; name: string }> {
  getAll(storeId: string): Map<string, T>;
  upsert(storeId: string, item: T): void;
  /** Bulk overwrite — used only to revert the whole map to a pre-import snapshot. */
  save(storeId: string, items: Map<string, T>): void;
}

/**
 * Repos backing entity types with break-only (no revert) semantics
 * (Orders, Expenses, SaleCredits).
 */
export interface GenericUpsertRepo<T extends { id: string }> {
  getAll(storeId: string): Map<string, T>;
  upsert(storeId: string, item: T): void;
}

export interface InventoryRepo {
  getAll(storeId: string): Map<string, InventoryEntry[]>;
  save(storeId: string, productId: string, entries: InventoryEntry[]): void;
}

// ---------------------------------------------------------------------------
// Per-type merge outcome (internal)
// ---------------------------------------------------------------------------

interface MergeOutcome {
  merge: EntityMergeResult;
  error?: SyncEntityError;
}

// ---------------------------------------------------------------------------
// DataSynchronizerService
// ---------------------------------------------------------------------------

/**
 * Angular-compatible import synchronizer.
 *
 * Matches `frontend/src/app/application/synchronization/data-synchronizer.service.ts`
 * logic 1:1 (per binding design, engram #642):
 * - Categories are always merged FIRST (Angular unshifts categories.json to
 *   the front of the files list for referential integrity).
 * - Categories/Products: name-uniqueness guard (rejects when another entity
 *   of the same type already has the same `name`, scoped by comparing ids),
 *   items iterated sorted by `order`; on the FIRST failed item, the whole
 *   entity type's map is reverted to its pre-import snapshot.
 * - InventoryEntries/Orders/Expenses/SaleCredits: break-only semantics — the
 *   first failed item stops that entity type's loop, but prior successful
 *   writes for that type are NOT reverted.
 * - `sync()` aggregates errors across ALL 6 entity types and continues
 *   processing subsequent types even if an earlier type failed (mirrors
 *   Angular's `synchronizeFiles`, which is NOT abort-on-first).
 */
export class DataSynchronizerService {
  constructor(
    private readonly storeId: string,
    private readonly categoryRepo: NameUniqueRepo<import('@store-mgmt/domain').ProductCategory>,
    private readonly productRepo: NameUniqueRepo<import('@store-mgmt/domain').Product>,
    private readonly inventoryRepo: InventoryRepo,
    private readonly orderRepo: GenericUpsertRepo<import('@store-mgmt/domain').Order>,
    private readonly expenseRepo: GenericUpsertRepo<import('@store-mgmt/domain').Expense>,
    private readonly saleCreditRepo: GenericUpsertRepo<import('@store-mgmt/domain').SaleCredit>,
  ) {}

  async sync(data: ParsedData): Promise<SyncResult> {
    const merges: EntityMergeResult[] = [];
    const errors: SyncEntityError[] = [];

    const push = (outcome: MergeOutcome) => {
      merges.push(outcome.merge);
      if (outcome.error) errors.push(outcome.error);
    };

    // 1. Categories — first, whole-type revert on first failed item.
    push(
      this.mergeWithRevert(
        'categories',
        this.categoryRepo,
        data.categories,
        SynchronizerErrors.CategoryNameExists,
        SynchronizerErrors.CategoriesUnexpectedError,
      ),
    );

    // 2. Products — whole-type revert on first failed item.
    push(
      this.mergeWithRevert(
        'products',
        this.productRepo,
        data.products,
        SynchronizerErrors.ProductNameExists,
        SynchronizerErrors.ProductsUnexpectedError,
      ),
    );

    // 3. InventoryEntries — grouped by productId, break-only (no revert).
    push(this.mergeInventoryBreakOnly(data.inventoryEntries));

    // 4. Orders — break-only (no revert).
    push(
      this.mergeBreakOnly(
        'orders',
        this.orderRepo,
        data.orders,
        SynchronizerErrors.OrdersUnexpectedError,
      ),
    );

    // 5. Expenses — break-only (no revert). Reuses OrdersUnexpectedError,
    // matching Angular's `synchronizeExpenses` catch block.
    push(
      this.mergeBreakOnly(
        'expenses',
        this.expenseRepo,
        data.expenses,
        SynchronizerErrors.OrdersUnexpectedError,
      ),
    );

    // 6. SaleCredits — break-only (no revert). Reuses OrdersUnexpectedError,
    // matching Angular's `synchronizeSaleCredits` catch block.
    push(
      this.mergeBreakOnly(
        'saleCredits',
        this.saleCreditRepo,
        data.saleCredits,
        SynchronizerErrors.OrdersUnexpectedError,
      ),
    );

    return { succeeded: errors.length === 0, errors, merges };
  }

  // ---------------------------------------------------------------------------
  // Categories / Products — name-uniqueness guard + whole-type revert
  // ---------------------------------------------------------------------------

  private mergeWithRevert<T extends { id: string; name: string; order: number }>(
    entity: string,
    repo: NameUniqueRepo<T>,
    incoming: T[],
    nameExistsError: { code: string; message: string },
    unexpectedError: { code: string; message: string },
  ): MergeOutcome {
    if (incoming.length === 0) {
      return { merge: { entity, inserted: 0, updated: 0 } };
    }

    const snapshot = new Map(repo.getAll(this.storeId));
    let inserted = 0;
    let updated = 0;

    try {
      const sorted = [...incoming].sort((a, b) => a.order - b.order);
      for (const item of sorted) {
        const current = repo.getAll(this.storeId);
        const clash = Array.from(current.values()).find(
          (existing) => existing.name === item.name && existing.id !== item.id,
        );
        if (clash) {
          repo.save(this.storeId, snapshot);
          return {
            merge: { entity, inserted: 0, updated: 0 },
            error: { entity, code: nameExistsError.code, message: nameExistsError.message },
          };
        }
        if (current.has(item.id)) updated++;
        else inserted++;
        repo.upsert(this.storeId, item);
      }
      return { merge: { entity, inserted, updated } };
    } catch {
      repo.save(this.storeId, snapshot);
      return {
        merge: { entity, inserted: 0, updated: 0 },
        error: { entity, code: unexpectedError.code, message: unexpectedError.message },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Orders / Expenses / SaleCredits — break-only, no revert
  // ---------------------------------------------------------------------------

  private mergeBreakOnly<T extends { id: string }>(
    entity: string,
    repo: GenericUpsertRepo<T>,
    incoming: T[],
    unexpectedError: { code: string; message: string },
  ): MergeOutcome {
    if (incoming.length === 0) {
      return { merge: { entity, inserted: 0, updated: 0 } };
    }

    let inserted = 0;
    let updated = 0;

    try {
      for (const item of incoming) {
        const current = repo.getAll(this.storeId);
        if (current.has(item.id)) updated++;
        else inserted++;
        repo.upsert(this.storeId, item);
      }
      return { merge: { entity, inserted, updated } };
    } catch {
      // Break-only: no revert — writes already applied before the failure persist.
      return {
        merge: { entity, inserted, updated },
        error: { entity, code: unexpectedError.code, message: unexpectedError.message },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // InventoryEntries — grouped by productId, break-only, no revert
  // ---------------------------------------------------------------------------

  private mergeInventoryBreakOnly(incoming: InventoryEntry[]): MergeOutcome {
    const entity = 'inventoryEntries';
    if (incoming.length === 0) {
      return { merge: { entity, inserted: 0, updated: 0 } };
    }

    const byProduct = new Map<string, InventoryEntry[]>();
    for (const entry of incoming) {
      const arr = byProduct.get(entry.productId) ?? [];
      arr.push(entry);
      byProduct.set(entry.productId, arr);
    }

    let inserted = 0;
    let updated = 0;

    try {
      const existingMap = this.inventoryRepo.getAll(this.storeId);
      for (const [productId, newEntries] of byProduct) {
        const existingEntries = existingMap.get(productId) ?? [];
        const existingById = new Map(existingEntries.map((e) => [e.id, e]));
        const merged = [...existingEntries];

        for (const newEntry of newEntries) {
          if (existingById.has(newEntry.id)) {
            const idx = merged.findIndex((e) => e.id === newEntry.id);
            if (idx >= 0) merged[idx] = newEntry;
            updated++;
          } else {
            merged.push(newEntry);
            inserted++;
          }
        }

        this.inventoryRepo.save(this.storeId, productId, merged);
      }
      return { merge: { entity, inserted, updated } };
    } catch {
      return {
        merge: { entity, inserted, updated },
        error: {
          entity,
          code: SynchronizerErrors.InventoryUnexpectedError.code,
          message: SynchronizerErrors.InventoryUnexpectedError.message,
        },
      };
    }
  }
}
