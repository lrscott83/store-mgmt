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
