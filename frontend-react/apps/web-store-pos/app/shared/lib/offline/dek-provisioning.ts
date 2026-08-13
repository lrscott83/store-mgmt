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
// literally as possible; the structural notes inline (plus the
// `ownWrapValidatedThisCall` gate documented at step 5, and step 3a's
// own-unwrap-failure fallback documented at that `catch`) mark the places
// this implementation had to make an explicit choice where §5's compressed
// pseudocode underspecified the outcome (see design §6's F5/F9 rows and the
// device-dek-wrap spec's own Given/When/Then scenarios, which this code
// follows where the two disagree in detail).
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

/**
 * This login response's wrap (design D1's source 3), or `undefined`. The
 * backend contract's rule 4 is the whole of the emptiness check: when the wrap
 * cannot be produced, `AuthDto` carries the three fields EMPTY rather than
 * failing the login, so `''` means "absent" and must never reach `unwrapDek`
 * as a malformed wrap to fail on.
 */
function findLoginResponseWrapEntry(args: {
  wrappedDek?: string;
  wrapSalt?: string;
  wrapIv?: string;
}): WrappedDekEntry | undefined {
  const { wrappedDek, wrapSalt, wrapIv } = args;
  if (wrappedDek && wrapSalt && wrapIv) {
    return { wrappedDek, wrapSalt, wrapIv };
  }
  return undefined;
}

const CONFLICT_LOG_MARKER = '[dek-provisioning] roster DEK disagrees with the established device DEK';

// SUGGESTION (verify-report, this batch): logging only, matching the D6
// precedent above — does NOT change the swallow's guarantee (step 6 must
// still never block login). Makes the WARNING fix's compound scenario
// diagnosable: if entity migration keeps failing here, that is visible in
// the console instead of silently vanishing.
const ENTITY_MIGRATION_SWALLOW_LOG_MARKER =
  '[dek-provisioning] entity migration failed after login (non-fatal, login proceeds)';

/**
 * Resolves and sets THIS DEVICE's DEK for `args.login`, in order:
 * an already-recovered device DEK > this login's own table wrap >
 * the roster's wrap for this login > the wrap this login's RESPONSE carried
 * (design D1's source 3, the three optional `wrap*` args). There is no
 * further source: the Q2 local mint that used to sit at the end of this list
 * was removed (design D2), because only the SERVER can re-derive a store's
 * key and anything written under a minted one is recoverable by nobody,
 * forever. Sources 3 and 4 agree by construction — the login response's wrap
 * and the roster's wrap both carry the key the server derived, wrapped by the
 * same `StoreKeyWrapService` — so their relative order changes which one
 * supplies the bytes, never which bytes.
 * Rejects with `DekUnwrapError` whenever none of those four sources
 * yields the key — the original F5 dead end (design §6: a table exists and
 * holds no recoverable wrap for this login, and neither the roster nor the
 * login response has one either), and the same for the bare-device case that
 * used to mint.
 */
