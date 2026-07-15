import type {
  BaseResponseModel,
  InventoryEntry,
  InventoryEntryCost,
  InventoryEntryView,
  OrderItem,
} from '@store-mgmt/domain';
import { DataResult, InventoryErrors, ProductErrors, Result, success } from '@store-mgmt/domain';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { startOfDay, addDays } from '~/shared/lib/date-utils';
import {
  hasAvailableProductToSale,
  type ProductAvailabilityFields,
} from '~/sales/lib/product-availability';
import { getCurrentUserLogin } from '~/shared/lib/auth/current-user';

/**
 * Optional eligibility context for {@link InventoryOfflineService.getAvailableInventoryCosts}.
 * When supplied, gates the product exactly like Angular's
 * `InventoryOfflineService.getAvailableInventories` -> `hasAvailableProductToSale` chain
 * (frontend/src/app/application/entries/inventory-offline.service.ts:397-442) BEFORE any FIFO
 * cost allocation happens or any entry is mutated: inactive / not-available-to-sale products
 * yield an empty cost list, and — when the inventory module is enabled AND the product
 * discounts from inventory — insufficient active stock also yields an empty list. When the
 * module is disabled or the product doesn't discount from inventory, Angular's own bypass
 * branch applies (matches `hasAvailableProductToSale` branch 4) and the FIFO computation
 * proceeds unblocked, exactly as Angular does.
 *
 * Optional (rather than required) so the many pre-existing FIFO-mechanics unit tests that only
 * care about entry ordering/persistence — not product eligibility — are unaffected; the one real
 * production caller (`OrderOfflineService.create`) always supplies it.
 *
 * L4 map diff-matrix #6 / prioritized-list item #7 (sdd/frontend-parity-audit, Stage 2.1).
 */
export interface InventoryCostEligibility {
  product: ProductAvailabilityFields | undefined;
  hasInventoryModule: boolean;
}

/**
 * Available stock grouped by category → product.
 * InventoryCategoryView is not in the domain package; defined here for UI consumption.
 */
export interface InventoryProductStock {
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  totalAvailable: number;
  /**
   * Weighted-average cost price per unit across this product's active inventory entries:
   * Σ(entry.available · entry.costPrice) / Σ(entry.available).
   * Mirrors Angular's InventoryOfflineService.getAverageCostPrice
   * (frontend/src/app/application/entries/inventory-offline.service.ts:341-349).
   */
  avgCostPrice: number;
}

export interface InventoryCategoryView {
  categoryId: string;
  categoryName: string;
  /**
   * Sum of totalAvailable across the category's products.
   * Mirrors Angular's getTotalQuantity (inventory-offline.service.ts:317-323).
   */
  totalQuantity: number;
  /**
   * Total inventory value for the category: Σ(product.avgCostPrice · product.totalAvailable).
   * Mirrors Angular's getTotalCostPrice (inventory-offline.service.ts:325-331).
   */
  totalCostPrice: number;
  products: InventoryProductStock[];
}

/**
 * Per-product FIFO breakdown — sync equivalent of Angular's InventoryEntriesView
 * (inventory-entries.view.ts). `availableEntries` reuses domain's InventoryEntryCost
 * (`id`, not Angular's `inventoryId` — Batch 1 rename already applies here).
 */
export interface InventoryEntriesView {
  productId: string;
  productName: string;
  productAvailable: number;
  availableEntries: InventoryEntryCost[];
}

function generateId(): string {
  return crypto.randomUUID();
}

/**
 * InventoryOfflineService — full Batch 3 implementation.
 * Persistence is inlined (no shared `InventoryRepository` — that class has no Angular
 * correlate, playbook rule 12): per-instance cache (`inventories`/`lastInventoriesKey`),
 * reloaded only when empty or the store key changes, auto-init on empty read, Map-entries
 * wire format, and date-only revival — 1:1 port of Angular's
 * `inventory-offline.service.ts:39-44,485-554`. Same inline template as the already-shipped
 * `ProductRepository` (sales/lib/repositories/product-repository.ts).
 *
 * Spec §6.3; Scenarios S-I1 through S-I6.
 */
export class InventoryOfflineService {
  private inventories: Map<string, InventoryEntry[]> | null = null;
  private lastInventoriesKey: string | undefined;

  /**
   * Mirrors Angular's `InventoryOfflineService` constructor DI
   * (inventory-offline.service.ts:35 injects `ProductRepository`). The injected
   * `ProductRepository` backs the product-existence guards on `create`,
   * `updateInventoryEntry`, and `isNotSoldEntry`.
   */
  constructor(
    private readonly storeId: string,
    private readonly productRepository: ProductRepository,
  ) {}

  // ─── Read methods ────────────────────────────────────────────────────────

