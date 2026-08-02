// design §5, trap 2: gates on `needsUnlock(user)`, NEVER on `getDek() !== null`.
// Gating on the DEK alone would strand every online-auth-only user on
// `/login` forever — their DEK is `null` by design and always will be.
// `needsUnlock` is per-USER, not per-device: a v2 roster that does not
// contain THIS login gives this user nothing to unwrap, so device-level
// provisioning is not enough either.
import { getDek } from '../storage/data-key-store';
import { getRawRoster } from './roster-store';

export function needsUnlock(user: { login: string } | null): boolean {
  if (!user) return false;
  if (getDek() !== null) return false;
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
