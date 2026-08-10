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

function readKeyRecord(db: IDBDatabase): Promise<CryptoKey | null> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DEVICE_KEY_STORE, 'readonly');
      const store = tx.objectStore(DEVICE_KEY_STORE);
      const request = store.get(DEVICE_KEY_ID);
      request.onsuccess = () => resolve((request.result as CryptoKey | undefined) ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function writeKeyRecord(db: IDBDatabase, key: CryptoKey): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DEVICE_KEY_STORE, 'readwrite');
      const store = tx.objectStore(DEVICE_KEY_STORE);
      const request = store.put(key, DEVICE_KEY_ID);
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    } catch {
      resolve(false);
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
    const key = await readKeyRecord(db);
    db.close();
    return key;
  } catch {
    return null;
  }
}

/**
 * Reads the persisted device key, minting one on first use.
 * `generateKey({name:'AES-GCM', length:256}, false, [...])` — the `false`
 * is the whole point (`extractable: false`, key model #2113).
 */
export async function getOrCreateDeviceKey(): Promise<CryptoKey | null> {
  try {
    const db = await openDb();
    if (!db) return null;

    const existing = await readKeyRecord(db);
    if (existing) {
      db.close();
      return existing;
    }

    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const wrote = await writeKeyRecord(db, key);
    db.close();
    return wrote ? key : null;
  } catch {
    return null;
  }
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