  /**
   * 1:1 port of Angular's `getActiveInventoryEntriesStorage`
   * (inventory-offline.service.ts:226) — returns all active inventory entries as
   * InventoryEntryView[]. productName is empty string since we don't have a product
   * service here — callers that need product names should enrich at the container
   * level (pre-existing body divergence vs. Angular's own productName enrichment,
   * out of scope for this rename — migrate ≠ optimize).
   */
  getActiveInventoryEntriesStorage(): InventoryEntryView[] {
    const map = this.getStorageInventoriesMap();
    const result: InventoryEntryView[] = [];
    for (const [productId, entries] of map) {
      for (const entry of entries) {
        if (!entry.isActive) continue;
        result.push({
          id: entry.id,
          productId,
          productName: '',
          quantity: entry.quantity,
          costPrice: entry.costPrice,
          date: entry.date,
          isActive: entry.isActive,
        });
      }
    }
    return result;
  }

  /**
   * 1:1 port of Angular's `getStorageInventoriesMap` (inventory-offline.service.ts:39-41):
   * returns the RAW per-product entry map straight from storage — no isActive filtering, no
   * view mapping. Used by the import synchronizer to decide add-vs-update per product
   * (Angular's `synchronizeInventoryEntries` reads it the same way).
   */
  getStorageInventoriesMap(): Map<string, InventoryEntry[]> {
    if (
      !this.inventories ||
      this.inventories.size === 0 ||
      this.getCurrentStorageKey() !== this.lastInventoriesKey
    ) {
      this.inventories = this.getInventoriesFromLocalStorage();
    }
    return this.inventories;
  }

  /**
   * Returns active entries for TODAY. Fase 4 (inventory-offline-service-parity, GATE-C —
   * Angular-exact rename+ignore-date body): renamed from `getByDate`; the `date` param is
   * ACCEPTED BUT IGNORED — the method ALWAYS computes today's window internally, mirroring
   * Angular's `getInventoryEntriesInDay` literally (inventory-offline.service.ts:252-258),
   * including its date-descending sort. React's prior date-honoring behavior is removed.
   *
   * WU3 (category B): returns SYNC BaseResponseModel<InventoryEntryView[]> (was a bare
   * array), matching Angular's getInventoryEntriesInDay (`this.Success(...)`, sync,
   * never async).
   */
  getInventoryEntriesInDay(_date: Date): BaseResponseModel<InventoryEntryView[]> {
    const dayStart = startOfDay(new Date());
    const dayEnd = addDays(dayStart, 1);
    const entries = this.getActiveInventoryEntriesStorage()
      .filter((v) => v.date >= dayStart && v.date < dayEnd)
      .sort((a, b) => b.date.getTime() - a.date.getTime());
    return success(entries);
  }

  /**
   * Returns available stock grouped by category → product. Fase 4
   * (inventory-offline-service-parity, GATE-B — Angular-exact rename+zero-arg+category-repo
   * sourcing): renamed from `getAvailableByCategory`, the `products` param is REMOVED entirely.
   * Groups ACTIVE entries by `entry.categoryId` (stamped at creation time, GATE-A) — not a
   * caller-supplied product map. Category NAME is sourced via `ProductCategoryRepository`
   * (`productRepository.getCategoryRepository()`), mirroring Angular's
   * `categoryRepository.getStorageCategoriesMap()` (inventory-offline.service.ts:288) —
   * UNGUARDED (gate #1052: a categoryId with no matching category throws, exactly like Angular's
   * own unguarded `storageCategory.name` read; no defensive `''` fallback is added).
   *
   * WU3 (category B): returns SYNC BaseResponseModel<InventoryCategoryView[]> (was a bare
   * array), matching Angular's getInventoryCategoriesView (`this.Success(...)`, sync,
   * never async).
   */
  getInventoryCategoriesView(): BaseResponseModel<InventoryCategoryView[]> {
    const productMap = this.productRepository.getStorageProductsMap();
    const categoriesMap = this.productRepository.getCategoryRepository().getStorageCategoriesMap();
    const activeEntries = this.getStorageActiveInventoryEntries();

    // Group by entry.categoryId (Angular 291), then by entry.productId within each category
    // group (Angular 294) — mirrors Angular's structure literally.
    const categoryGroups = new Map<string, InventoryEntry[]>();
    for (const entry of activeEntries) {
      const group = categoryGroups.get(entry.categoryId);
      if (group) group.push(entry);
      else categoryGroups.set(entry.categoryId, [entry]);
    }

    const inventoryCategories: InventoryCategoryView[] = [];
    categoryGroups.forEach((categoryEntries, categoryId) => {
      const productGroups = new Map<string, InventoryEntry[]>();
      for (const entry of categoryEntries) {
        const group = productGroups.get(entry.productId);
        if (group) group.push(entry);
        else productGroups.set(entry.productId, [entry]);
      }

      const products: InventoryProductStock[] = [];
      let categoryName: string | undefined;
      productGroups.forEach((productEntries, productId) => {
        // Pre-existing divergences (out of GATE-B scope, previously ratified): skip when the
        // product no longer exists, and skip fully-depleted products (avoids Angular's own NaN
        // bug for Σavailable === 0 — diff-matrix #4).
        const product = productMap.get(productId);
        if (!product) return;
        const totalAvailable = productEntries.reduce((sum, e) => sum + e.available, 0);
        if (totalAvailable === 0) return;

        if (categoryName === undefined) {
          // Angular parity (getInventoryCategoriesView:308) + gate #1052: UNGUARDED — throws
          // here when categoryId has no matching category, mirroring Angular's own unguarded
          // `storageCategoriesMap.get(item.categoryId).name` read literally.
          categoryName = categoriesMap.get(categoryId)!.name;
        }

        const weightedCostSum = productEntries.reduce((sum, e) => sum + e.available * e.costPrice, 0);
        products.push({
          productId,
          productName: product.name,
          categoryId,
          categoryName,
          totalAvailable,
          avgCostPrice: weightedCostSum / totalAvailable,
        });
      });

      if (products.length === 0) return;

      inventoryCategories.push({
        categoryId,
        categoryName: categoryName!,
        totalQuantity: products.reduce((sum, p) => sum + p.totalAvailable, 0),
        totalCostPrice: products.reduce((sum, p) => sum + p.avgCostPrice * p.totalAvailable, 0),
        products,
      });
    });

    return success(inventoryCategories);
  }

