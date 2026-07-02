import type { InventoryEntry, InventoryEntryCost, InventoryEntryView, OrderItem } from '@store-mgmt/domain';
import { InventoryRepository } from '../repositories/inventory-repository';
import { startOfDay, addDays } from '~/shared/lib/date-utils';
import {
  checkProductAvailabilityToSale,
  type ProductAvailabilityFields,
} from '~/sales/lib/product-availability';

/**
 * Optional eligibility context for {@link InventoryOfflineService.getAvailableInventoryCosts}.
 * When supplied, gates the product exactly like Angular's
 * `InventoryOfflineService.getAvailableInventories` -> `hasAvailableProductToSale` chain
 * (frontend/src/app/application/entries/inventory-offline.service.ts:397-442) BEFORE any FIFO
 * cost allocation happens or any entry is mutated: inactive / not-available-to-sale products
 * yield an empty cost list, and — when the inventory module is enabled AND the product
 * discounts from inventory — insufficient active stock also yields an empty list. When the
 * module is disabled or the product doesn't discount from inventory, Angular's own bypass
 * branch applies (matches `checkProductAvailabilityToSale` branch 4) and the FIFO computation
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
export class InventoryOfflineService {
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
      const gate = checkProductAvailabilityToSale({
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
   * Restores available quantities for each inventory entry referenced in orderItems.
   * Matches by cost.id (React canonical) with fallback to cost.inventoryId (Angular data).
   * Persists after all increments.
   *
   * Spec §6.3 increaseQuantitiesByOrderItems contract; S-I3.
   */
  increaseQuantitiesByOrderItems(orderItems: OrderItem[]): void {
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
  }

  // ─── Write methods ───────────────────────────────────────────────────────

  /**
   * Creates a new inventory entry.
   * available = quantity; order = maxOrder + 1 (or 0 if no prior entries).
   *
   * Spec §6.3 create contract; S-I1.
   */
  create(
    productId: string,
    quantity: number,
    costPrice: number,
    categoryId: string = '',
    date: Date = new Date(),
  ): InventoryEntry {
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
      createdByName: '',
      updatedDate: now,
      updatedByName: '',
    };

    this.repo.save(this.storeId, productId, [...existing, entry]);
    return entry;
  }

  /**
   * Updates an existing inventory entry.
   * Validates that entry has not been partially sold (quantity === available).
   * Throws InventoryErrors.SaleExistsWithThisEntry if quantity !== available.
   *
   * Spec §6.3 update contract; S-I4.
   */
  update(
    entryId: string,
    productId: string,
    quantity: number,
    costPrice: number,
  ): InventoryEntry {
    const found = this.repo.findEntryById(this.storeId, entryId);
    if (!found) throw new Error(`InventoryEntry not found: ${entryId}`);

    const { entry, productId: storedProductId } = found;

    // S-I4: cannot edit if partially sold
    if (entry.quantity !== entry.available) {
      throw new Error(
        `InventoryErrors.SaleExistsWithThisEntry: entry ${entryId} has been partially sold (qty=${entry.quantity}, available=${entry.available})`,
      );
    }

    const updated: InventoryEntry = {
      ...entry,
      quantity,
      available: quantity,
      costPrice,
      updatedDate: new Date(),
    };

    const allForProduct = this.repo.getByProductId(this.storeId, storedProductId ?? productId);
    const idx = allForProduct.findIndex((e) => e.id === entryId);
    if (idx !== -1) allForProduct[idx] = updated;
    this.repo.save(this.storeId, storedProductId ?? productId, allForProduct);

    return updated;
  }

  /**
   * Soft-deletes an inventory entry (sets isActive = false).
   * Validates that entry has not been sold.
   *
   * Spec §6.3 deactivate contract; S-I5.
   */
  deactivate(entryId: string, productId: string): void {
    const found = this.repo.findEntryById(this.storeId, entryId);
    if (!found) throw new Error(`InventoryEntry not found: ${entryId}`);

    const { entry, productId: storedProductId } = found;

    // S-I5: cannot deactivate if sold
    if (entry.quantity !== entry.available) {
      throw new Error(
        `InventoryErrors.SaleExistsWithThisEntry: entry ${entryId} has been sold and cannot be deactivated`,
      );
    }

    const deactivated: InventoryEntry = {
      ...entry,
      isActive: false,
      updatedDate: new Date(),
    };

    const allForProduct = this.repo.getByProductId(this.storeId, storedProductId ?? productId);
    const idx = allForProduct.findIndex((e) => e.id === entryId);
    if (idx !== -1) allForProduct[idx] = deactivated;
    this.repo.save(this.storeId, storedProductId ?? productId, allForProduct);
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
