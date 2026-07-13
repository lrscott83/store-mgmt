import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import type { Order } from '@store-mgmt/domain';
import type { GenericUpsertRepo } from '~/sync/lib/services/data-synchronizer-service';

/**
 * Sync-local storage shims — re-home the raw persistence the (now-deleted) generic
 * `BaseRepository<T>` used to provide for the import path ONLY (`sync/routes/import.tsx`, WU6).
 * `BaseRepository` had no Angular correlate (playbook rule 12) and is gone; these shims are NOT
 * a reintroduction of that shared base class — each factory below is a standalone closure,
 * co-located in the sync module, that reads/writes the SAME on-disk key/wire-format as its
 * matching offline service (`OrderOfflineService`/`SaleCreditOfflineService` — plain array,
 * id-869), so a merge performed here stays readable by those consumers afterward.
 *
 * SCOPE (product-sync-import-validation-parity, salecredit-sync-import-parity): Categories/
 * Products no longer go through a shim here — `import.tsx` constructs the real
 * `ProductCategoryRepository`/`ProductRepository` directly and `DataSynchronizerService`
 * consumes them through the `CategoryImportRepo`/`ProductImportRepo` seams, which carry full
 * Angular validation (category-exists, barcode-uniqueness, per-category name-uniqueness,
 * order-shift). SaleCredits also no longer go through a shim — they route through
 * `SaleCreditOfflineService` directly (paid-guard partial-merge cannot be expressed by a
 * generic full-overwrite shim). This file is now scoped to Orders ONLY — the one entity with
 * no Angular validation and no special merge guard (break-only semantics).
 * `DataSynchronizerService`'s `GenericUpsertRepo` orchestration is consumed UNCHANGED — this
 * file only supplies storage.
 */

function reviveDates<T>(item: T, dateFields: string[]): T {
  if (dateFields.length === 0) return item;
  const revived = { ...item } as Record<string, unknown>;
  for (const field of dateFields) {
    const value = revived[field];
    if (typeof value === 'string') revived[field] = new Date(value);
  }
  return revived as unknown as T;
}

function storageKey(entity: string, storeId: string): string {
  return StorageKeys.entityKey(entity, storeId);
}

/**
 * Orders/SaleCredits — PLAIN-ARRAY wire format on disk (SAME key as
 * `OrderOfflineService`/`SaleCreditOfflineService`, id-869), converted to/from a `Map`
 * internally so `DataSynchronizerService`'s Map-based merge loop (`mergeBreakOnly`) is
 * unaffected by the wire-format change.
 */
function makeGenericUpsertRepoShim<T extends { id: string }>(
  entity: string,
  dateFields: string[] = [],
): GenericUpsertRepo<T> {
  function getAll(storeId: string): Map<string, T> {
    const raw = localStorage.getItem(storageKey(entity, storeId));
    if (!raw) return new Map<string, T>();
    try {
      const items: T[] = JSON.parse(raw);
      return new Map(items.map((item) => [item.id, reviveDates(item, dateFields)]));
    } catch {
      return new Map<string, T>();
    }
  }

  function upsert(storeId: string, item: T): void {
    const all = getAll(storeId);
    all.set(item.id, item);
    localStorage.setItem(storageKey(entity, storeId), JSON.stringify(Array.from(all.values())));
  }

  return { getAll, upsert };
}

/** Same entity key + date-revival fields the removed `BaseRepository<Order>('orders', [...])` used; wire format is now plain-array (id-869), not Map-entries. */
export function makeOrderRepoShim(): GenericUpsertRepo<Order> {
  return makeGenericUpsertRepoShim<Order>('orders', ['date', 'createdDate', 'updatedDate']);
}