  /**
   * 1:1 port of Angular's `getInventoryCostTotalBefore` — sum of `available * costPrice`
   * across ALL active entries with `date < threshold` (no lower bound).
   */
  getInventoryCostTotalBefore(date: Date): number {
    let total = 0;
    for (const [, entries] of this.getStorageInventoriesMap()) {
      for (const entry of entries) {
        if (entry.isActive && entry.date < date) total += entry.available * entry.costPrice;
      }
    }
    return total;
  }

  getInventoryCostTotal(): number {
    const start = startOfDay(new Date());
    const end = addDays(start, 1);
    return this.getInventoryCostTotalBefore(end);
  }

  getInventoryCostTotalYesterday(): number {
    const start = startOfDay(new Date());
    return this.getInventoryCostTotalBefore(start);
  }

  /**
   * Fase 4 (inventory-offline-service-parity, T11): private RAW-entry helper — 1:1 port of
   * Angular's `getStorageInventoryEntries`/`getStorageActiveInventoryEntries`
   * (inventory-offline.service.ts:46-52): flattens the per-product map into a single
   * `InventoryEntry[]` list, then filters to `isActive` entries. Used internally by
   * `getInventoryCategoriesView` in place of ad-hoc active-entry filtering — mirrors Angular's
   * structure. Returns RAW entries (not the enriched `InventoryEntryView[]` that
   * `getActiveInventoryEntriesStorage()` returns).
   */
  private getStorageInventoryEntries(): InventoryEntry[] {
    return Array.from(this.getStorageInventoriesMap().values()).flat();
  }

  private getStorageActiveInventoryEntries(): InventoryEntry[] {
    return this.getStorageInventoryEntries().filter((e) => e.isActive);
  }

  /**
   * WU4 (category C): converts to `Promise<BaseResponseModel<InventoryEntryView[]>>`
   * (was a bare sync array) — matches Angular's `Observable<BaseResponseModel<T>>`
   * (`this.Success$(...)`, same-tick `Promise.resolve`, no real I/O per design ADR-7).
   * All params optional and unbounded when falsy — 1:1 port, operates over active entries
   * only (Angular's `getActiveInventoryEntriesStorage`), RAW date comparisons.
   */
  filterInventoryEntries(
    productId?: string,
    start?: Date,
    end?: Date,
  ): Promise<BaseResponseModel<InventoryEntryView[]>> {
    const entries = this.getActiveInventoryEntriesStorage().filter(
      (v) =>
        (!productId || productId === v.productId) &&
        (!start || v.date >= start) &&
        (!end || v.date < end),
    );
    return Promise.resolve(success(entries));
  }

  /**
   * 1:1 port of Angular's `getInventoryEntriesView` — per-product FIFO breakdown of
   * ACTIVE entries with `available > 0`, sorted by `order` ascending. Emits `id` (not
   * Angular's `inventoryId`) via domain's InventoryEntryCost. Zero-arg per spec
   * (offline-online-service-parity, spec-slice1); `productName` defaults to `''`
   * (matches `getActiveInventoryEntriesStorage()`'s convention — this service has no ProductRepository
   * dependency; containers that need names enrich separately).
   *
   * WU4 (category C): converts to `Promise<BaseResponseModel<InventoryEntriesView[]>>`
   * (was a bare sync array) — matches Angular's `Success$(...)`, same-tick
   * `Promise.resolve`, no real I/O.
   */
  getInventoryEntriesView(): Promise<BaseResponseModel<InventoryEntriesView[]>> {
    const result: InventoryEntriesView[] = [];
    for (const [productId, entries] of this.getStorageInventoriesMap()) {
      const availableEntries: InventoryEntryCost[] = entries
        .filter((e) => e.available > 0 && e.isActive)
        .sort((a, b) => a.order - b.order)
        .map((e) => ({ id: e.id, costPrice: e.costPrice, quantity: e.available }));

      let productAvailable = 0;
      for (const e of availableEntries) productAvailable += e.quantity;

      result.push({
        productId,
        productName: '',
        productAvailable,
        availableEntries,
      });
    }
    return Promise.resolve(success(result));
  }

