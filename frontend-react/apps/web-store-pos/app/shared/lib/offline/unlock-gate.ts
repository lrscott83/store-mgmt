// design §5, trap 2: gates on `needsUnlock(user)`, NEVER on `getDek() !== null`.
// Gating on the DEK alone would strand every online-auth-only user on
// `/login` forever — their DEK is `null` by design and always will be.
// `needsUnlock` is per-USER, not per-device: a v2 roster that does not
// contain THIS login gives this user nothing to unwrap, so device-level
// provisioning is not enough either.
//
// device-wrapped-dek design §4: a NEW branch above the roster check —
// `hasDeviceDekWrap()` is device-level, independent of roster state. A
// device that holds a local wrap table but could not auto-recover it this
// page load (bootstrap failed, corrupt device-key wrap, IndexedDB down —
// design §6 F4-F7) needs a password, even for a user with no roster entry
// at all (the previously-uncaught `MissingDataKeyError` gap).
import { getDek } from '../storage/data-key-store';
import { getRawRoster } from './roster-store';
import { hasDeviceDekWrap } from '../storage/device-dek-table';

// Same EMPTY_GUID sentinel as auth-store.login's DEK-resolution skip
// (auth-store.ts:354-358) — the DEK is per-STORE material, so a user with no
// assigned store (SuperAdmin / Reseller) has no wrap, no roster entry and no
// device table of their own, by design.
const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

/**
 * Per-user subset of UserModel that the gate reads. `selectedStoreId` is
 * load-bearing: a user WITHOUT a store ('' / EMPTY_GUID — SuperAdmin /
 * Reseller) must never be locked by DEVICE-level wrap material left by
 * other users; their login path skips DEK resolution entirely, so their
 * password could never open it. The one exception is a v2 roster entry
 * carrying wrap material OF THEIR OWN, which the unlock form can open.
 */
export interface UnlockGateUser {
  login: string;
  /** The user's selected store, or ''/EMPTY_GUID when none (SuperAdmin/Reseller). */
  selectedStoreId?: string;
}

export function needsUnlock(user: UnlockGateUser | null): boolean {
  if (!user) return false;
  if (getDek() !== null) return false;
  // Expiry-IGNORING (design §4, trap 1): "expired" means "authenticate
  // online again", never "your data is plaintext" — encryption-provisioning
  // state must survive expiry.
  const bundle = getRawRoster();
  const entry =
    bundle && bundle.formatVersion >= 2
      ? bundle.users.find((u) => u.login === user.login)
      : undefined;
  // The backend defaults these three fields to `""`, not `null` — the
  // non-empty checks matter, not just presence.
  const provisionedInRoster = !!entry?.wrappedDek && !!entry.wrapSalt && !!entry.wrapIv;
  // Storeless-user exclusion (online-login stranding bug): a user with no
  // assigned store (SuperAdmin / Reseller) has no DEK and no wrap of their
  // own by design — auth-store.login skips resolveDekForLogin for them
  // (auth-store.ts:354-358), so their password can never open another
  // user's wraps. Only an EXPLICIT empty store id marks a storeless user
  // (the backend serializes Guid.Empty and '' alike); `undefined` means a
  // legacy caller that did not provide the field, which keeps historical
  // behavior. A storeless user who nevertheless HAS a v2 roster entry with
  // wrap material of their own is NOT excluded: that material is exactly
  // what the unlock form can open with their password.
  const storeId = user.selectedStoreId;
  const storeless = storeId === '' || storeId === EMPTY_GUID;
  if (storeless && !provisionedInRoster) return false;
  if (hasDeviceDekWrap()) return true;
  return provisionedInRoster;
}

// entity-crypto.ts:23 (ENTITY_ENVELOPE_PREFIX), mirrored as a literal:
// importing entity-crypto from here would drag `aes-gcm` (@noble/ciphers)
// into the unlock-gate chunk loaders.ts dynamic-imports on every
// authenticated navigation. Same discipline roster-fixture.ts applies.
const ENTITY_ENVELOPE_PREFIX = 'enc:v1:';

// entity storage key shape (storage-keys.ts StorageKeys.entityKey):
// `lizoft.store-{entity}-{storeId}` — store-scoped, no APP_VERSION prefix.
const ENTITY_KEY_PREFIX = 'lizoft.store-';

// The daily exchange-rate register is the ONE business entity that is
// SYSTEM-GENERATED rather than user-authored: every OwnerAdmin
// authentication backfills it (exchange-rate-daily.ts), values default to
// 1 / the previous day's, and a lost register is re-ingestable by hand. It
// must never justify hijacking a valid session — that was the second half
// of the 2026-09-06 report: EVERY owner session writes this ciphertext at
// login, so keying the gate on "any ciphertext" re-locked every store on
// earth the moment its device key vanished.
const REGENERABLE_ENTITY_KEY_PREFIX = 'lizoft.store-exchangeRates-';

/**
 * Legacy empty-collection ciphertext: `enc:v1:` + base64 of EXACTLY 30
 * bytes. AES-GCM adds no padding, so ciphertext length is deterministic:
 * iv(12) + plaintext(n) + tag(16). The JSON sentinels '[]' and '{}' are
 * both 2 bytes of plaintext, so their pre-fix ciphertexts (encryptEntity
 * used to encrypt them) are exactly 30 bytes → 40 base64 chars. No 2-byte
 * JSON document other than '[]'/'{}' exists (any other value needs ≥3
 * bytes), so length alone is a sound discriminator — no decryption, no DEK.
 */
function isEmptyCollectionCiphertext(value: string): boolean {
  const payload = value.slice(ENTITY_ENVELOPE_PREFIX.length);
  return payload.length === 40;
}

/**
 * Valid-session fix (user report 2026-09-06): true only when this device
 * actually HOLDS encrypted USER data (`enc:v1:` values) it currently cannot
 * read. `needsUnlock` alone says "this device once provisioned a key" —
 * which is true even for a fresh store whose only wrap came from
 * registration, with ZERO user ciphertext on disk. Hijacking navigation
 * there expelled a valid session to /login on every reload and parked it
 * on /login//register. The hijack is only justified to protect unreadable
 * USER data; system-regenerable registers and legacy empty collections do
 * not count.
 */
export function hasUnreadableCiphertext(): boolean {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(ENTITY_KEY_PREFIX)) continue;
    if (key.startsWith(REGENERABLE_ENTITY_KEY_PREFIX)) continue;
    const value = localStorage.getItem(key);
    if (value && value.startsWith(ENTITY_ENVELOPE_PREFIX) && !isEmptyCollectionCiphertext(value)) {
      return true;
    }
  }
  return false;
}
