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

export function needsUnlock(user: { login: string } | null): boolean {
  if (!user) return false;
  if (getDek() !== null) return false;
  if (hasDeviceDekWrap()) return true;
  // Expiry-IGNORING (design §4, trap 1): "expired" means "authenticate
  // online again", never "your data is plaintext" — encryption-provisioning
  // state must survive expiry.
  const bundle = getRawRoster();
  if (!bundle || bundle.formatVersion < 2) return false;
  const entry = bundle.users.find((u) => u.login === user.login);
  // The backend defaults these three fields to `""`, not `null` — the
  // non-empty checks matter, not just presence.
  return !!entry?.wrappedDek && !!entry.wrapSalt && !!entry.wrapIv;
}
