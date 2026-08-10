// design §2 "storage/dek-bootstrap.ts — NEW, async, memoised" + §3 (seam 1:
// `authLoader` awaits this before evaluating `needsUnlock`, WU8) + §5 step
// 1 (`resolveDekForLogin`'s first line is `await bootstrapDeviceDek()`,
// WU5).
//
// Idempotent AND single-flight: a module-level `inFlight` memo (never a
// test-only export — tests reset it with `vi.resetModules()` + dynamic
// `import()`, the repo's established technique, e.g.
// `roster-store.purity.test.ts`, engram `profile-loader-stale-storeid-closure`)
// collapses concurrent callers into ONE key-open, matching design §3 step
// 5's observation that `app-layout`'s `clientLoader` races with
// child-route loaders.
//
// NEVER THROWS. Every branch that cannot recover (no table, no device
// wrap, IndexedDB unavailable, corrupt ciphertext) simply leaves the DEK
// `null` and returns — `unlock-gate.ts`'s new branch (WU8) is what takes
// over from there.
import { readDeviceDekTable, type DeviceDekTable } from './device-dek-table';
import { getDeviceKey } from './device-key-store';
import { getDek, setDek } from './data-key-store';
import { base64FromBytes, bytesFromBase64 } from './base64';
import { DekUnwrapError } from '../offline/dek-unwrap';

const DEVICE_WRAP_IV_BYTES = 12;

type DeviceWrap = NonNullable<DeviceDekTable['device']>;

/**
 * Pure WebCrypto over the device's non-extractable `CryptoKey` — NOT the
 * `@noble/ciphers` wrapper in `aes-gcm.ts`, which takes raw key BYTES and
 * cannot accept a native `CryptoKey`. `encrypt`, not `wrapKey`: the DEK is
 * raw bytes (`Uint8Array`, `data-key-store.ts:15`), not a `CryptoKey`, so
 * `wrapKey` would force an `importKey`/`exportKey` round trip and a second
 * key representation for zero benefit. WebCrypto AES-GCM emits
 * `ciphertext‖tag`, the same layout `aes-gcm.ts:20-25` documents, so the
 * two crypto stacks agree on the envelope by accident of the standard.
 */
export async function wrapDekForDevice(dek: Uint8Array, deviceKey: CryptoKey): Promise<DeviceWrap> {
  const iv = crypto.getRandomValues(new Uint8Array(DEVICE_WRAP_IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, deviceKey, dek);
  return {
    wrappedDek: base64FromBytes(new Uint8Array(ciphertext)),
    wrapIv: base64FromBytes(iv),
  };
}

/** Length ≠ 32 or any WebCrypto failure (tag mismatch, wrong key) → `DekUnwrapError` — same vocabulary as `offline/dek-unwrap.ts`'s `unwrapDek` (design D7). */
export async function unwrapDekFromDevice(wrap: DeviceWrap, deviceKey: CryptoKey): Promise<Uint8Array> {
  try {
    const iv = bytesFromBase64(wrap.wrapIv);
    const ciphertext = bytesFromBase64(wrap.wrappedDek);
    const plaintext = new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, deviceKey, ciphertext),
    );
    if (plaintext.length !== 32) {
      throw new DekUnwrapError();
    }
    return plaintext;
  } catch (err) {
    if (err instanceof DekUnwrapError) throw err;
    throw new DekUnwrapError();
  }
}

let inFlight: Promise<void> | null = null;

async function doBootstrap(): Promise<void> {
  if (getDek() !== null) return; // already unlocked this page load
  const table = readDeviceDekTable();
  if (!table?.device) return; // nothing to recover

  const key = await getDeviceKey();
  if (!key) return; // IndexedDB unavailable -> needsUnlock takes over

  try {
    const dek = await unwrapDekFromDevice(table.device, key);
    setDek(dek, table.storeId);
  } catch {
    // corrupt device wrap or unusable key — leave the DEK null, same class
    // of failure as any other unwrap failure (design F6)
  }
}

export async function bootstrapDeviceDek(): Promise<void> {
  if (!inFlight) {
    inFlight = doBootstrap().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
