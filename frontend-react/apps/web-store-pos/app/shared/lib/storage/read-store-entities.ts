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
import { readDeviceDekTable } from './device-dek-table';
import { getDeviceKey } from './device-key-store';
import { unwrapDekFromDevice } from './dek-bootstrap';
import { getDek } from './data-key-store';
import { decryptEntityWithDek } from './entity-crypto';
import { StorageKeys } from './storage-keys';

/**
 * Unwraps `storeId`'s DEK using this device's key. Returns `null` when the
 * store has no device wrap on this device (v1 table, no table, store granted
 * after this device's last login — the "no local data" case) or when the
 * device key is unavailable (IndexedDB failure, private browsing).
 */
export async function unwrapStoreDekForStore(storeId: string): Promise<Uint8Array | null> {
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
 * Reads a raw business-entity payload for ANY store from local storage and
 * decrypts it with the given explicit DEK. Never throws: absent key, corrupt
 * JSON, or an encrypted payload without a DEK all yield `[]`.
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
    return Array.isArray(parsed) ? (parsed as T[]) : [];
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
