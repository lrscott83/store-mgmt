import { Result } from '@store-mgmt/domain';
import type { Expense, InventoryEntry, Order, Product, ProductCategory, SaleCredit } from '@store-mgmt/domain';
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
// Angular's synchronizer defines only 4 "UnexpectedError" codes (Products,
// Categories, Orders, Inventory) and — via a copy-paste bug — makes
// `synchronizeExpenses`/`synchronizeSaleCredits` both emit
// `OrdersUnexpectedError` (see `frontend/.../data-synchronizer.service.ts`
// lines 230, 262). That bug is FIXED here, not replicated: Expenses and
// SaleCredits emit their own correct codes. Error codes are internal — never
// serialized into the export .zip — so this does not break the format interop
// mandated by decision #639. Policy: frontend-parity-audit/angular-bugs-policy
// (engram #648).

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
  ExpensesUnexpectedError: {
    code: 'Synchronizer.ExpensesUnexpectedError',
    message: 'Ocurrió un error inesperado al sincronizar los gastos.',
  },
  SaleCreditsUnexpectedError: {
    code: 'Synchronizer.SaleCreditsUnexpectedError',
    message: 'Ocurrió un error inesperado al sincronizar los créditos.',
  },
} as const;

// ---------------------------------------------------------------------------
// Repository interfaces (injected for testability)
// ---------------------------------------------------------------------------

/**
 * Product import repo seam — satisfied structurally by the real `ProductRepository`
 * (Angular parity: `product.repository.ts` `getStorageProductsMap`/`addImportedProduct`/
 * `updateImportedProduct`/`updateProducts`). Narrow, 4-method, reuses the same
 * injected-interface pattern as `InventoryImportService`/`ExpenseImportService` — NO new
 * shared abstraction (rule 12). No `storeId` per-call param: the real repo binds `storeId`
 * at construction (mirrors Angular's root-DI singleton).
 */
export interface ProductImportRepo {
  getStorageProductsMap(): Map<string, Product>;
  addImportedProduct(product: Product): Result;
  updateImportedProduct(product: Product): Result;
  /** Bulk overwrite — revert call, receives the SAME mutated map reference (Gate B). */
  updateProducts(products: Map<string, Product>): void;
}

/**
 * Category import repo seam — satisfied structurally by the real `ProductCategoryRepository`
 * (Angular parity: `product-category.repository.ts` `getStorageCategoriesMap`/
 * `addImportedProductCategory`/`updateImportedProductCategory`/`updateCategories`). Narrow,
 * 4-method, same pattern as `ProductImportRepo` above.
 */
export interface CategoryImportRepo {
  getStorageCategoriesMap(): Map<string, ProductCategory>;
  addImportedProductCategory(category: ProductCategory): Result;
  updateImportedProductCategory(category: ProductCategory): Result;
  /** Bulk overwrite — revert call, receives the SAME mutated map reference (Gate B). */
  updateCategories(categories: Map<string, ProductCategory>): void;
}

/**
 * Inventory import routes through the offline SERVICE, not the raw repo — Angular parity:
 * `data-synchronizer.service.ts` `synchronizeInventoryEntries` (:142-155) reads the raw
 * per-product map via `getStorageInventoriesMap`, then calls `addImportedEntries` for a new
 * productId bucket / `updateImportedEntries` for an existing one. Routing through the service
 * also restores the correct field-level merge (the service's `updateImportedEntries` merges
 * available/isActive/updatedDate/updatedByName; the old inline sync merge wrongly replaced the
 * whole entry).
 */
export interface InventoryImportService {
  getStorageInventoriesMap(): Map<string, InventoryEntry[]>;
  addImportedEntries(productId: string, entries: InventoryEntry[]): Result;
  updateImportedEntries(productId: string, entries: InventoryEntry[]): Result;
}

/**
 * Expense import routes through the offline SERVICE, not the raw repo — Angular parity:
 * `data-synchronizer.service.ts` `synchronizeExpenses` (:210-226) calls
 * `expenseService.addImportedExpense` / `updateImportedExpense` (the domain-command layer),
 * never the repository directly. Mirrors Angular's dependency structure (the service owns the
 * import command; the synchronizer only orchestrates).
 */
