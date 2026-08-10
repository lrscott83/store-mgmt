// design §5 (device-dek-wrap / dek-lifecycle-and-unlock-gate) —
// "offline/dek-provisioning.ts — NEW, the login-path resolver". Called from
// `auth-store.login` / `auth-store.loginOffline` via DYNAMIC import (D6:
// `auth-store.ts` keeps zero static `offline/` imports). Lives under
// `offline/`, not `storage/`, because it reads the roster (`getRawRoster`)
// and runs password KDFs — exactly the weight `offline/` exists to keep out
// of the initial bundle.
//
// This module decides THIS DEVICE's DEK for THIS login, once per device,
// then makes every subsequent login/reload on this device reuse it. The
// six-step algorithm below is design §5's pseudocode, transcribed as
// literally as possible; the two structural notes inline mark the two
// places this implementation had to make an explicit choice where §5's
// compressed pseudocode underspecified the outcome (see design §6's F5/F9
// rows and the device-dek-wrap spec's own Given/When/Then scenarios, which
// this code follows where the two disagree in detail).
import { bootstrapDeviceDek, wrapDekForDevice } from '../storage/dek-bootstrap';
import { getDek, setDek, getDekStoreId } from '../storage/data-key-store';
import {
  readDeviceDekTable,
  writeDeviceDekTable,
  type DeviceDekTable,
} from '../storage/device-dek-table';
import { getOrCreateDeviceKey } from '../storage/device-key-store';
import { unwrapDek, wrapDekWithPassword, DekUnwrapError, type WrappedDekEntry } from './dek-unwrap';
import { getRawRoster } from './roster-store';
import { runEntityMigration } from '../storage/entity-migration';

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** This login's non-empty roster wrap entry (design §5's "rosterEntry"), or `undefined`. */
function findRosterWrapEntry(login: string): WrappedDekEntry | undefined {
  const bundle = getRawRoster();
  const entry = bundle?.users.find((u) => u.login === login);
  if (entry?.wrappedDek && entry.wrapSalt && entry.wrapIv) {
    return { wrappedDek: entry.wrappedDek, wrapSalt: entry.wrapSalt, wrapIv: entry.wrapIv };
  }
  return undefined;
}

const CONFLICT_LOG_MARKER = '[dek-provisioning] roster DEK disagrees with the established device DEK';

/**
 * Resolves and sets THIS DEVICE's DEK for `args.login`, in order:
 * an already-recovered device DEK > this login's own table wrap >
 * the roster's wrap for this login > a freshly minted local DEK (Q2).
 * Never throws EXCEPT the one genuine dead end (design §6 F5): a table
 * exists, holds no recoverable wrap for this login, and the roster has none
 * either.
 */
