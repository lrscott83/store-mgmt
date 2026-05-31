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

export type MergeResult = EntityMergeResult[];

// ---------------------------------------------------------------------------
// Repository interfaces (injected for testability)
// ---------------------------------------------------------------------------

export interface CategoryWriter {
  getAll(): import('@store-mgmt/domain').ProductCategory[];
  save(category: import('@store-mgmt/domain').ProductCategory): import('@store-mgmt/domain').ProductCategory;
}

export interface GenericUpsertRepo<T extends { id: string }> {
  getAll(storeId: string): Map<string, T>;
  upsert(storeId: string, item: T): void;
}

export interface InventoryRepo {
  getAll(storeId: string): Map<string, InventoryEntry[]>;
  save(storeId: string, productId: string, entries: InventoryEntry[]): void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function upsertGeneric<T extends { id: string }>(
  storeId: string,
  repo: GenericUpsertRepo<T>,
  incoming: T[],
  entityName: string,
): EntityMergeResult {
  if (incoming.length === 0) {
    return { entity: entityName, inserted: 0, updated: 0 };
  }
  const existing = repo.getAll(storeId);
  let inserted = 0;
  let updated = 0;
  for (const item of incoming) {
    if (existing.has(item.id)) {
      updated++;
    } else {
      inserted++;
    }
    repo.upsert(storeId, item);
  }
  return { entity: entityName, inserted, updated };
}

// ---------------------------------------------------------------------------
// DataSynchronizerService
// ---------------------------------------------------------------------------

export class DataSynchronizerService {
  constructor(
    private readonly storeId: string,
    private readonly categoryWriter: CategoryWriter,
    private readonly productRepo: GenericUpsertRepo<import('@store-mgmt/domain').Product>,
    private readonly inventoryRepo: InventoryRepo,
    private readonly orderRepo: GenericUpsertRepo<import('@store-mgmt/domain').Order>,
    private readonly expenseRepo: GenericUpsertRepo<import('@store-mgmt/domain').Expense>,
    private readonly saleCreditRepo: GenericUpsertRepo<import('@store-mgmt/domain').SaleCredit>,
  ) {}

  /**
   * Upserts all 6 entities in referential-integrity order:
   * categories → products → inventoryEntries → orders → expenses → saleCredits.
   * Non-destructive: local records absent from file are preserved.
   * Returns per-entity inserted/updated counts.
   */
  async sync(data: ParsedData): Promise<MergeResult> {
    const result: MergeResult = [];

    // 1. Categories — via CategoryWriter.save() (bypasses name-uniqueness guard)
    const catResult = this._syncCategories(data.categories);
    result.push(catResult);

    // 2. Products
    result.push(upsertGeneric(this.storeId, this.productRepo, data.products, 'products'));

    // 3. InventoryEntries — group by productId, merge by entry id
    result.push(await this._syncInventory(data.inventoryEntries));

    // 4. Orders
    result.push(upsertGeneric(this.storeId, this.orderRepo, data.orders, 'orders'));

    // 5. Expenses
    result.push(upsertGeneric(this.storeId, this.expenseRepo, data.expenses, 'expenses'));

    // 6. SaleCredits
    result.push(upsertGeneric(this.storeId, this.saleCreditRepo, data.saleCredits, 'saleCredits'));

    return result;
  }

  private _syncCategories(
    incoming: import('@store-mgmt/domain').ProductCategory[],
  ): EntityMergeResult {
    if (incoming.length === 0) {
      return { entity: 'categories', inserted: 0, updated: 0 };
    }
    const existingArr = this.categoryWriter.getAll();
    const existingIds = new Set(existingArr.map((c) => c.id));
    let inserted = 0;
    let updated = 0;
    for (const cat of incoming) {
      if (existingIds.has(cat.id)) {
        updated++;
      } else {
        inserted++;
      }
      this.categoryWriter.save(cat);
    }
    return { entity: 'categories', inserted, updated };
  }

  private async _syncInventory(incoming: InventoryEntry[]): Promise<EntityMergeResult> {
    if (incoming.length === 0) {
      return { entity: 'inventoryEntries', inserted: 0, updated: 0 };
    }

    // Group incoming entries by productId
    const byProduct = new Map<string, InventoryEntry[]>();
    for (const entry of incoming) {
      const arr = byProduct.get(entry.productId) ?? [];
      arr.push(entry);
      byProduct.set(entry.productId, arr);
    }

    let inserted = 0;
    let updated = 0;

    // For each productId, merge by entry id with existing entries
    const existingMap = this.inventoryRepo.getAll(this.storeId);

    for (const [productId, newEntries] of byProduct) {
      const existingEntries = existingMap.get(productId) ?? [];
      const existingById = new Map(existingEntries.map((e) => [e.id, e]));

      const merged = [...existingEntries];

      for (const newEntry of newEntries) {
        if (existingById.has(newEntry.id)) {
          // Update in place
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

    return { entity: 'inventoryEntries', inserted, updated };
  }
}