export interface ExpenseImportService {
  getStorageExpenses(): Expense[];
  addImportedExpense(expense: Expense): Result;
  updateImportedExpense(expense: Expense): Result;
}

/**
 * SaleCredit import routes through the offline SERVICE, not a raw repo — Angular parity:
 * `data-synchronizer.service.ts` `synchronizeSaleCredits` (:234-264) calls
 * `saleCreditService.addImportedSaleCredit` / `updateImportedSaleCredit` (the domain-command
 * layer), never a generic upsert shim. `updateImportedSaleCredit` carries a PAID-GUARD
 * (`sale-credit-offline.service.ts` :257-274): it overwrites `isActive`/`client`/`note`/
 * `updatedDate`/`updatedByName` unconditionally, but only overwrites `paid`/`isPaid`/`paidDate`
 * when the existing stored credit is unpaid — a generic `GenericUpsertRepo` full-overwrite
 * cannot express this, so SaleCredits get their own narrow seam (mirrors `ExpenseImportService`).
 */
export interface SaleCreditImportService {
  getStorageSaleCredits(): SaleCredit[];
  addImportedSaleCredit(saleCredit: SaleCredit): Result;
  updateImportedSaleCredit(saleCredit: SaleCredit): Result;
}

/**
 * Order import routes through the offline SERVICE, not a raw `GenericUpsertRepo` shim —
 * Angular parity: `data-synchronizer.service.ts` `synchronizeOrders` (:167-200) calls
 * `orderService.addImportedOrder` / `updateImportedOrder` (the domain-command layer), never a
 * generic upsert shim. `updateImportedOrder` carries a NARROW 4-field merge
 * (`order-offline.service.ts` :438-449): it overwrites ONLY `date`/`isActive`/`updatedDate`/
 * `updatedByName` unconditionally, leaving `total`/`orderItems`/`isCredit`/`paymentType` and
 * every other field untouched — a generic `GenericUpsertRepo` full-overwrite cannot express
 * this, so Orders get their own narrow seam (mirrors `SaleCreditImportService`; order-sync-import-parity,
 * the LAST entity migrated off `GenericUpsertRepo`/`mergeBreakOnly`).
 */
export interface OrderImportService {
  getStorageOrders(): Order[];
  addImportedOrder(order: Order): Result;
  updateImportedOrder(order: Order): Result;
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
 * logic 1:1 (per binding design, product-sync-import-validation-parity):
 * - Categories are always merged FIRST (Angular unshifts categories.json to
 *   the front of the files list for referential integrity).
 * - Categories/Products route through the REAL `ProductCategoryRepository`/
 *   `ProductRepository` (injected as `CategoryImportRepo`/`ProductImportRepo`), which own
 *   ALL validation — category-exists, barcode-uniqueness, per-category name-uniqueness,
 *   and order-shift for products; name-uniqueness and order-shift for categories. Items
 *   are iterated sorted by `order`; on the FIRST failed item, the whole entity type's map
 *   is reverted via `updateProducts`/`updateCategories`, receiving the SAME in-loop-mutated
 *   map reference obtained from `getStorageProductsMap`/`getStorageCategoriesMap` at the
 *   start of the loop — NOT a defensive clone (mirrors Angular's literal mutated-ref revert).
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
    private readonly categoryRepo: CategoryImportRepo,
    private readonly productRepo: ProductImportRepo,
    private readonly inventoryService: InventoryImportService,
    private readonly orderService: OrderImportService,
    private readonly expenseService: ExpenseImportService,
    private readonly saleCreditService: SaleCreditImportService,
  ) {}