  /**
   * WU4 (category C): 1:1 port of Angular's `getInventoryEntriesInDayObservable`
   * (inventory-offline.service.ts:213 — `of(this.getInventoryEntriesInDay(date))`), the
   * Observable sibling of the sync `getInventoryEntriesInDay`. Named character-for-character
   * after Angular (exact-surface rule); same-tick `Promise.resolve` mirrors `of(...)` over
   * synchronous storage (design ADR-7). No existing call-site migration.
   */
  getInventoryEntriesInDayObservable(date: Date): Promise<BaseResponseModel<InventoryEntryView[]>> {
    return Promise.resolve(this.getInventoryEntriesInDay(date));
  }

  /**
   * WU4 (category C) + Fase 4 (GATE-B ripple): 1:1 port of Angular's
   * `getInventoryCategoriesViewObservable` (inventory-offline.service.ts:260 —
   * `of(this.getInventoryCategoriesView())`), the Observable sibling of the sync
   * `getInventoryCategoriesView`. Now ZERO-ARG — the `products` param was only a DI-gap mirror
   * of the old sync method's shape; GATE-B removed it from the underlying method, so it is
   * dropped here too. Named character-for-character after Angular (exact-surface rule);
   * same-tick `Promise.resolve` mirrors `of(...)`. No existing call-site migration.
   */
  getInventoryCategoriesViewObservable(): Promise<BaseResponseModel<InventoryCategoryView[]>> {
    return Promise.resolve(this.getInventoryCategoriesView());
  }

  // ─── FIFO deduction ──────────────────────────────────────────────────────

  /**
   * Atomically reads AND decrements available quantities using FIFO order.
   * Persists the updated map to localStorage before returning.
   * Returns an array of InventoryEntryCost records for the deducted amounts.
   *
   * Spec §6.3 getAvailableInventoryCosts contract; S-I2.
   */
  getAvailableInventoryCosts(
    productId: string,
    quantity: number,
    eligibility?: InventoryCostEligibility,
  ): InventoryEntryCost[] {
    if (quantity <= 0) return [];

    if (eligibility) {
      const gate = hasAvailableProductToSale({
        product: eligibility.product,
        quantity,
        cartQuantity: 0,
        hasInventoryModule: eligibility.hasInventoryModule,
        inventory: this.getAvailableQuantity(productId),
      });
      if (!gate.succeeded) return [];
    }

    const map = this.getStorageInventoriesMap();
    const entries = (map.get(productId) ?? [])
      .filter((e) => e.isActive && e.available > 0)
      .sort((a, b) => a.order - b.order);

    const costs: InventoryEntryCost[] = [];
    let remaining = quantity;

    for (const entry of entries) {
      if (remaining <= 0) break;
      const taken = Math.min(remaining, entry.available);
      entry.available -= taken;
      remaining -= taken;
      costs.push({ id: entry.id, costPrice: entry.costPrice, quantity: taken });
    }

    // Persist the mutated map (entries are mutated in-place above)
    this.setInventoriesLocalStorage(map);

    return costs;
  }

  /**
   * BUG FIX (angular-bugs-policy, ADR-7): Angular's `updateAvailableInventories` decrements
   * `available` in FIFO order but computes the "amount consumed so far" AFTER zeroing —
   * `total -= i.available` runs once `i.available` has already been set to 0, so the
   * decrement is always 0 for any entry that gets fully drained, silently over-consuming
   * later entries in the chain. Example (entries available=[5,10], quantity=8): Angular
   * zeroes entry1 (available=5→0) then computes `total -= 0` (bug — should be `-= 5`),
   * leaving `total` at 8 instead of 3, so entry2 is drained by 8 instead of 3
   * (available=10→2 instead of the correct 10→7). React uses the same correct
   * `Math.min(total, i.available)` pattern already proven in `getAvailableInventoryCosts`:
   * consumed = min(remaining, i.available); i.available -= consumed; remaining -= consumed.
   * No cost-consumption record is produced (unlike getAvailableInventoryCosts) — matches
   * Angular's own contract (boolean success/failure only).
   */
  updateAvailableInventories(productId: string, quantity: number): boolean {
    const map = this.getStorageInventoriesMap();
    const entries = (map.get(productId) ?? [])
      .filter((e) => e.isActive && e.available > 0)
      .sort((a, b) => a.order - b.order);

    if (entries.length === 0) return false;

    let remaining = quantity;
    for (const entry of entries) {
      if (remaining <= 0) break;
      const consumed = Math.min(remaining, entry.available);
      entry.available -= consumed;
      remaining -= consumed;
    }

    this.setInventoriesLocalStorage(map);
    return true;
  }

