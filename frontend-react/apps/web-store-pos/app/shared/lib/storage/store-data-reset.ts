// The irreversible wipe behind the catalog's "Limpiar" button
// (openspec/changes/catalog-show-all-and-clear-data/superpowers-design.md §D5).
//
// SCOPE: the six business entities of ONE store. It never touches `token`,
// `AUTH_MODEL`, `currentUser`, `language`, the offline roster, or the
// device-wrapped DEK — the session survives the wipe and the device keeps its
// offline access.
//
// It also never touches the cart. The cart is zustand-persisted state with an
// in-memory copy (`cart-store.ts:111,136`); removing its key here would leave
// that copy populated in the current tab, which would then re-persist itself.
// The caller clears the cart through the store's own `clear()` action.
import { StorageKeys, BUSINESS_ENTITY_NAMES } from './storage-keys';

/**
 * Removes every business-entity key belonging to `storeId`.
 *
 * Per-key isolation mirrors `entity-migration.ts:77-88`: each removal is
 * wrapped on its own so a storage failure on one entity cannot abort the
 * remaining five. A partial wipe is a worse outcome than a full one, but a
 * far better outcome than "the first key threw and the other five are still
 * there without anyone knowing which".
 *
 * Idempotent: absent keys are skipped by `removeItem` itself and are never
 * created.
 */
export function clearStoreData(storeId: string): void {
  for (const entity of BUSINESS_ENTITY_NAMES) {
    try {
      localStorage.removeItem(StorageKeys.entityKey(entity, storeId));
    } catch {
      // Per-key isolation — swallow so the loop reaches the remaining keys.
    }
  }
}