  async sync(data: ParsedData): Promise<SyncResult> {
    const merges: EntityMergeResult[] = [];
    const errors: SyncEntityError[] = [];

    const push = (outcome: MergeOutcome) => {
      merges.push(outcome.merge);
      if (outcome.error) errors.push(outcome.error);
    };

    // 1. Categories — first, whole-type revert on first failed item.
    push(this.mergeCategoriesViaRepository(data.categories));

    // 2. Products — whole-type revert on first failed item.
    push(this.mergeProductsViaRepository(data.products));

    // 3. InventoryEntries — grouped by productId, break-only (no revert).
    push(this.mergeInventoryBreakOnly(data.inventoryEntries));

    // 4. Orders — routed through the offline SERVICE (Angular parity), break-only (no
    // revert), with a narrow 4-field merge inside updateImportedOrder. Emits
    // OrdersUnexpectedError (Angular's own code on this path — no copy-paste bug here).
    push(this.mergeOrdersViaService(data.orders));

    // 5. Expenses — routed through the offline SERVICE (Angular parity), break-only (no
    // revert). Emits its own ExpensesUnexpectedError (Angular's copy-paste bug of reusing
    // OrdersUnexpectedError is fixed here).
    push(this.mergeExpensesViaService(data.expenses));

    // 6. SaleCredits — routed through the offline SERVICE (Angular parity), break-only (no
    // revert), with a paid-guard partial-merge inside updateImportedSaleCredit. Emits its own
    // SaleCreditsUnexpectedError (Angular's copy-paste bug is fixed here).
    push(this.mergeSaleCreditsViaService(data.saleCredits));

    return { succeeded: errors.length === 0, errors, merges };
  }

  // ---------------------------------------------------------------------------
  // Categories / Products — routed through the real domain repositories, which own
  // ALL validation (category-exists, barcode-uniqueness, per-category name-uniqueness,
  // order-shift for products; name-uniqueness + order-shift for categories). The
  // synchronizer only ORCHESTRATES: capture the storage map once, sort incoming by
  // `order`, add-vs-update by id, break on first failure, revert with the SAME
  // in-loop-mutated map reference (Gate B — do NOT clone; matches Angular
  // `synchronizeCategories`/`synchronizeProducts` 1:1, `data-synchronizer.service.ts`
  // :68-131).
  // ---------------------------------------------------------------------------

  /** 1:1 port of Angular `synchronizeCategories` (data-synchronizer.service.ts:100-131). */
  private mergeCategoriesViaRepository(incoming: ProductCategory[]): MergeOutcome {
    const entity = 'categories';
    if (incoming.length === 0) {
      return { merge: { entity, inserted: 0, updated: 0 } };
    }

    const categories = this.categoryRepo.getStorageCategoriesMap();
    let inserted = 0;
    let updated = 0;

    try {
      let result: Result = Result.Success();
      const sorted = [...incoming].sort((a, b) => a.order - b.order);
      for (const category of sorted) {
        const isUpdate = categories.has(category.id);
        result = isUpdate
          ? this.categoryRepo.updateImportedProductCategory(category)
          : this.categoryRepo.addImportedProductCategory(category);
        if (!result.succeeded) break;
        if (isUpdate) updated++;
        else inserted++;
      }
      if (!result.succeeded) {
        this.categoryRepo.updateCategories(categories);
        const failure = result.errors[0];
        return {
          merge: { entity, inserted: 0, updated: 0 },
          error: { entity, code: failure.code, message: failure.description },
        };
      }
      return { merge: { entity, inserted, updated } };
    } catch {
      return {
        merge: { entity, inserted: 0, updated: 0 },
        error: {
          entity,
          code: SynchronizerErrors.CategoriesUnexpectedError.code,
          message: SynchronizerErrors.CategoriesUnexpectedError.message,
        },
      };
    }
  }

