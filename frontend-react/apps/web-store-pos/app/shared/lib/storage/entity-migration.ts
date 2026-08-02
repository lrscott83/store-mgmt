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
// below means a single quota/storage failure never aborts the other five —
// the worst outcome is "still plaintext", never "cannot log in".
import { StorageKeys } from './storage-keys';
import { isEncrypted, encryptEntity } from './entity-crypto';
import { getRawRoster, isEncryptionProvisioned } from '../offline/roster-store';

/**
 * The six business-entity names migrated, in the same order the seams
 * landed (WU5-10): products -> product-categories -> inventory-entries ->
 * orders -> expenses -> saleCredits.
 */
const MIGRATED_ENTITY_NAMES = [
  'products',
  'product-categories',
  'inventory-entries',
  'orders',
  'expenses',
  'saleCredits',
] as const;

/**
 * Runs the eager migration pass for the CURRENT device's roster store.
 *
 * Guard: no-op (zero reads, zero writes) when `isEncryptionProvisioned()`
 * is false — a device that never imported a v2 roster is left byte-for-byte
 * untouched.
 *
 * Scope: `getRawRoster().storeId` — NOT the current user's
 * `selectedStoreId` (design correction 6). This is the roster's own store,
 * the one the just-unwrapped DEK actually belongs to, so a super-admin
 * whose active store differs from the roster's store can never have a
 * foreign store's data mass-encrypted under a key that isn't theirs. This
 * module never reads `selectedStoreId` at all.
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
  if (!isEncryptionProvisioned()) return;

  const bundle = getRawRoster();
  if (!bundle) return;
  const storeId = bundle.storeId;

  for (const entity of MIGRATED_ENTITY_NAMES) {
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
