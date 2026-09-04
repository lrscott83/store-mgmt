// design §12 (entity-migration spec) — the eager, one-time pass that
// converts already-stored plaintext business data to ciphertext the moment
// a device becomes encryption-provisioned and unlocked, so cold (rarely
// re-written) data does not sit in plaintext indefinitely under the
// illusion of protection.
//
// BYTE-PRESERVING BY CONSTRUCTION: raw `getItem` -> skip if absent or
// already `enc:v1:` -> `setItem(key, encryptEntity(raw))`. NEVER
// `JSON.parse`s, NEVER routes through a service's `setXLocalStorage` write
// seam (those apply business-data transforms — date revival, isCredit/
// paymentType backfills, auto-init-on-unparsable — unrelated to
// encryption; routing through them would rewrite content, not just its
// envelope).
//
// NEVER BLOCKS LOGIN: the caller (`auth-store.login` / `authenticateOffline`,
// both in WU11) wraps this call in `try {} catch {}`. Per-key isolation
// below means a single quota/storage failure never aborts the other six —
// the worst outcome is "still plaintext", never "cannot log in".
//
// device-wrapped-dek design §4: guard and scope now derive from the SAME
// single source, `getDekStoreId()`, replacing BOTH `isEncryptionProvisioned()`
// (guard) and `getRawRoster().storeId` (scope) — so a local-DEK device (no
// roster at all) also migrates its own pre-existing plaintext, which the
// old roster-only guard could never do. This module drops its `roster-store`
// import entirely.
import { StorageKeys, BUSINESS_ENTITY_NAMES } from './storage-keys';
import { isEncrypted, encryptEntity } from './entity-crypto';
import { getDekStoreId } from './data-key-store';

/**
 * Runs the eager migration pass for the CURRENT device's DEK store.
 *
 * Guard (device-wrapped-dek §4): no-op (zero reads, zero writes) when
 * `getDekStoreId()` is `null` — no DEK in memory this page load, so there
 * is nothing to encrypt with. Covers both the pre-bootstrap window (no DEK
 * at all) and a device that never completed any login.
 *
 * Scope (device-wrapped-dek §4): `getDekStoreId()` — the store the
 * in-memory DEK actually belongs to, NOT the current user's
 * `selectedStoreId` (design correction 6). On the roster path this is the
 * SAME value `auth-store.ts` already passes to `setDek(dek, bundle.storeId)`,
 * so a super-admin whose active store differs from the roster's store can
 * never have a foreign store's data mass-encrypted under a key that isn't
 * theirs. On a local-DEK device (no roster) it is the DEK's own store —
 * this module never reads `selectedStoreId` at all.
 *
 * Idempotent: a key already carrying the `enc:v1:` marker is left
 * untouched (no `setItem` call). Absent keys are skipped, never created.
 *
 * Per-key isolated: each key's read+convert+write is wrapped in its own
 * `try/catch` so a `setItem` failure (quota exceeded) on one key does not
 * prevent the remaining keys from converting, and leaves that key's prior
 * plaintext value intact (localStorage `setItem` is atomic per key) —
 * readable via `decryptEntity`'s permanent passthrough, retried on the
 * next successful unlock.
 */
export function runEntityMigration(): void {
  const storeId = getDekStoreId();
  if (!storeId) return;

  for (const entity of BUSINESS_ENTITY_NAMES) {
    const key = StorageKeys.entityKey(entity, storeId);
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      if (isEncrypted(raw)) continue;
      localStorage.setItem(key, encryptEntity(raw));
    } catch {
      // Per-key isolation (entity-migration spec): swallow so the loop
      // continues to the next key. The caller also swallows around the
      // whole call, but keeping isolation at the per-key level is what
      // lets keys 4-6 still convert when key 3 fails.
    }
  }
}