  /** 1:1 port of Angular `synchronizeProducts` (data-synchronizer.service.ts:68-98). */
  private mergeProductsViaRepository(incoming: Product[]): MergeOutcome {
    const entity = 'products';
    if (incoming.length === 0) {
      return { merge: { entity, inserted: 0, updated: 0 } };
    }

    const products = this.productRepo.getStorageProductsMap();
    let inserted = 0;
    let updated = 0;

    try {
      let result: Result = Result.Success();
      const sorted = [...incoming].sort((a, b) => a.order - b.order);
      for (const product of sorted) {
        const isUpdate = products.has(product.id);
        result = isUpdate
          ? this.productRepo.updateImportedProduct(product)
          : this.productRepo.addImportedProduct(product);
        if (!result.succeeded) break;
        if (isUpdate) updated++;
        else inserted++;
      }
      if (!result.succeeded) {
        this.productRepo.updateProducts(products);
        const failure = result.errors[0];
        return {
          merge: { entity, inserted: 0, updated: 0 },
          error: { entity, code: failure.code, message: failure.description },
        };
      }
      return { merge: { entity, inserted, updated } };
    } catch {
      return {
        merge: { entity, inserted: 0, updated: 0 },
        error: {
          entity,
          code: SynchronizerErrors.ProductsUnexpectedError.code,
          message: SynchronizerErrors.ProductsUnexpectedError.message,
        },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Orders — routed through the offline SERVICE (Angular parity, not a raw repo/shim)
  // ---------------------------------------------------------------------------

  /**
   * Mirrors Angular `data-synchronizer.service.ts` `synchronizeOrders` (:167-200): builds a map
   * of stored orders, then routes each imported order through the SERVICE —
   * `addImportedOrder` when new, `updateImportedOrder` when it already exists — breaking on
   * the first non-succeeded Result. The narrow 4-field merge lives inside `updateImportedOrder`
   * itself (not here) and does not affect insert/update counts. Break-only (no revert); an
   * unexpected throw yields `OrdersUnexpectedError` (Angular's own code on this path — no
   * copy-paste bug to fix here, unlike Expenses/SaleCredits).
   */
  private mergeOrdersViaService(incoming: Order[]): MergeOutcome {
    if (incoming.length === 0) {
      return { merge: { entity: 'orders', inserted: 0, updated: 0 } };
    }

    let inserted = 0;
    let updated = 0;

    try {
      const existing = new Map(this.orderService.getStorageOrders().map((o) => [o.id, o]));
      for (const order of incoming) {
        const isNew = !existing.has(order.id);
        if (isNew) {
          existing.set(order.id, order);
          inserted++;
        } else {
          updated++;
        }
        const result = isNew
          ? this.orderService.addImportedOrder(order)
          : this.orderService.updateImportedOrder(order);
        if (!result.succeeded) {
          return {
            merge: { entity: 'orders', inserted, updated },
            error: {
              entity: 'orders',
              code: SynchronizerErrors.OrdersUnexpectedError.code,
              message: SynchronizerErrors.OrdersUnexpectedError.message,
            },
          };
        }
      }
      return { merge: { entity: 'orders', inserted, updated } };
    } catch {
      // Break-only: no revert — writes already applied before the failure persist.
      return {
        merge: { entity: 'orders', inserted, updated },
        error: {
          entity: 'orders',
          code: SynchronizerErrors.OrdersUnexpectedError.code,
          message: SynchronizerErrors.OrdersUnexpectedError.message,
        },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Expenses — routed through the offline SERVICE (Angular parity, not raw repo)
  // ---------------------------------------------------------------------------

  /**
   * Mirrors Angular `data-synchronizer.service.ts` `synchronizeExpenses` (:202-227): builds a
   * map of stored expenses, then routes each imported expense through the SERVICE —
   * `addImportedExpense` when new, `updateImportedExpense` when it already exists — breaking on
   * the first non-succeeded Result. Break-only (no revert); an unexpected throw yields
   * `ExpensesUnexpectedError` (Angular's copy-paste OrdersUnexpectedError bug stays fixed here).
   */
  private mergeExpensesViaService(incoming: Expense[]): MergeOutcome {
    if (incoming.length === 0) {
      return { merge: { entity: 'expenses', inserted: 0, updated: 0 } };
    }

    let inserted = 0;
    let updated = 0;

    try {
      const existing = new Map(this.expenseService.getStorageExpenses().map((e) => [e.id, e]));
      for (const expense of incoming) {
        const isNew = !existing.has(expense.id);
        if (isNew) {
          existing.set(expense.id, expense);
          inserted++;
        } else {
          updated++;
        }
        const result = isNew
          ? this.expenseService.addImportedExpense(expense)
          : this.expenseService.updateImportedExpense(expense);
        if (!result.succeeded) {
          return {
            merge: { entity: 'expenses', inserted, updated },
            error: {
              entity: 'expenses',
              code: SynchronizerErrors.ExpensesUnexpectedError.code,
              message: SynchronizerErrors.ExpensesUnexpectedError.message,
            },
          };
        }
      }
      return { merge: { entity: 'expenses', inserted, updated } };
    } catch {
      // Break-only: no revert — writes already applied before the failure persist.
      return {
        merge: { entity: 'expenses', inserted, updated },
        error: {
          entity: 'expenses',
          code: SynchronizerErrors.ExpensesUnexpectedError.code,
          message: SynchronizerErrors.ExpensesUnexpectedError.message,
        },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // SaleCredits — routed through the offline SERVICE (Angular parity, not raw repo)
  // ---------------------------------------------------------------------------

  /**
   * Mirrors Angular `data-synchronizer.service.ts` `synchronizeSaleCredits` (:234-264): builds a
   * map of stored sale credits, then routes each imported credit through the SERVICE —
   * `addImportedSaleCredit` when new, `updateImportedSaleCredit` when it already exists —
   * breaking on the first non-succeeded Result. The paid-guard partial-merge lives inside
   * `updateImportedSaleCredit` itself (not here) and does not affect insert/update counts.
   * Break-only (no revert); an unexpected throw yields `SaleCreditsUnexpectedError` (Angular's
   * copy-paste OrdersUnexpectedError bug stays fixed here).
   */
  private mergeSaleCreditsViaService(incoming: SaleCredit[]): MergeOutcome {
    if (incoming.length === 0) {
      return { merge: { entity: 'saleCredits', inserted: 0, updated: 0 } };
    }

    let inserted = 0;
    let updated = 0;

    try {
      const existing = new Map(
        this.saleCreditService.getStorageSaleCredits().map((c) => [c.id, c]),
      );
      for (const saleCredit of incoming) {
        const isNew = !existing.has(saleCredit.id);
        if (isNew) {
          existing.set(saleCredit.id, saleCredit);
          inserted++;
        } else {
          updated++;
        }
        const result = isNew
          ? this.saleCreditService.addImportedSaleCredit(saleCredit)
          : this.saleCreditService.updateImportedSaleCredit(saleCredit);
        if (!result.succeeded) {
          return {
            merge: { entity: 'saleCredits', inserted, updated },
            error: {
              entity: 'saleCredits',
              code: SynchronizerErrors.SaleCreditsUnexpectedError.code,
              message: SynchronizerErrors.SaleCreditsUnexpectedError.message,
            },
          };
        }
      }
      return { merge: { entity: 'saleCredits', inserted, updated } };
    } catch {
      // Break-only: no revert — writes already applied before the failure persist.
      return {
        merge: { entity: 'saleCredits', inserted, updated },
        error: {
          entity: 'saleCredits',
          code: SynchronizerErrors.SaleCreditsUnexpectedError.code,
          message: SynchronizerErrors.SaleCreditsUnexpectedError.message,
        },
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
      // Angular `synchronizeInventoryEntries` (:142-155): read the raw storage map from the
      // SERVICE, then route each product bucket through addImportedEntries (NEW productId) or
      // updateImportedEntries (EXISTING productId). The service owns the merge logic
      // (field-level for updates) — the synchronizer only decides add-vs-update and counts.
      const existingMap = this.inventoryService.getStorageInventoriesMap();
      for (const [productId, newEntries] of byProduct) {
        const existingById = new Map(
          (existingMap.get(productId) ?? []).map((e) => [e.id, e]),
        );
        for (const newEntry of newEntries) {
          if (existingById.has(newEntry.id)) updated++;
          else inserted++;
        }

        const result = existingMap.has(productId)
          ? this.inventoryService.updateImportedEntries(productId, newEntries)
          : this.inventoryService.addImportedEntries(productId, newEntries);
        if (!result.succeeded) {
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
