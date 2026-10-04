// design §2 "storage/device-key-store.ts — NEW, the only IndexedDB in the
// repo" + §3 (bootstrap ordering) + §6 (F1-F3 failure modes). This module
// persists exactly one non-extractable AES-GCM `CryptoKey` — the "device
// key" — that wraps this device's DEK (see `offline/dek-bootstrap.ts` and
// `offline/dek-provisioning.ts`). It is the ONLY IndexedDB usage in this
// repo; everything else the device wrap needs (wrapped ciphertext, IVs,
// password wraps) lives in `localStorage` via `device-dek-table.ts` — see
// design D1 for why the split exists (a non-extractable `CryptoKey` cannot
// be JSON-serialised, so it is the one thing that MUST live in IndexedDB).
//
// Every exported function here NEVER THROWS. Every IndexedDB failure mode
// (no `indexedDB` global, `SecurityError` in private browsing / a
// third-party context, `VersionError`, `QuotaExceededError`, a `blocked`
// event that never settles) resolves `null` (or, for `deleteDeviceKey`,
// resolves normally) so callers branch on a plain nullable value with no
// `try` of their own.
//
// The `open()` call is bounded by `DEVICE_KEY_OPEN_TIMEOUT_MS`
// (non-negotiable, design §2): a `blocked` event never fires `onerror`, it
// simply never settles — and this module is `await`ed inside `authLoader`
// (design §3 seam 1). An unbounded open here is a permanent white screen,
// the same trap class the E2E suite already recorded for Vite dev-server
// chunk fetches (engram `gotcha-e2e-offline-vite-dev-modulos`).
import { logClientError } from '../diagnostics/client-log';
import { readDeviceDekTable } from './device-dek-table';

export const DEVICE_KEY_DB = 'lizoft-device-key'; // version 1, FOREVER — see design §2
export const DEVICE_KEY_STORE = 'keys';
export const DEVICE_KEY_ID = 'device-dek-key';
export const DEVICE_KEY_OPEN_TIMEOUT_MS = 3_000;

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof globalThis.indexedDB === 'undefined') {
      resolve(null);
      return;
    }

    let settled = false;
    const settle = (value: IDBDatabase | null): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    // Non-negotiable bound: a `blocked` event never resolves this on its
    // own, so the timeout below is the ONLY exit for that case.
    const timeoutId = setTimeout(() => settle(null), DEVICE_KEY_OPEN_TIMEOUT_MS);

    let request: IDBOpenDBRequest;
    try {
      request = globalThis.indexedDB.open(DEVICE_KEY_DB, 1);
    } catch {
      clearTimeout(timeoutId);
      settle(null);
      return;
    }

    request.onupgradeneeded = () => {
      // Version is pinned at 1 forever (design §2) — the record is one
      // opaque CryptoKey, there is nothing to migrate.
      request.result.createObjectStore(DEVICE_KEY_STORE);
    };
    request.onsuccess = () => {
      clearTimeout(timeoutId);
      settle(request.result);
    };
    request.onerror = () => {
      clearTimeout(timeoutId);
      settle(null);
    };
    // `onblocked` deliberately has no handler that settles anything — see
    // the timeout comment above.
  });
}

// Outcome of a read: `found` / `absent` / `error` are DISTINCT on purpose —
// "could not read" must NEVER be treated as "does not exist" (the bug that
// replaced a valid key and orphaned every wrap made with it).
type DeviceKeyRead =
  | { status: 'found'; key: CryptoKey }
  | { status: 'absent' }
  | { status: 'error'; error: unknown };

function readKeyRecord(db: IDBDatabase): Promise<DeviceKeyRead> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DEVICE_KEY_STORE, 'readonly');
      const store = tx.objectStore(DEVICE_KEY_STORE);
      const request = store.get(DEVICE_KEY_ID);
      request.onsuccess = () => {
        const value = request.result as CryptoKey | undefined;
        resolve(value ? { status: 'found', key: value } : { status: 'absent' });
      };
      request.onerror = () => resolve({ status: 'error', error: request.error });
    } catch (error) {
      resolve({ status: 'error', error });
    }
  });
}

function describeError(error: unknown): { name: string; message: string; stack: string } {
  const e = error as { name?: string; message?: string; stack?: string } | null;
  return {
    name: e?.name ?? 'UnknownError',
    message: e?.message ?? String(error),
    stack: e?.stack ?? '',
  };
}

/**
 * Diagnostic trace for the events this module must never let become silent data
 * loss. Writes to the console AND the persisted client-error ring buffer, with
 * the previous wrap-table SHAPE (no key material — metadata only) so a field
 * device can be diagnosed after the fact. Never throws.
 */
