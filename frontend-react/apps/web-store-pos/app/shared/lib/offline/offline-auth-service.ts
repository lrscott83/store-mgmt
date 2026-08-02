import type { UserModel } from '@store-mgmt/domain';
import { getRoster } from './roster-store';
import type { OfflineRosterUser } from './roster-types';
import { verifyOfflinePassword } from './offline-crypto';
import { OFFLINE_SESSION_TOKEN } from './offline-session';
// design §2 module map: this file already lives under `offline/`, so these
// are STATIC imports (no D6 constraint here — that constraint is
// `auth-store.ts`-specific).
import { unwrapDek } from './dek-unwrap';
import { setDek } from '../storage/data-key-store';
import { runEntityMigration } from '../storage/entity-migration';

export class NoRosterError extends Error {
  readonly name = 'NoRosterError';
  constructor(message = 'No offline roster is provisioned on this device') {
    super(message);
    Object.setPrototypeOf(this, NoRosterError.prototype);
  }
}

export class OfflineUserNotFoundError extends Error {
  readonly name = 'OfflineUserNotFoundError';
  constructor(message = 'This login is not present in the offline roster') {
    super(message);
    Object.setPrototypeOf(this, OfflineUserNotFoundError.prototype);
  }
}

export class OfflineInvalidPasswordError extends Error {
  readonly name = 'OfflineInvalidPasswordError';
  constructor(message = 'Incorrect offline password') {
    super(message);
    Object.setPrototypeOf(this, OfflineInvalidPasswordError.prototype);
  }
}

export class OfflineUserInactiveError extends Error {
  readonly name = 'OfflineUserInactiveError';
  constructor(message = 'This roster user is inactive') {
    super(message);
    Object.setPrototypeOf(this, OfflineUserInactiveError.prototype);
  }
}

export class OfflineVerifierError extends Error {
  readonly name = 'OfflineVerifierError';
  constructor(message = 'The roster verifier could not be evaluated') {
    super(message);
    Object.setPrototypeOf(this, OfflineVerifierError.prototype);
  }
}

/**
 * Design correction #1 (drops the plan's dead `bundleExpiresAt` param —
 * `auth-store.ts`'s `setUser` overwrites `expiresIn` unconditionally):
 * billing fields carry no-billing-data defaults since the roster stores no
 * billing snapshot (`offline-auth-mode` spec).
 */
function toUserModel(user: OfflineRosterUser): UserModel {
  return {
    id: user.id,
    login: user.login,
    fullName: user.fullName,
    cellPhone: '',
    email: '',
    isActive: user.isActive,
    password: '',
    roles: user.roles,
    featureIds: user.featureIds,
    storeModuleIds: user.storeModuleIds,
    isSuperAdmin: user.isSuperAdmin,
    isOwnerAdmin: user.isOwnerAdmin,
    isReSeller: user.isReSeller,
    selectedStoreId: user.selectedStoreId,
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
    authToken: OFFLINE_SESSION_TOKEN,
    refreshToken: '',
    expiresIn: 0,
  };
}

/**
 * Verifies `login`/`password` against the locally-stored roster and maps
 * the matching roster user to a `UserModel`. Performs EXACTLY ONE
 * `getRoster()` read and searches `bundle.users` locally — no second read
 * via `findRosterUser`, closing a TOCTOU window where the bundle could
 * expire between two separate reads.
 */
export async function authenticateOffline(login: string, password: string): Promise<UserModel> {
  const bundle = getRoster();
  if (!bundle) {
    throw new NoRosterError();
  }

  const user = bundle.users.find((u) => u.login === login);
  if (!user) {
    // Spec offline-auth-mode: "A user absent from the roster is rejected
    // like a wrong password" — login.tsx maps this to the same message id
    // as OfflineInvalidPasswordError.
    throw new OfflineUserNotFoundError();
  }

  if (
    !user.verifier ||
    typeof user.verifier.hash !== 'string' ||
    typeof user.verifier.salt !== 'string' ||
    typeof user.verifier.iterations !== 'number'
  ) {
    throw new OfflineVerifierError();
  }

  const verified = await verifyOfflinePassword(password, user.verifier);
  if (!verified) {
    throw new OfflineInvalidPasswordError();
  }

  if (!user.isActive) {
    throw new OfflineUserInactiveError();
  }

  // design §11 (dek-lifecycle-and-unlock-gate, WU11.5): unwrap AFTER the
  // verifier check passes (the password is confirmed correct at this
  // point), BEFORE toUserModel. A v1 roster (no wrap fields on `user`)
  // skips this entirely -- DEK stays null, exactly today's behavior.
  if (user.wrappedDek && user.wrapSalt && user.wrapIv) {
    const dek = await unwrapDek(password, {
      wrappedDek: user.wrappedDek,
      wrapSalt: user.wrapSalt,
      wrapIv: user.wrapIv,
    });
    setDek(dek, bundle.storeId);
    // design §12 (entity-migration, WU13): eager migration fires right
    // after a successful DEK unwrap. Swallowed — its failure must NEVER
    // block login; the worst outcome is "still plaintext", never "cannot
    // log in".
    try {
      runEntityMigration();
    } catch {
      // intentionally swallowed — see comment above.
    }
  }

  return toUserModel(user);
}
