import type { BaseService, InventoryEntry, InventoryEntryCost, InventoryEntryView, OrderItem } from '@store-mgmt/domain';
import { DataResult, InventoryErrors, Result } from '@store-mgmt/domain';
import { InventoryRepository } from '../repositories/inventory-repository';
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
 * Backed by InventoryRepository (Map<productId, InventoryEntry[]>).
 * Replaces the Batch 2 stub.
 *
 * Spec §6.3; Scenarios S-I1 through S-I6.
 */
export class InventoryOfflineService implements BaseService<InventoryEntryView> {
  private readonly repo: InventoryRepository;

  constructor(private readonly storeId: string) {
    this.repo = new InventoryRepository(storeId);
  }

  // ─── Read methods ────────────────────────────────────────────────────────

  /**
   * Returns all active inventory entries as InventoryEntryView[].
   * productName is empty string since we don't have a product service here —
   * callers that need product names should enrich at the container level.
   */
  getAll(): InventoryEntryView[] {
    const map = this.repo.getAll(this.storeId);
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
   * BaseService<InventoryEntryView> conformance. Returns the matching entry as an
   * InventoryEntryView regardless of `isActive` (unfiltered by active status, matching
   * the other offline services' getById behavior — only getAll() filters to active-only).
   */
  getById(id: string): InventoryEntryView | undefined {
    const found = this.repo.findEntryById(this.storeId, id);
    if (!found) return undefined;
    const { entry, productId } = found;
    return {
      id: entry.id,
      productId,
      productName: '',
      quantity: entry.quantity,
      costPrice: entry.costPrice,
      date: entry.date,
      isActive: entry.isActive,
    };
  }

  /**
   * Returns active entries for a specific calendar day.
   */
  getByDate(date: Date): InventoryEntryView[] {
    const dayStart = startOfDay(date);
    const dayEnd = startOfDay(addDays(date, 1));
    return this.getAll().filter(
      (v) => v.date >= dayStart && v.date < dayEnd,
    );
  }

  /**
   * Returns available stock grouped by category → product.
   * Requires product records to be passed in so we can read categoryId/categoryName.
   * When called without products (default), returns an empty array —
   * containers should call the product service separately and use getAll().
   */
  getAvailableByCategory(
    products: Array<{ id: string; name: string; categoryId: string; categoryName: string }> = [],
  ): InventoryCategoryView[] {
    const map = this.repo.getAll(this.storeId);
    const productMap = new Map(products.map((p) => [p.id, p]));
    const categoryMap = new Map<string, InventoryCategoryView>();

    for (const [productId, entries] of map) {
      const product = productMap.get(productId);
      if (!product) continue;

      const activeEntries = entries.filter((e) => e.isActive);
      const totalAvailable = activeEntries.reduce((sum, e) => sum + e.available, 0);
      if (totalAvailable === 0) continue;

      // Weighted-average unit cost across active entries — Angular's getAverageCostPrice.
      // totalAvailable > 0 here (checked above), so this never divides by zero: Angular's own
      // division-by-zero (NaN) bug for fully-depleted products is intentionally NOT replicated
      // (diff-matrix #4 — fully-depleted products are excluded above instead).
      const weightedCostSum = activeEntries.reduce((sum, e) => sum + e.available * e.costPrice, 0);
      const avgCostPrice = weightedCostSum / totalAvailable;

      let cat = categoryMap.get(product.categoryId);
      if (!cat) {
        cat = {
          categoryId: product.categoryId,
          categoryName: product.categoryName,
          totalQuantity: 0,
          totalCostPrice: 0,
          products: [],
        };
        categoryMap.set(product.categoryId, cat);
      }

      cat.products.push({
        productId,
        productName: product.name,
        categoryId: product.categoryId,
        categoryName: product.categoryName,
        totalAvailable,
        avgCostPrice,
      });
    }

    // Category totals — Angular's getTotalQuantity/getTotalCostPrice, recomputed from the
    // per-product views (Σ totalAvailable; Σ avgCostPrice·totalAvailable).
    for (const cat of categoryMap.values()) {
      cat.totalQuantity = cat.products.reduce((sum, p) => sum + p.totalAvailable, 0);
      cat.totalCostPrice = cat.products.reduce((sum, p) => sum + p.avgCostPrice * p.totalAvailable, 0);
    }

    return Array.from(categoryMap.values());
  }

  /**
   * 1:1 port of Angular's `getInventoryCostTotalBefore` — sum of `available * costPrice`
   * across ALL active entries with `date < threshold` (no lower bound).
   */
  getInventoryCostTotalBefore(date: Date): number {
    let total = 0;
    for (const [, entries] of this.repo.getAll(this.storeId)) {
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
   * Sync replacement of Angular's `filterInventoryEntries` Observable. All params
   * optional and unbounded when falsy — 1:1 port, operates over active entries only
   * (Angular's `getActiveInventoryEntriesStorage`), RAW date comparisons.
   */
  filterInventoryEntries(productId?: string, start?: Date, end?: Date): InventoryEntryView[] {
    return this.getAll().filter(
      (v) =>
        (!productId || productId === v.productId) &&
        (!start || v.date >= start) &&
        (!end || v.date < end),
    );
  }

  /**
   * 1:1 port of Angular's `getInventoryEntriesView` — per-product FIFO breakdown of
   * ACTIVE entries with `available > 0`, sorted by `order` ascending. Emits `id` (not
   * Angular's `inventoryId`) via domain's InventoryEntryCost. Zero-arg per spec
   * (offline-online-service-parity, spec-slice1); `productName` defaults to `''`
   * (matches `getAll()`'s convention — this service has no ProductRepository
   * dependency; containers that need names enrich separately).
   */
  getInventoryEntriesView(): InventoryEntriesView[] {
    const result: InventoryEntriesView[] = [];
    for (const [productId, entries] of this.repo.getAll(this.storeId)) {
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
    return result;
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

    const map = this.repo.getAll(this.storeId);
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
    this.repo.saveAll(this.storeId, map);

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
    const map = this.repo.getAll(this.storeId);
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

    this.repo.saveAll(this.storeId, map);
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
    const map = this.repo.getAll(this.storeId);
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
      this.repo.saveAll(this.storeId, map);
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
   * productName is '' since this service has no product repository (matches getAll's
   * convention).
   *
   * Spec §6.3 create contract; S-I1.
   */
  create(
    productId: string,
    quantity: number,
    costPrice: number,
    categoryId: string = '',
    date: Date = new Date(),
  ): DataResult<InventoryEntryView> {
    const existing = this.repo.getByProductId(this.storeId, productId);
    const maxOrder = existing.length > 0
      ? Math.max(...existing.map((e) => e.order))
      : -1;
    const now = new Date();

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
      createdDate: now,
      createdByName: getCurrentUserLogin(),
      updatedDate: undefined,
      updatedByName: undefined,
    };

    this.repo.save(this.storeId, productId, [...existing, entry]);

    return new DataResult<InventoryEntryView>(
      {
        id: entry.id,
        productId: entry.productId,
        productName: '',
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

    const found = this.repo.findEntryById(this.storeId, entryId)!;
    const { entry, productId: storedProductId } = found;

    const updated: InventoryEntry = {
      ...entry,
      quantity,
      available: quantity,
      costPrice,
      updatedDate: new Date(),
      updatedByName: getCurrentUserLogin(),
    };

    const allForProduct = this.repo.getByProductId(this.storeId, storedProductId ?? productId);
    const idx = allForProduct.findIndex((e) => e.id === entryId);
    if (idx !== -1) allForProduct[idx] = updated;
    this.repo.save(this.storeId, storedProductId ?? productId, allForProduct);

    return new DataResult<InventoryEntryView>(
      {
        id: updated.id,
        productId: updated.productId,
        productName: '',
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
   * Spec §6.3 deactivate contract; S-I5.
   */
  deactivate(entryId: string, productId: string): Result {
    const guard = this.isNotSoldEntry(productId, entryId);
    if (!guard.succeeded) return Result.Failure(guard.errors);

    const found = this.repo.findEntryById(this.storeId, entryId)!;
    const { entry, productId: storedProductId } = found;

    const deactivated: InventoryEntry = {
      ...entry,
      isActive: false,
      updatedDate: new Date(),
      updatedByName: getCurrentUserLogin(),
    };

    const allForProduct = this.repo.getByProductId(this.storeId, storedProductId ?? productId);
    const idx = allForProduct.findIndex((e) => e.id === entryId);
    if (idx !== -1) allForProduct[idx] = deactivated;
    this.repo.save(this.storeId, storedProductId ?? productId, allForProduct);

    return Result.Success();
  }

  /**
   * BaseService<InventoryEntryView> conformance alias for {@link deactivate}. Looks up
   * the owning productId via `findEntryById` (deactivate normally requires the caller to
   * already know it) and delegates.
   *
   * WU2 (ADR-1): BaseService's `delete` seam stays a SYNC React-only contract that always
   * throws on failure (outside the A/B/C/D category conversion) — adapted here to consume
   * deactivate's new `Result` without leaking `Result` through the `BaseService<T>` surface.
   */
  delete(id: string): void {
    const found = this.repo.findEntryById(this.storeId, id);
    if (!found) throw new Error(`InventoryEntry not found: ${id}`);

    const result = this.deactivate(id, found.productId);
    if (!result.succeeded) {
      throw new Error(result.errors[0]?.description ?? `InventoryEntry could not be deleted: ${id}`);
    }
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
    const entries = this.repo.getByProductId(this.storeId, productId);
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) {
      return Result.Failure([InventoryErrors.EntryNotExists]);
    }
    if (entry.quantity === entry.available) {
      return Result.Failure([InventoryErrors.SaleNotExistsWithThisEntry]);
    }

    entry.quantity -= entry.available;
    entry.available = 0;
    this.repo.save(this.storeId, productId, entries);

    return Result.Success();
  }

  /**
   * 1:1 port of Angular's `isNotSoldEntry` (inventory-offline.service.ts:162-177) — shared
   * guard used by update/updateInventoryEntry/deactivate. DI-gap note (design ambiguity #2,
   * same precedent as getInventoryCategoriesView/getInventoryEntriesInDay): Angular's version
   * first checks `!productRepository.getProductById(productId)` ->
   * `Result.Failure([ProductErrors.NotExists])`; React's InventoryOfflineService has no
   * product repository, so that branch is NOT reachable here — only entry-existence and
   * sold-status are checked. Scoped to entries under `productId` (matches Angular's
   * `getProductInventoriesByProductId(productId)` lookup).
   */
  public isNotSoldEntry(productId: string, entryId: string): Result {
    const entries = this.repo.getByProductId(this.storeId, productId);
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

    const oldEntries = this.repo.getByProductId(this.storeId, oldProductId);
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

    if (oldProductId === newProductId) {
      const idx = oldEntries.findIndex((e) => e.id === entryId);
      if (idx !== -1) oldEntries[idx] = updated;
      this.repo.save(this.storeId, oldProductId, oldEntries);
    } else {
      // Cross-product move: remove from oldProductId's bucket, append to newProductId's.
      const remainingOldEntries = oldEntries.filter((e) => e.id !== entryId);
      this.repo.save(this.storeId, oldProductId, remainingOldEntries);

      const newEntries = this.repo.getByProductId(this.storeId, newProductId);
      this.repo.save(this.storeId, newProductId, [...newEntries, updated]);
    }

    return new DataResult<InventoryEntryView>(
      {
        id: updated.id,
        productId: updated.productId,
        productName: '',
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
   * Returns true if the sum of available quantities for a product >= requested quantity.
   */
  hasAvailableStock(productId: string, quantity: number): boolean {
    const entries = this.repo.getByProductId(this.storeId, productId);
    const total = entries
      .filter((e) => e.isActive)
      .reduce((sum, e) => sum + e.available, 0);
    return total >= quantity;
  }

  /**
   * Returns the RAW inventory entries for a product — no isActive filter, no mutation.
   * 1:1 port of Angular's `getProductInventoriesByProductId`
   * (inventory-offline.service.ts:54-56).
   *
   * Stage 7 (Reports ledger, ADR-2): the only supported way to compute a
   * quantity-weighted average cost across a product's active (available > 0) entries.
   * Do NOT reuse `getAvailableByCategory` (weights by `available`, diverges for
   * partially-sold entries) or `getAvailableInventoryCosts` (mutates/deducts stock via FIFO).
   */
  getProductInventoriesByProductId(productId: string): InventoryEntry[] {
    return this.repo.getByProductId(this.storeId, productId);
  }

  /**
   * WU2 (category D, NEW method): 1:1 port of Angular's `addImportedEntries`
   * (inventory-offline.service.ts:519-524) — replaces the productId bucket wholesale.
   * Always Result.Success() per Angular.
   */
  public addImportedEntries(productId: string, entries: InventoryEntry[]): Result {
    this.repo.save(this.storeId, productId, entries);
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
    const currentEntries = [...this.repo.getByProductId(this.storeId, productId)];
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
    this.repo.save(this.storeId, productId, currentEntries);
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
    const allEntries = this.repo.getByProductId(this.storeId, productId);
    const available = allEntries
      .filter((e) => e.isActive)
      .reduce((sum, e) => sum + e.available, 0);
    return { hasEntries: allEntries.length > 0, available };
  }
}
