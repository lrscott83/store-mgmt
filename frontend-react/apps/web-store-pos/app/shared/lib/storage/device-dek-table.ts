// design §2 "storage/device-dek-table.ts — NEW, sync, zero-runtime-import
// leaf". Imported statically by `entity-crypto.ts`, which is imported
// statically by all six entity modules (`expense-offline-service.ts`,
// `product-repository.ts`, `product-category-repository.ts`,
// `sale-credit-offline-service.ts`, `order-offline-service.ts`,
// `inventory-offline-service.ts`) — this module therefore MUST be as cheap
// as `roster-store.ts` is: no runtime imports, no top-level side effects.
// The `WrappedDekEntry` import below is `import type` and erases at build,
// so it costs nothing at runtime. Same discipline `roster-store.ts:13-14`
// states and `roster-store.purity.test.ts` enforces for that module — this
// one gets the SAME structural purity test (`device-dek-table.purity.test.ts`).
//
// ONLY `import type` is allowed below.
import type { WrappedDekEntry } from '../offline/dek-unwrap';

export const DEVICE_DEK_KEY = 'lizoft.device-dek';

/**
 * seamless-store-switch (formatVersion 2): the optional per-store map. Each
 * entry holds that store's DEK wrapped under THIS device's key, provisioned
 * at login from the response's `storeDekWraps` (the password is only ever in
 * hand there). In-session store switching retargets one of these entries into
 * `device` (see `retargetDeviceWrapStore`), so the reload recovers the NEW
 * store's key with no password — `bootstrapDeviceDek` reads only `device` +
 * `storeId` and needs no change at all. v1 tables simply lack the field;
 * `hasValidShape` accepts both and everything else treats absence as "no
 * per-store wraps provisioned on this device yet".
 */
export interface DeviceDekTable {
  formatVersion: 1 | 2;
  // Provenance of the key this table holds, for forensics only — nothing
  // branches on it. `'login-response'` is the D1 source-3 addition (the wrap
  // the login response carries); it is server-derived exactly like
  // `'roster'`, but recording it as `'roster'` would claim a bundle that may
  // never have existed on this device, and recording it as `'local'` would
  // claim the opposite of the truth — `'local'` means "minted here, nobody can
  // ever re-derive it", the pre-D2 behaviour this change removed.
  dekSource: 'roster' | 'local' | 'login-response';
  storeId: string;
  device: { wrappedDek: string; wrapIv: string } | null;
  users: Record<string, WrappedDekEntry>;
  conflictDetectedAt?: number;
  conflictStoreId?: string;
  stores?: Record<string, { device: { wrappedDek: string; wrapIv: string } }>;
}

/**
 * Same discipline as `roster-store.ts:60-69`'s `hasValidShape` — an
 * unguarded read of a future/garbage shape is silently wrong forever.
 * Accepts formatVersion 1 (legacy tables, no `stores`) and 2 (per-store
 * wraps); the `stores` field itself is optional in both, guarded only when
 * present.
 */
function hasValidShape(candidate: unknown): candidate is DeviceDekTable {
  if (!candidate || typeof candidate !== 'object') return false;
  const t = candidate as Record<string, unknown>;
  if (t['formatVersion'] !== 1 && t['formatVersion'] !== 2) return false;
  if (
    t['dekSource'] !== 'roster' &&
    t['dekSource'] !== 'local' &&
    t['dekSource'] !== 'login-response'
  ) {
    return false;
  }
  if (typeof t['storeId'] !== 'string') return false;
  if (t['device'] !== null && typeof t['device'] !== 'object') return false;
  if (!t['users'] || typeof t['users'] !== 'object' || Array.isArray(t['users'])) return false;
  if (t['stores'] !== undefined) {
    if (typeof t['stores'] !== 'object' || t['stores'] === null || Array.isArray(t['stores'])) {
      return false;
    }
    const stores = t['stores'] as Record<string, unknown>;
    for (const entry of Object.values(stores)) {
      if (!entry || typeof entry !== 'object') return false;
      const device = (entry as Record<string, unknown>)['device'];
      if (!device || typeof device !== 'object') return false;
      const d = device as Record<string, unknown>;
      if (typeof d['wrappedDek'] !== 'string' || typeof d['wrapIv'] !== 'string') return false;
    }
  }
  return true;
}

/**
 * The raw stored table, shape-guarded, never throws. `null` for absent,
 * non-JSON, or wrong-shape content.
 */
export function readDeviceDekTable(): DeviceDekTable | null {
  const raw = localStorage.getItem(DEVICE_DEK_KEY);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  return hasValidShape(parsed) ? parsed : null;
}

export function writeDeviceDekTable(table: DeviceDekTable): void {
  localStorage.setItem(DEVICE_DEK_KEY, JSON.stringify(table));
}

export function clearDeviceDekTable(): void {
  localStorage.removeItem(DEVICE_DEK_KEY);
}

/**
 * seamless-store-switch: retargets the ACTIVE device wrap (`device` + `storeId`
 * — the pair `bootstrapDeviceDek` reads on every page load) to `newStoreId`,
 * copying that store's provisioned wrap from the v2 `stores` map. Returns true
 * and persists when the store has a wrap on this device; false WITHOUT writing
 * when it does not (store granted after this device's last login, v1 table, no
 * table) — the caller must then fall back to the legacy logout flow, because a
 * reload would boot with the OLD store's key under the NEW store's session.
 */
export function retargetDeviceWrapStore(newStoreId: string): boolean {
  const table = readDeviceDekTable();
  if (!table || !table.stores) return false;
  const entry = table.stores[newStoreId];
  if (!entry?.device?.wrappedDek || !entry.device.wrapIv) return false;
  table.device = { wrappedDek: entry.device.wrappedDek, wrapIv: entry.device.wrapIv };
  table.storeId = newStoreId;
  writeDeviceDekTable(table);
  return true;
}

/**
 * D2 — the Q1 device-level predicate. True whenever this device holds ANY
 * wrap material (a device-key wrap or at least one user password wrap),
 * independent of roster state. `entity-crypto.ts`'s guard and
 * `unlock-gate.ts`'s new branch both read this.
 */
export function hasDeviceDekWrap(): boolean {
  const table = readDeviceDekTable();
  if (!table) return false;
  return table.device !== null || Object.keys(table.users).length > 0;
}