function logDeviceKeyEvent(
  level: 'error' | 'warn',
  what: string,
  error?: unknown,
  extra?: Record<string, string | number | boolean | null>,
): void {
  const described = error === undefined ? null : describeError(error);
  let tableContext: Record<string, string | number | boolean | null>;
  try {
    const table = readDeviceDekTable();
    tableContext = table
      ? {
          formatVersion: table.formatVersion,
          dekSource: table.dekSource,
          storeId: table.storeId,
          hasDeviceWrap: table.device !== null,
          userWrapCount: Object.keys(table.users).length,
          storeWrapCount: Object.keys(table.stores ?? {}).length,
        }
      : { table: 'absent-or-invalid' };
  } catch {
    tableContext = { table: 'unreadable' };
  }

  const context = {
    db: DEVICE_KEY_DB,
    ...(described
      ? { errorName: described.name, errorMessage: described.message }
      : {}),
    ...tableContext,
    ...(extra ?? {}),
  };

  if (level === 'error') {
    console.error(`[device-key-store] ${what}`, { ...context, stack: described?.stack ?? '' });
  } else {
    console.warn(`[device-key-store] ${what}`, context);
  }

  try {
    logClientError({
      level,
      message: `[device-key-store] ${what}${
        described ? ` (${described.name}: ${described.message})` : ''
      }`,
      location: described?.stack,
      context,
    });
  } catch {
    // logging must never break key handling
  }
}

/**
 * `add` (never `put`): writing over an existing record must FAIL with
 * `ConstraintError` instead of silently destroying the stored key. A
 * concurrent mint is expected to lose this way and adopt the winner instead
 * (see `getOrCreateDeviceKey`).
 */
type DeviceKeyWrite = 'added' | 'exists' | 'error';

function addKeyRecord(db: IDBDatabase, key: CryptoKey): Promise<DeviceKeyWrite> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DEVICE_KEY_STORE, 'readwrite');
      const store = tx.objectStore(DEVICE_KEY_STORE);
      const request = store.add(key, DEVICE_KEY_ID);
      request.onsuccess = () => resolve('added');
      request.onerror = () =>
        resolve(request.error?.name === 'ConstraintError' ? 'exists' : 'error');
    } catch {
      resolve('error');
    }
  });
}

function deleteKeyRecord(db: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DEVICE_KEY_STORE, 'readwrite');
      const request = tx.objectStore(DEVICE_KEY_STORE).delete(DEVICE_KEY_ID);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Read-only. Never creates a key — creation happens only on the login path
 * (design §3/§5), otherwise every anonymous page load on the landing page
 * would mint an orphan key.
 */
export async function getDeviceKey(): Promise<CryptoKey | null> {
  try {
    const db = await openDb();
    if (!db) return null;
    const result = await readKeyRecord(db);
    db.close();
    return result.status === 'found' ? result.key : null;
  } catch {
    return null;
  }
}

/** Single-flight memo (mirrors `dek-bootstrap`'s `inFlight`): concurrent callers
 * share one resolution, so two callers on an empty DB can never double-mint. */
let inFlight: Promise<CryptoKey | null> | null = null;

async function doGetOrCreateDeviceKey(): Promise<CryptoKey | null> {
  try {
    const db = await openDb();
    if (!db) return null;

    const existing = await readKeyRecord(db);
    if (existing.status === 'found') {
      db.close();
      return existing.key;
    }
    if (existing.status === 'error') {
      // THE GUARD: a failed read is NOT "no key". Before this fix the code
      // minted a new key here and wrote it with `put`, overwriting the stored
      // one and orphaning every wrap made with it. Refuse; leave it untouched.
      logDeviceKeyEvent('error', 'read failed — refusing to mint a new key', existing.error);
      db.close();
      return null;
    }

    // Genuinely absent: safe to mint.
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const outcome = await addKeyRecord(db, key);
    if (outcome === 'added') {
      logDeviceKeyEvent('warn', 'minted a new device key', undefined, { outcome: 'added' });
      db.close();
      return key;
    }
    if (outcome === 'exists') {
      // A concurrent caller won the race — adopt ITS key, never overwrite it.
      const again = await readKeyRecord(db);
      db.close();
      return again.status === 'found' ? again.key : null;
    }
    logDeviceKeyEvent('warn', 'write failed for a new device key', undefined, { outcome });
    db.close();
    return null;
  } catch (error) {
    logDeviceKeyEvent('error', 'unexpected failure resolving the device key', error);
    return null;
  }
}

/**
 * Reads the persisted device key, minting one only when the record is
 * GENUINELY absent. `generateKey({...}, false, [...])` — the `false` is the
 * whole point (`extractable: false`, key model #2113).
 */
export async function getOrCreateDeviceKey(): Promise<CryptoKey | null> {
  if (!inFlight) {
    inFlight = doGetOrCreateDeviceKey().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/** Used by tests and E2E's F4 scenario (device key destroyed, wrap intact). */
export async function deleteDeviceKey(): Promise<void> {
  try {
    const db = await openDb();
    if (!db) return;
    await deleteKeyRecord(db);
    db.close();
  } catch {
    // never throws
  }
}
