// multi-store-panels — read-only access to OTHER stores' local business data.
//
// The device already holds a per-store DEK wrap for every store whose login
// provisioned it (device-dek-table v2 `stores` map). This module unwraps a
// store's DEK with the device key (same primitive `dek-bootstrap.ts` uses for
// the selected store) and reads raw entity payloads from that store's
// `lizoft.store-{entity}-{storeId}` key, decrypting with the EXPLICIT store
// DEK — never the in-memory singleton, which belongs to the selected store.
//
// READ-ONLY by construction: there is no write helper here. Every function
// NEVER THROWS — a store without a local wrap, with an unreadable key, or
// with corrupt data simply yields no rows (the views render "sin datos"),
// mirroring dek-bootstrap's silent-failure discipline (design F6).
//
// PAYLOAD SHAPES (entries-multistore-integration, bug 2026-09-18): the per-
// store entities are NOT stored uniformly. Orders/credits/expenses save flat
// arrays, but inventory-entries/products/product-categories serialize a MAP
// keyed by product/category id ([[id, value], ...] after JSON). readStoreEntities
// normalizes both: a map-shaped array yields its VALUES; a flat array passes
// through; anything else is treated as no data.
import { readDeviceDekTable } from './device-dek-table';
import { getDeviceKey } from './device-key-store';
import { unwrapDekFromDevice } from './dek-bootstrap';
import { getDek, getDekStoreId } from './data-key-store';
import { decryptEntityWithDek } from './entity-crypto';
import { StorageKeys } from './storage-keys';

/**
 * Unwraps `storeId`'s DEK using this device's key. Returns `null` when the
 * store has no device wrap on this device (v1 table, no table, store granted
 * after this device's last login — the "no local data" case) or when the
 * device key is unavailable (IndexedDB failure, private browsing).
 */
export async function unwrapStoreDekForStore(storeId: string): Promise<Uint8Array | null> {
  // The in-memory DEK is authoritative for the store it belongs to: it is the
  // EXACT key the single-store services use to read/write that store's data
  // (data-key-store binds it to `getDekStoreId()`). The device table's
  // `storeId` is only the label of the ACTIVE wrap and can legitimately differ
  // from the session's store — `dek-bootstrap.test.ts` writes such a divergent
  // table to prove its early-return, and `dek-provisioning.ts:430-436` documents
  // the session-scopes-by-`getDekStoreId()` vs reload-scopes-by-`table.storeId`
  // split. Resolving this store's DEK from the table alone made multi-store mode
  // read the SELECTED store with a null DEK, so every panel rendered "sin datos"
  // while single-store mode (which uses this same in-memory DEK) worked.
  const activeDek = getDek();
  if (activeDek !== null && getDekStoreId() === storeId) return activeDek;

  const table = readDeviceDekTable();
  if (!table) return null;
  // The selected store's DEK is already in memory — use it directly instead
  // of re-deriving from its device wrap.
  if (storeId === table.storeId) return getDek();

  const wrap = table.stores?.[storeId]?.device;
  if (!wrap) return null;

  const deviceKey = await getDeviceKey();
  if (!deviceKey) return null;

  try {
    return await unwrapDekFromDevice(wrap, deviceKey);
  } catch {
    // corrupt wrap / unusable key — same silent-failure class as bootstrap
    return null;
  }
}

/**
 * True when `parsed` is an array of [key, value] PAIRS — i.e. a serialized
 * Map (`Array.from(map)` shape) rather than a flat entity array. Every pair
 * element must be a 2-tuple whose first item is a string key; a flat array of
 * entities never satisfies this (entities are objects, not 2-element arrays).
 */
function isMapShapedArray(parsed: unknown[]): boolean {
  return (
    parsed.length > 0 &&
    parsed.every(
      (item) =>
        Array.isArray(item) &&
        item.length === 2 &&
        typeof item[0] === 'string',
    )
  );
}

/**
 * Reads a raw business-entity payload for ANY store from local storage and
 * decrypts it with the given explicit DEK. Never throws: absent key, corrupt
 * JSON, or an encrypted payload without a DEK all yield `[]`.
 *
 * Accepts BOTH storage shapes the app produces: flat arrays (orders,
 * saleCredits, expenses) and serialized maps ([[id, value], ...] —
 * inventory-entries, products, product-categories), yielding the entities.
 */
export function readStoreEntities<T>(entity: string, storeId: string, dek: Uint8Array | null): T[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(StorageKeys.entityKey(entity, storeId));
  } catch {
    return [];
  }
  if (!raw) return [];

  let plaintext: string | null;
  try {
    plaintext = decryptEntityWithDek(raw, dek);
  } catch {
    // MissingExplicitDekError or a GCM tag failure — degrade to "no data"
    return [];
  }
  if (!plaintext) return [];

  try {
    const parsed: unknown = JSON.parse(plaintext);
    if (!Array.isArray(parsed)) return [];
    // Map-shaped payloads ([id, entities[]]) yield the VALUES, flattened one
    // level: inventory-entries/products/product-categories each map an id to
    // an ARRAY of entities (order items map to a single entity each).
    return (
      isMapShapedArray(parsed) ? parsed.map((pair) => pair[1]).flat() : parsed
    ) as T[];
  } catch {
    return [];
  }
}

/**
 * All the store ids this device holds a DEK wrap for, INCLUDING the
 * selected store (whose DEK is the in-memory singleton — its wrap entry is
 * unnecessary for reads but it is always readable). The multi-store views
 * intersect this with the owner's active store list.
 */
export function getStoresWithLocalDek(): Set<string> {
  const table = readDeviceDekTable();
  const out = new Set<string>();
  if (!table) return out;
  out.add(table.storeId);
  for (const storeId of Object.keys(table.stores ?? {})) {
    out.add(storeId);
  }
  return out;
}
