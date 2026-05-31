import type { InventoryEntry } from '@store-mgmt/domain';
import type { ParsedData } from './data-serializer-service';
import type { CategoryReader } from './data-serializer-service';

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
    throw new Error('Not implemented');
  }
}