export async function resolveDekForLogin(args: {
  login: string;
  password: string;
  sessionStoreId: string;
}): Promise<void> {
  const { login, password, sessionStoreId } = args;

  // Step 1 — may already set the DEK this page load (a working device-key
  // wrap recovers silently, with no password).
  await bootstrapDeviceDek();

  // Step 2.
  let dek = getDek();

  const table = readDeviceDekTable();
  const rosterEntry = findRosterWrapEntry(login);

  // Gates step 4's reconciliation: true only when THIS call derived the DEK
  // from the roster just now (step 3b, or 3a's roster fallback). Comparing
  // the DEK against the very roster entry it was just derived from would
  // only ever re-confirm equality, so reconciliation is skipped whenever
  // this stays false-with-no-roster-derivation-this-call, INCLUDING the
  // case below where the DEK was already non-null on entry (structural
  // note 1).
  let dekSourcedFromRosterThisCall = false;
  let source: DeviceDekTable['dekSource'] | undefined;
  let tableStoreId: string | undefined;

  if (dek === null) {
    if (table) {
      // Step 3a — a table exists, but step 1's bootstrap did not recover a
      // DEK from `table.device` (missing, unusable, or corrupt).
      const own = table.users[login];
      if (own) {
        dek = await unwrapDek(password, own);
        setDek(dek, table.storeId);
      } else if (rosterEntry) {
        dek = await unwrapDek(password, rosterEntry);
        setDek(dek, table.storeId);
        dekSourcedFromRosterThisCall = true;
      } else {
        // F5 — the genuine dead end: nothing in the table for this login,
        // nothing in the roster either. Narrower than, and strictly better
        // than, the uncaught MissingDataKeyError this replaces.
        throw new DekUnwrapError();
      }
    } else if (rosterEntry) {
      // Step 3b — no table yet, this login has a roster wrap: adopt those
      // bytes as the device DEK. `auth-store.dek.test.ts:151-161` (11.4,
      // NOT authorized) lives exactly here — its `beforeEach` clears
      // localStorage, so no table exists, and a stale roster wrap's
      // `unwrapDek` rejection propagates unhandled, hard-failing the login
      // (unchanged from today).
      const bundle = getRawRoster()!;
      dek = await unwrapDek(password, rosterEntry);
      setDek(dek, bundle.storeId);
      source = 'roster';
      tableStoreId = bundle.storeId;
      dekSourcedFromRosterThisCall = true;
    } else {
      // Step 3c — Q2 mint: first-ever DEK for this device, nothing to adopt.
      dek = crypto.getRandomValues(new Uint8Array(32));
      setDek(dek, sessionStoreId);
      source = 'local';
      tableStoreId = sessionStoreId;
    }
  } else if (!table) {
    // Structural note 1: the DEK was already non-null on entry (step 1's
    // bootstrap found nothing to recover — `table` is null here — so this
    // can only be the offline path: `authenticateOffline`'s own, unchanged
    // roster unwrap, D4, offline-auth-service.ts:127-143). This device has
    // no table yet; the DEK it just set came from the roster by
    // construction, so the table this call creates records that origin.
    source = 'roster';
    tableStoreId = getDekStoreId() ?? sessionStoreId;
    dekSourcedFromRosterThisCall = true;
  }

  if (dek === null) {
    // Unreachable: every branch above either assigns `dek` or throws. Kept
    // as a guard so the type of `dek` below is `Uint8Array`, not
    // `Uint8Array | null`.
    throw new DekUnwrapError();
  }

  let workingTable = table;

  // Step 4 — reconcile (D6): only when this call did NOT just derive the
  // DEK from the roster, and a roster entry exists to compare against.
  if (!dekSourcedFromRosterThisCall && rosterEntry) {
    try {
      const fromRoster = await unwrapDek(password, rosterEntry);
      if (!bytesEqual(fromRoster, dek)) {
        const bundle = getRawRoster();
        workingTable = workingTable ?? {
          formatVersion: 1,
          dekSource: source ?? 'local',
          storeId: tableStoreId ?? getDekStoreId() ?? sessionStoreId,
          device: null,
          users: {},
        };
        workingTable.conflictDetectedAt = Date.now();
        workingTable.conflictStoreId = bundle?.storeId;
        console.error(CONFLICT_LOG_MARKER, { conflictStoreId: workingTable.conflictStoreId });
      }
    } catch {
      // F9 — stale roster wrap; we already hold the device DEK. Step 5
      // (structural note 2) refreshes this user's table entry below under
      // the password just used, rather than leaving it stale forever.
    }
  }

  // Step 5 — persist, best-effort, never fatal.
  workingTable = workingTable ?? {
    formatVersion: 1,
    dekSource: source ?? 'local',
    storeId: tableStoreId ?? getDekStoreId() ?? sessionStoreId,
    device: null,
    users: {},
  };
  if (!workingTable.device) {
    const deviceKey = await getOrCreateDeviceKey();
    if (deviceKey) {
      workingTable.device = await wrapDekForDevice(dek, deviceKey);
    }
  }
  // Structural note 2: unconditionally (re)written, not only when absent.
  // The device-dek-wrap spec's "Out-of-band password change recovers via
  // the device DEK" scenario requires a stale entry to be REGENERATED under
  // the credentials just used, not left in place — §5's pseudocode
  // (`if (!table.users[login])`) is a compressed sketch of the common case
  // (first-ever entry); this follows the spec's explicit Given/When/Then
  // over the compressed sketch where the two differ. The extra PBKDF2 cost
  // per login is already accepted by design §7's own note on
  // `auth-store.dek.test.ts`'s wall time.
  workingTable.users[login] = await wrapDekWithPassword(password, dek);
  writeDeviceDekTable(workingTable);

  // Step 6 — unchanged doctrine (entity-migration.ts:15-18): never blocks login.
  try {
    runEntityMigration();
  } catch {
    // intentionally swallowed — see comment above.
  }
}

/**
 * Re-wraps the CURRENT in-memory DEK under `newPassword` for `login`,
 * REPLACING (not adding to) that login's table entry. No-op (does nothing,
 * never throws) when there is no DEK in memory or no table yet — both mean
 * there is nothing to re-wrap.
 */
export async function rewrapDeviceDekForPassword(login: string, newPassword: string): Promise<void> {
  const dek = getDek();
  if (dek === null) return;
  const table = readDeviceDekTable();
  if (!table) return;
  table.users[login] = await wrapDekWithPassword(newPassword, dek);
  writeDeviceDekTable(table);
}
