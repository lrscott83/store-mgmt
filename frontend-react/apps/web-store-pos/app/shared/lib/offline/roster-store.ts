// roster-store.ts — NOT a zustand store (design D7: kept this name because
// the proposal/spec/rollback plan all name it this way; renaming to
// `roster-storage.ts` would be pure artifact drift for no gain).
//
// PURITY CONTRACT (design D1, load-bearing): this module is loaded via a
// dynamic `import()` on EVERY login submission, including from devices that
// never provisioned a roster. It therefore MUST NOT perform any top-level
// side effect (localStorage access, or any runtime import that could carry
// one) — evaluating this file can only ever cost a couple of string consts
// plus a few class/function declarations. Guarded by
// `__tests__/roster-store.purity.test.ts` (behavioral + structural).
//
// ONLY `import type` is allowed below.
import type { OfflineRosterBundle, OfflineRosterUser } from './roster-types';

// Device-scoped keys, deliberately raw strings (NOT `StorageKeys.entityKey`,
// which is store-scoped): the roster exists BEFORE any storeId is known —
// it is what determines the storeId a device is provisioned for.
const ROSTER_KEY = 'lizoft.offline-roster';
const REPLAY_KEY = 'lizoft.offline-roster-last';

export class ExpiredBundleError extends Error {
  readonly name = 'ExpiredBundleError';
  constructor(message = 'The roster bundle has already expired') {
    super(message);
    Object.setPrototypeOf(this, ExpiredBundleError.prototype);
  }
}

export class ReplayBundleError extends Error {
  readonly name = 'ReplayBundleError';
  constructor(message = 'This roster bundle has already been imported') {
    super(message);
    Object.setPrototypeOf(this, ReplayBundleError.prototype);
  }
}

// Declared INSIDE this file, not reused from `roster-serializer.ts`'s
// `CorruptFileError` — importing it would break the purity contract above
// (design D3).
export class InvalidBundleError extends Error {
  readonly name = 'InvalidBundleError';
  constructor(message = 'The roster bundle has an invalid shape') {
    super(message);
    Object.setPrototypeOf(this, InvalidBundleError.prototype);
  }
}

interface ReplayMarker {
  bundleId: string;
  issuedAt: number;
}

/**
 * Design D3: `expiresAt`/`issuedAt` are compared numerically. If a future
 * backend emits ISO strings instead, an unguarded numeric comparison is
 * `NaN`-false on both sides — an expired or garbage bundle would be treated
 * as valid FOREVER. This guard runs before any numeric comparison.
 */
function hasValidShape(candidate: unknown): candidate is OfflineRosterBundle {
  if (!candidate || typeof candidate !== 'object') return false;
  const b = candidate as Record<string, unknown>;
  return (
    typeof b['bundleId'] === 'string' &&
    typeof b['issuedAt'] === 'number' &&
    typeof b['expiresAt'] === 'number' &&
    Array.isArray(b['users'])
  );
}

function readReplayMarker(): ReplayMarker | null {
  const raw = localStorage.getItem(REPLAY_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ReplayMarker>;
    if (typeof parsed.bundleId === 'string' && typeof parsed.issuedAt === 'number') {
      return { bundleId: parsed.bundleId, issuedAt: parsed.issuedAt };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Imports a roster bundle, enforcing the shape guard (D3), expiry, and
 * anti-replay checks from `offline-roster-bundle`'s spec. Throws
 * `InvalidBundleError`/`ExpiredBundleError`/`ReplayBundleError` and persists
 * nothing on any rejection.
 */
export function importRoster(bundle: OfflineRosterBundle, now: number = Date.now()): void {
  if (!hasValidShape(bundle)) {
    throw new InvalidBundleError();
  }
  if (bundle.expiresAt <= now) {
    throw new ExpiredBundleError();
  }

  const last = readReplayMarker();
  if (last) {
    if (bundle.bundleId === last.bundleId) {
      throw new ReplayBundleError();
    }
    if (bundle.issuedAt <= last.issuedAt) {
      throw new ReplayBundleError();
    }
  }

  localStorage.setItem(ROSTER_KEY, JSON.stringify(bundle));
  localStorage.setItem(
    REPLAY_KEY,
    JSON.stringify({ bundleId: bundle.bundleId, issuedAt: bundle.issuedAt } satisfies ReplayMarker),
  );
}

/**
 * Reads the stored roster, if any. Never throws — an absent, corrupt,
 * malformed (D3), or expired bundle all resolve to `null`.
 */
export function getRoster(now: number = Date.now()): OfflineRosterBundle | null {
  const raw = localStorage.getItem(ROSTER_KEY);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!hasValidShape(parsed)) return null;
  if (parsed.expiresAt <= now) return null;

  return parsed;
}

export function findRosterUser(login: string, now: number = Date.now()): OfflineRosterUser | null {
  const bundle = getRoster(now);
  if (!bundle) return null;
  return bundle.users.find((u) => u.login === login) ?? null;
}

/** `= getRoster(now) !== null` — never throws (spec's mode predicate). */
export function isRosterProvisioned(now: number = Date.now()): boolean {
  return getRoster(now) !== null;
}

/**
 * Clears the stored roster. The anti-replay marker (`REPLAY_KEY`)
 * intentionally survives — re-importing the same bundle after a manual
 * clear must still be rejected as a replay.
 */
export function clearRoster(): void {
  localStorage.removeItem(ROSTER_KEY);
}