export async function resolveDekForLogin(args: {
  login: string;
  password: string;
  sessionStoreId: string;
  /**
   * design D1 source 3 — the login response's wrap (`AuthModel`'s
   * `wrappedDek`/`wrapSalt`/`wrapIv`, from `AuthDto`). Named to match
   * `WrappedDekEntry` exactly, so they feed `unwrapDek` untranslated.
   * Optional, and empty strings count as absent (see
   * `findLoginResponseWrapEntry`): the OFFLINE login path has no online
   * response at all and passes none of them.
   */
  wrappedDek?: string;
  wrapSalt?: string;
  wrapIv?: string;
}): Promise<void> {
  const { login, password, sessionStoreId } = args;

  // Step 1 — may already set the DEK this page load (a working device-key
  // wrap recovers silently, with no password).
  await bootstrapDeviceDek();

  // Step 2.
  let dek = getDek();

  const table = readDeviceDekTable();
  const rosterEntry = findRosterWrapEntry(login);
  const loginResponseEntry = findLoginResponseWrapEntry(args);

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

  // Piece 1 (this batch — verify WARNING, "narrow the unconditional
  // password-wrap rewrite"): true only when `dek` below is derived by
  // successfully decrypting THIS LOGIN'S OWN existing table entry with
  // the password just used (the `own` branch a few lines down). That
  // successful `unwrapDek` call IS free proof the entry is still valid for
  // this password and this DEK — step 5 uses this flag to skip a
  // provably-redundant rewrite. See step 5's own comment for why every
  // other branch (roster-derivation, the common steady-state case where
  // step 1's device-key bootstrap alone recovers `dek`, and structural
  // note 1's offline roster-sourced case) is NOT touched: none
  // of them ever validates `table.users[login]` against the current
  // password, so the only sound check there costs exactly one PBKDF2 —
  // the same as just rewriting.
  let ownWrapValidatedThisCall = false;

  if (dek === null) {
    if (table) {
      // Step 3a — a table exists, but step 1's bootstrap did not recover a
      // DEK from `table.device` (missing, unusable, or corrupt).
      const own = table.users[login];
      if (own) {
        try {
          dek = await unwrapDek(password, own);
          setDek(dek, table.storeId);
          ownWrapValidatedThisCall = true;
        } catch {
          // Piece 2 (this batch — verify WARNING, compound-failure lockout):
          // this login's own table entry no longer matches this password.
          // Compounds two independently rare events — WU10's
          // `rewrapDeviceDekForPassword` silently failed during an earlier
          // password change (change-password.tsx's swallowed catch), so
          // this entry is still wrapped under the OLD password, AND the
          // device-key wrap didn't recover `dek` at step 1 either. Per the
          // spec ("Password wraps stay synchronized with the device DEK":
          // a login MUST succeed by recovering the DEK "from the device-key
          // wrap, OR FROM ANY OTHER STILL-VALID WRAP IN THE TABLE"), `dek`
          // stays `null` here and falls through to the roster attempt below
          // instead of propagating — this branch must NOT itself throw.
        }
      }
      if (dek === null) {
        if (rosterEntry) {
          dek = await unwrapDek(password, rosterEntry);
          setDek(dek, table.storeId);
          dekSourcedFromRosterThisCall = true;
        } else if (loginResponseEntry) {
          // Step 3c at the F5 site (design D1 source 3). Same lockout as the
          // no-table case below, one branch over: a device holding SOME
          // unrelated table — another user's wrap, or this login's own wrap
          // gone stale — and no roster is refused even though the login
          // response just handed over a valid, server-derived key. `setDek`
          // scopes it by `table.storeId`, exactly as the roster branch above
          // does at this same site, which keeps the table's own `storeId`
          // describing the scope the key is in use under (the invariant D3's
          // cross-store case exists to protect). `dekSourcedFromRosterThisCall`
          // stays false — this did NOT come from the roster — so step 4 would
          // still reconcile against a roster entry, though by construction
          // there is none here.
          dek = await unwrapDek(password, loginResponseEntry);
          setDek(dek, table.storeId);
        } else {
          // F5 — the genuine dead end: nothing in the table for this login
          // (absent, or present but no longer opens with this password),
          // nothing in the roster and nothing on the login response either.
          // Narrower than, and strictly better than, the uncaught
          // MissingDataKeyError this replaces.
          throw new DekUnwrapError();
        }
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
    } else if (loginResponseEntry) {
      // Step 3c (design D1 source 3) — the branch this whole task exists for:
      // a brand-new device, no roster ever imported, no device wrap, and an
      // ONLINE login whose response carried the store's key wrapped under this
      // user's password. Before it, D2's refusal below locked such a device out
      // of the app entirely — correctly refusing to invent a key, but with no
      // route to the real one.
      //
      // A login response carries no bundle, so `sessionStoreId` is the only
      // source for the store id — this is where the GAP 2 binding
      // (`user.selectedStoreId`, pinned by `auth-store.dek.test.ts` 11.5)
      // becomes load-bearing for an observable outcome again.
      //
      // A rejection here propagates, deliberately: the server wrapped this key
      // under the very password the login just succeeded with, so a wrap that
      // does not open is a real fault (parameter drift, a tampered response),
      // and there is no further source to fall through to anyway.
      dek = await unwrapDek(password, loginResponseEntry);
      setDek(dek, sessionStoreId);
      source = 'login-response';
      tableStoreId = sessionStoreId;
    } else {
      // design D2: no device table, no roster wrap, and nothing on the login
      // response — there is no way to obtain the key the SERVER derives for this
      // store. Minting a random local key here (the old behaviour) produced data
      // no roster and no online login could ever recover. Refusing destroys
      // nothing; minting destroyed silently.
      throw new DekUnwrapError();
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
          dekSource: source ?? 'roster',
          storeId: tableStoreId ?? getDekStoreId() ?? sessionStoreId,
          device: null,
          users: {},
        };
        workingTable.conflictDetectedAt = Date.now();
        workingTable.conflictStoreId = bundle?.storeId;
        console.error(CONFLICT_LOG_MARKER, { conflictStoreId: workingTable.conflictStoreId });

        // design D3: the server's key is the authority. Detecting the
        // disagreement and keeping the local key (the old behaviour) made
        // "import a fresh roster" a no-op on any device that had drifted — the
        // recovery route the business rules depend on did nothing at all.
        const adoptedStoreId = bundle?.storeId ?? sessionStoreId;
        dek = fromRoster;
        setDek(dek, adoptedStoreId);

        // D3's "and the device table is rewritten" is not only about the
        // wraps: the table's own `storeId`/`dekSource` say WHICH key it
        // holds, and after an adoption they described the ABANDONED one.
        // That splits the data whenever the two disagree across stores. This
        // session scopes its writes by `getDekStoreId()` (step 6's
        // `runEntityMigration`, and every store-scoped read after it), but
        // the next page load re-scopes the very same key by `table.storeId`
        // (`dek-bootstrap.ts`'s `setDek(dek, table.storeId)`) — so data
        // written before and after a reload would land in two different key
        // spaces. Nothing is destroyed, but it is split, in exactly the
        // cross-store case `conflictStoreId` exists to record.
        workingTable.storeId = adoptedStoreId;
        workingTable.dekSource = 'roster';
        workingTable.device = null; // re-wrapped for the adopted key at step 5
      }
    } catch {
      // F9 — stale roster wrap; we already hold the device DEK. Step 5
      // (structural note 2) refreshes this user's table entry below under
      // the password just used, rather than leaving it stale forever.
    }
  }

  // Step 5 — persist, best-effort, never fatal.
  //
  // The `?? 'local'` fallback below is now unreachable, and deliberately left
  // as the neutral default rather than promoted to a claim: `workingTable` is
  // null here only when `table` was, and with the mint gone every branch that
  // survives a null `table` sets `source` itself: `'roster'` in 3b and in
  // structural note 1, `'login-response'` in 3c. `'local'` also stays a legal `DeviceDekTable` value
  // because tables WRITTEN before design D2 carry it and must still READ.
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
  // Structural note 2 (narrowed this batch — verify WARNING, "narrow the
  // unconditional password-wrap rewrite"): (re)written in every branch
  // EXCEPT one, provably free case. §5's pseudocode sketch
  // (`if (!table.users[login])`, write only when absent) was already
  // rejected once (WU5's own note: tried literally, broke 5.7/F9 and
  // 11.4) — this is NOT that sketch. It is narrower and gated on TWO
  // things at once: (a) `ownWrapValidatedThisCall` — this call's `dek`
  // came from successfully decrypting THIS LOGIN'S OWN table entry, which
  // already proves it valid, for free; AND (b) `rosterEntry === undefined`
  // — no roster entry exists to reconcile against this call. (b) matters
  // because F9 (a roster wrap that fails to unwrap) and D6 (a roster DEK
  // that disagrees) both involve `own`-derived `dek` alongside a roster
  // entry, and the device-dek-wrap spec's "Out-of-band password change
  // recovers via the device DEK" scenario requires F9's stale entry to be
  // REGENERATED — so any call where a roster entry is in play keeps
  // rewriting unconditionally, same as before this batch.
  //
  // Every other branch — roster-derivation (3b), step 4's D3 adoption of a
  // disagreeing roster key, structural note 1's offline
  // roster-sourced case, and the common
  // steady-state case where step 1's device-key bootstrap alone already
  // recovered `dek` (this device is provisioned, the device key still
  // works) — also keeps rewriting unconditionally. That last case is the
  // dominant one in production (every ordinary login on a healthy,
  // provisioned device), and it was measured, not assumed: the only sound
  // way to check `table.users[login]`'s validity there is
  // `unwrapDek(password, own)`, which costs exactly one
  // `DEK_WRAP_ITERATIONS` PBKDF2 — the SAME cost as `wrapDekWithPassword`
  // below. A check that costs as much as the write it would save is not an
  // optimization, so that case is deliberately left as-is (see
  // apply-progress for the full writeup). The extra PBKDF2 cost per login
  // in those branches is already accepted by design §7's own note on
  // `auth-store.dek.test.ts`'s wall time.
  if (!(ownWrapValidatedThisCall && rosterEntry === undefined)) {
    workingTable.users[login] = await wrapDekWithPassword(password, dek);
  }
  writeDeviceDekTable(workingTable);

  // Step 6 — unchanged doctrine (entity-migration.ts:15-18): never blocks login.
  try {
    runEntityMigration();
  } catch (err) {
    // intentionally swallowed — see comment above; logged only, per the
    // SUGGESTION above `CONFLICT_LOG_MARKER`.
    console.error(ENTITY_MIGRATION_SWALLOW_LOG_MARKER, err);
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