  /**
   * Restores available quantities for each inventory entry referenced in orderItems.
   * Matches by cost.id (React canonical) with fallback to cost.inventoryId (Angular data).
   * Persists after all increments.
   *
   * Spec §6.3 increaseQuantitiesByOrderItems contract; S-I3.
   */
  /**
   * WU2 (category D): returns Result (was void) — always Result.Success() per Angular
   * (no failure branch exists in Angular's own version either).
   */
  increaseQuantitiesByOrderItems(orderItems: OrderItem[]): Result {
    const map = this.getStorageInventoriesMap();
    let dirty = false;

    for (const orderItem of orderItems) {
      for (const cost of orderItem.productCosts) {
        // Design Decision 2: normalize cost.id ?? cost.inventoryId for Angular-origin data
        const entryId =
          cost.id ??
          (cost as unknown as { inventoryId?: string }).inventoryId;
        if (!entryId) continue;

        // Find the entry by id across all products
        for (const [, entries] of map) {
          const entry = entries.find((e) => e.id === entryId);
          if (entry) {
            entry.available += cost.quantity;
            dirty = true;
            break;
          }
        }
      }
    }

    if (dirty) {
      this.setInventoriesLocalStorage(map);
    }

    return Result.Success();
  }

  // ─── Write methods ───────────────────────────────────────────────────────

  /**
   * Creates a new inventory entry.
   * available = quantity; order = maxOrder + 1 (or 0 if no prior entries).
   *
   * WU2 (category D): returns DataResult<InventoryEntryView> (was plain InventoryEntry),
   * matching Angular's createInventoryEntry sync DataResult return — never throws.
   * productName is '' since the view here is not enriched with the product name (matches
   * getActiveInventoryEntriesStorage's convention).
   *
   * Product-existence guard (Angular parity, createInventoryEntry:60-64): when the product
   * does not exist, Angular returns bare `null` (NOT a DataResult) before creating anything —
   * mirrored exactly here (ratified: preserve Angular's exact `null` shape).
   *
   * Fase 4 (inventory-offline-service-parity, GATE-A — Angular-exact signature): renamed from
   * `create`, drops the `categoryId`/`date` params entirely (3-arity, Angular parity). Both are
   * derived INTERNALLY:
   * - `categoryId` from `productRepository.getStorageProductsMap().get(productId).categoryId`
   *   (Angular createInventoryEntry:76) — never caller-supplied.
   * - `date`/`createdDate` are BOTH stamped from a SINGLE internal `new Date()` call made at
   *   invocation time (Angular createInventoryEntry:70,80,83) — no caller-supplied backdating.
   *
   * Spec §6.3 create contract; S-I1.
   */
  createInventoryEntry(
    productId: string,
    quantity: number,
    costPrice: number,
  ): DataResult<InventoryEntryView> | null {
    const product = this.productRepository.getProductById(productId);
    if (!product) return null;

    const existing = this.getStorageInventoriesMap().get(productId) ?? [];
    const maxOrder = existing.length > 0
      ? Math.max(...existing.map((e) => e.order))
      : -1;
    const date = new Date();
    const categoryId = this.productRepository.getStorageProductsMap().get(productId)!.categoryId;

    const entry: InventoryEntry = {
      id: generateId(),
      productId,
      categoryId,
      quantity,
      available: quantity,
      costPrice,
      date,
      order: maxOrder + 1,
      isActive: true,
      createdDate: date,
      createdByName: getCurrentUserLogin(),
      updatedDate: undefined,
      updatedByName: undefined,
    };

    const map = this.getStorageInventoriesMap();
    map.set(productId, [...existing, entry]);
    this.setInventoriesLocalStorage(map);

    return new DataResult<InventoryEntryView>(
      {
        id: entry.id,
        productId: entry.productId,
        productName: product.name,
        quantity: entry.quantity,
        costPrice: entry.costPrice,
        date: entry.date,
        isActive: entry.isActive,
      },
      true,
      [],
    );
  }

  /**
   * Updates an existing inventory entry (same-product edit).
   * Guarded by {@link isNotSoldEntry} (entry-not-found / partially-sold).
   *
   * WU2 (category D): returns DataResult<InventoryEntryView> (was plain InventoryEntry,
   * throwing) — NEVER throws, matching Angular's own updateInventoryEntry contract.
   *
   * Spec §6.3 update contract; S-I4.
   */
  update(
    entryId: string,
    productId: string,
    quantity: number,
    costPrice: number,
  ): DataResult<InventoryEntryView> {
    const guard = this.isNotSoldEntry(productId, entryId);
    if (!guard.succeeded) {
      return new DataResult<InventoryEntryView>(undefined, false, guard.errors);
    }

    // Product-scoped lookup (rule 12): Angular never scans across products for an entry —
    // every caller already knows `productId`, so the entry is looked up within that exact
    // bucket (isNotSoldEntry above already guarantees it exists there).
    const allForProduct = this.getProductInventoriesByProductId(productId);
    const entry = allForProduct.find((e) => e.id === entryId)!;

    const updated: InventoryEntry = {
      ...entry,
      quantity,
      available: quantity,
      costPrice,
      updatedDate: new Date(),
      updatedByName: getCurrentUserLogin(),
    };

    const idx = allForProduct.findIndex((e) => e.id === entryId);
    if (idx !== -1) allForProduct[idx] = updated;
    const map = this.getStorageInventoriesMap();
    map.set(productId, allForProduct);
    this.setInventoriesLocalStorage(map);

    // Angular parity (updateInventoryEntry:130,134): productName from the entry's product
    const product = this.productRepository.getProductById(productId);
    return new DataResult<InventoryEntryView>(
      {
        id: updated.id,
        productId: updated.productId,
        productName: product!.name,
        quantity: updated.quantity,
        costPrice: updated.costPrice,
        date: updated.date,
        isActive: updated.isActive,
      },
      true,
      [],
    );
  }

  /**
   * Soft-deletes an inventory entry (sets isActive = false).
   * Guarded by {@link isNotSoldEntry} (entry-not-found / partially-sold).
   *
   * WU2 (category D): returns Result (was void, throwing) — NEVER throws.
   *
   * Fase 4 (inventory-offline-service-parity): renamed from `deactivate(entryId, productId)` to
   * `deleteInventoryEntry(productId, entryId)` — Angular-exact name + param order restored
   * (Angular parity, inventory-offline.service.ts:179).
   *
   * Spec §6.3 deactivate contract; S-I5.
   */
  deleteInventoryEntry(productId: string, entryId: string): Result {
    const guard = this.isNotSoldEntry(productId, entryId);
    if (!guard.succeeded) return Result.Failure(guard.errors);

    // Product-scoped lookup (rule 12): mirrors update() — no cross-product scan.
    const allForProduct = this.getProductInventoriesByProductId(productId);
    const entry = allForProduct.find((e) => e.id === entryId)!;

    const deactivated: InventoryEntry = {
      ...entry,
      isActive: false,
      updatedDate: new Date(),
      updatedByName: getCurrentUserLogin(),
    };

    const idx = allForProduct.findIndex((e) => e.id === entryId);
    if (idx !== -1) allForProduct[idx] = deactivated;
    const map = this.getStorageInventoriesMap();
    map.set(productId, allForProduct);
    this.setInventoriesLocalStorage(map);

    return Result.Success();
  }

  /**
   * 1:1 port of Angular's `amortizeSoldEntry` — zeroes `available` and moves the
   * consumed amount into a permanently-reduced `quantity` (so the entry no longer
   * shows as "still has stock" once every unit has been sold and the sale is being
   * amortized/written off).
   *
   * WU2 (category D): returns Result (was void, throwing) — NEVER throws.
   * Result.Failure([InventoryErrors.EntryNotExists]) when the entry is missing,
   * Result.Failure([InventoryErrors.SaleNotExistsWithThisEntry]) when nothing has actually
   * been sold yet (`quantity === available`).
   */
  amortizeSoldEntry(productId: string, entryId: string): Result {
    const entries = this.getProductInventoriesByProductId(productId);
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) {
      return Result.Failure([InventoryErrors.EntryNotExists]);
    }
    if (entry.quantity === entry.available) {
      return Result.Failure([InventoryErrors.SaleNotExistsWithThisEntry]);
    }

    entry.quantity -= entry.available;
    entry.available = 0;
    const map = this.getStorageInventoriesMap();
    map.set(productId, entries);
    this.setInventoriesLocalStorage(map);

    return Result.Success();
  }

  /**
   * 1:1 port of Angular's `isNotSoldEntry` (inventory-offline.service.ts:162-177) — shared
   * guard used by update/updateInventoryEntry/deactivate. Angular first checks
   * `!productRepository.getProductById(productId)` -> `Result.Failure([ProductErrors.NotExists])`;
   * now that `ProductRepository` is injected here (mirroring Angular's constructor DI), that
   * product-existence branch is restored 1:1. Then entry-existence and sold-status are
   * checked, scoped to entries under `productId` (matches Angular's
   * `getProductInventoriesByProductId(productId)` lookup).
   */
  public isNotSoldEntry(productId: string, entryId: string): Result {
    if (!this.productRepository.getProductById(productId)) {
      return Result.Failure([ProductErrors.NotExists]);
    }

    const entries = this.getProductInventoriesByProductId(productId);
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return Result.Failure([InventoryErrors.EntryNotExists]);

    return entry.quantity === entry.available
      ? Result.Success()
      : Result.Failure([InventoryErrors.SaleExistsWithThisEntry]);
  }

  /**
   * BUG FIX (angular-bugs-policy, ADR-7): Angular's cross-product `updateInventoryEntry`
   * fetches BOTH the "new product" bucket AND the "old product" bucket via
   * `getProductInventoriesByProductId(newProductId)` — the second call is a copy-paste
   * bug that should read `oldProductId`. In practice this means: (1) the entry is looked
   * up in the WRONG (new-product) bucket, typically finding nothing when the entry
   * actually lives under `oldProductId`, so Angular's own code goes on to call
   * `entry.quantity = ...` on `undefined` and throws a TypeError; and (2) even before
   * that crash, `this.inventories.set(oldProductId, oldInventories)` overwrites the OLD
   * product's bucket with a (filtered) copy of the NEW product's bucket — silently
   * destroying oldProductId's inventory list. React's corrected version reads
   * `oldProductId`'s bucket for removal and `newProductId`'s bucket for insertion, so a
   * cross-product move relocates exactly the one entry and leaves every other entry (in
   * both buckets) untouched. Kept as a DISTINCT method (not folded into the existing
   * single-product `update`) per design — `update` still only handles same-product edits.
   *
   * WU2 (category D): returns DataResult<InventoryEntryView> (was plain InventoryEntry,
   * throwing) — guarded by {@link isNotSoldEntry} (entry-not-found / partially-sold),
   * NEVER throws.
   */
  updateInventoryEntry(
    oldProductId: string,
    entryId: string,
    newProductId: string,
    quantity: number,
    costPrice: number,
  ): DataResult<InventoryEntryView> {
    const guard = this.isNotSoldEntry(oldProductId, entryId);
    if (!guard.succeeded) {
      return new DataResult<InventoryEntryView>(undefined, false, guard.errors);
    }

    // Target-product availability guard (Angular parity, updateInventoryEntry:107-108):
    // the product being moved TO must exist AND be active.
    if (!this.productRepository.getAvailableProductById(newProductId)) {
      return new DataResult<InventoryEntryView>(undefined, false, [InventoryErrors.ProductNotAvailable]);
    }

    const oldEntries = this.getProductInventoriesByProductId(oldProductId);
    const entry = oldEntries.find((e) => e.id === entryId)!;

    const updated: InventoryEntry = {
      ...entry,
      quantity,
      available: quantity,
      costPrice,
      productId: newProductId,
      updatedDate: new Date(),
      updatedByName: getCurrentUserLogin(),
    };

    const map = this.getStorageInventoriesMap();
    if (oldProductId === newProductId) {
      const idx = oldEntries.findIndex((e) => e.id === entryId);
      if (idx !== -1) oldEntries[idx] = updated;
      map.set(oldProductId, oldEntries);
      this.setInventoriesLocalStorage(map);
    } else {
      // Cross-product move: remove from oldProductId's bucket, append to newProductId's.
      const remainingOldEntries = oldEntries.filter((e) => e.id !== entryId);
      map.set(oldProductId, remainingOldEntries);

      const newEntries = map.get(newProductId) ?? [];
      map.set(newProductId, [...newEntries, updated]);
      this.setInventoriesLocalStorage(map);
    }

    // Angular parity (updateInventoryEntry:130,134): productName from getProductById(oldProductId)
    const product = this.productRepository.getProductById(oldProductId);
    return new DataResult<InventoryEntryView>(
      {
        id: updated.id,
        productId: updated.productId,
        productName: product!.name,
        quantity: updated.quantity,
        costPrice: updated.costPrice,
        date: updated.date,
        isActive: updated.isActive,
      },
      true,
      [],
    );
  }

  // ─── Query helpers ───────────────────────────────────────────────────────

  /**
   * Returns the RAW inventory entries for a product — no isActive filter, no mutation.
   * 1:1 port of Angular's `getProductInventoriesByProductId`
   * (inventory-offline.service.ts:54-56).
   *
   * Stage 7 (Reports ledger, ADR-2): the only supported way to compute a
   * quantity-weighted average cost across a product's active (available > 0) entries.
   * Do NOT reuse `getInventoryCategoriesView` (weights by `available`, diverges for
   * partially-sold entries) or `getAvailableInventoryCosts` (mutates/deducts stock via FIFO).
   */
  getProductInventoriesByProductId(productId: string): InventoryEntry[] {
    return this.getStorageInventoriesMap().get(productId) ?? [];
  }

  /**
   * WU2 (category D, NEW method): 1:1 port of Angular's `addImportedEntries`
   * (inventory-offline.service.ts:519-524) — replaces the productId bucket wholesale.
   * Always Result.Success() per Angular.
   */
  public addImportedEntries(productId: string, entries: InventoryEntry[]): Result {
    const map = this.getStorageInventoriesMap();
    map.set(productId, entries);
    this.setInventoriesLocalStorage(map);
    return Result.Success();
  }

  /**
   * WU2 (category D, NEW method): 1:1 port of Angular's `updateImportedEntries`
   * (inventory-offline.service.ts:498-517) — merges each incoming entry into the existing
   * productId bucket by id (updating available/isActive/updatedDate/updatedByName),
   * appending any incoming entry with no existing match. When no bucket previously existed,
   * this is equivalent to setting it directly (Angular's `this.inventories.has(productId)`
   * branch — both paths converge to the same result when the existing bucket is empty).
   * Always Result.Success() per Angular.
   */
  public updateImportedEntries(productId: string, entries: InventoryEntry[]): Result {
    const currentEntries = [...this.getProductInventoriesByProductId(productId)];
    for (const entry of entries) {
      const idx = currentEntries.findIndex((e) => e.id === entry.id);
      if (idx !== -1) {
        currentEntries[idx] = {
          ...currentEntries[idx],
          available: entry.available,
          isActive: entry.isActive,
          updatedDate: entry.updatedDate,
          updatedByName: entry.updatedByName,
        };
      } else {
        currentEntries.push(entry);
      }
    }
    const map = this.getStorageInventoriesMap();
    map.set(productId, currentEntries);
    this.setInventoriesLocalStorage(map);
    return Result.Success();
  }

  /**
   * Distinguishes "no inventory entries at all" from "entries exist but not enough active
   * quantity" — mirrors Angular's InventoryOfflineService.hasAvailableProductToSale branches
   * 5 (ProductErrors.ProductNotAvailable) and 6 (ProductErrors.ProductQuantityNotAvailable).
   * Angular (inventory-offline.service.ts:410-419) checks `inventories.length === 0` against
   * the RAW entry list BEFORE filtering isActive, and only filters isActive when summing the
   * quantity — so `hasEntries` must reflect the raw list, not the active-only subset. A
   * product whose only entries are all inactive still has `hasEntries: true` (falls through
   * to the quantity check, which fails with 0 available) rather than the "no entries" branch.
   */
  getAvailableQuantity(productId: string): { hasEntries: boolean; available: number } {
    const allEntries = this.getProductInventoriesByProductId(productId);
    const available = allEntries
      .filter((e) => e.isActive)
      .reduce((sum, e) => sum + e.available, 0);
    return { hasEntries: allEntries.length > 0, available };
  }

  // ─── Inline persistence (rule 12 — no InventoryRepository correlate in Angular) ──────────

  /**
   * 1:1 port of Angular's `setInventoriesLocalStorage` (inventory-offline.service.ts:526-529).
   */
  private setInventoriesLocalStorage(inventories: Map<string, InventoryEntry[]>): void {
    localStorage.setItem(this.getStorageKey(), JSON.stringify(Array.from(inventories.entries())));
  }

  /**
   * Private port of Angular `getStorageKey` (inventory-offline.service.ts:485-488) — records
   * the last-used key (side-effecting), unlike {@link getCurrentStorageKey} (pure).
   */
  private getStorageKey(): string {
    this.lastInventoriesKey = this.getCurrentStorageKey();
    return this.lastInventoriesKey;
  }

  /** Private port of Angular `getCurrentStorageKey` (inventory-offline.service.ts:490-492). */
  private getCurrentStorageKey(): string {
    return StorageKeys.entityKey('inventory-entries', this.storeId);
  }

  /**
   * 1:1 port of Angular's `getInventoryEntriesJson` (inventory-offline.service.ts:494-496).
   * Raw passthrough of the stored value — no parse, no Map rebuild, no re-serialize
   * round-trip. Used by the sync export path (DataSerializerService) so corrupt/malformed
   * stored data is exported AS-IS instead of being silently swallowed to an empty result
   * (that was the deleted InventoryRepository.getAll's behavior — a rule-10/12 defect).
   * Unlike getProductsJson/getCategoriesJson (raw `string | null`, no fallback), this one has
   * a genuine Angular quirk: `|| "{}"` returns the literal string `"{}"` (NOT `"[]"`) when the
   * key is missing — ported literally, not "fixed".
   */
  getInventoryEntriesJson(): string {
    return localStorage.getItem(this.getStorageKey()) || '{}';
  }

  /**
   * Private port of Angular `getInventoriesFromLocalStorage`
   * (inventory-offline.service.ts:535-554) — on empty/missing/`'{}'`/unparsable storage,
   * auto-initializes by writing an empty Map before returning it. Revives ONLY `date` to a
   * `Date` instance (Angular parity, lines 540-544) — `createdDate`/`updatedDate` are left as
   * the raw stored (string) values, unlike the deleted `InventoryRepository`, which revived
   * all three.
   */
  private getInventoriesFromLocalStorage(): Map<string, InventoryEntry[]> {
    try {
      const inventoriesJson = localStorage.getItem(this.getStorageKey());
      if (inventoriesJson && inventoriesJson !== '{}') {
        const inventoryMap: Map<string, InventoryEntry[]> = new Map(JSON.parse(inventoriesJson));
        inventoryMap.forEach((entries) => {
          entries.forEach((entry) => {
            (entry as unknown as { date: Date }).date = new Date(entry.date);
          });
        });
        return inventoryMap;
      }
    } catch {
      // ignore — fall through to auto-init
    }
    const inventories = new Map<string, InventoryEntry[]>();
    this.setInventoriesLocalStorage(inventories);
    return inventories;
  }
}
