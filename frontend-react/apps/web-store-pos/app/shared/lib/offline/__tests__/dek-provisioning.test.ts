// design §5 (device-dek-wrap / dek-lifecycle-and-unlock-gate) — the
// login-path resolver's six-step algorithm, exercised branch by branch.
// `storage/device-key-store` is mocked (design §7: "do NOT pull
// fake-indexeddb into this layer") so `getOrCreateDeviceKey` returns a REAL
// in-memory WebCrypto `CryptoKey` (no IndexedDB involved) and `getDeviceKey`
// always resolves `null` — the device-key-wrap recovery path is exercised
// instead through `dek-bootstrap.test.ts` (WU4), which owns that seam.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../storage/device-key-store', () => ({
  getOrCreateDeviceKey: vi.fn(async () =>
    crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']),
  ),
  getDeviceKey: vi.fn(async () => null),
}));

import { resolveDekForLogin, rewrapDeviceDekForPassword } from '../dek-provisioning';
import { getDek, getDekStoreId, clearDek } from '../../storage/data-key-store';
import {
  readDeviceDekTable,
  writeDeviceDekTable,
  clearDeviceDekTable,
} from '../../storage/device-dek-table';
import { wrapDekForDevice } from '../../storage/dek-bootstrap';
import { getOrCreateDeviceKey } from '../../storage/device-key-store';
import { importRoster, clearRoster } from '../roster-store';
import { unwrapDek, wrapDekWithPassword, DekUnwrapError } from '../dek-unwrap';
import type { OfflineRosterBundle } from '../roster-types';

const STORE_ID = 's1';

// Two deliberately different 32-byte keys, so "which key won?" is decidable
// by bytes alone in the D3 reconciliation test below.
const KEY_A = new Uint8Array(32).fill(0xaa);
const KEY_B = new Uint8Array(32).fill(0xbb);

function v2Bundle(
  login: string,
  wrap: { wrappedDek: string; wrapSalt: string; wrapIv: string },
  storeId: string = STORE_ID,
): OfflineRosterBundle {
  return {
    bundleId: 'b1',
    issuedAt: 1000,
    expiresAt: Date.now() + 1_000_000,
    formatVersion: 2,
    storeId,
    users: [
      {
        id: 'u1',
        login,
        fullName: 'Ana',
        isActive: true,
        roles: [],
        featureIds: [],
        storeModuleIds: [],
        isSuperAdmin: false,
        isOwnerAdmin: false,
        isReSeller: false,
        selectedStoreId: storeId,
        verifier: { hash: 'h', salt: 's', iterations: 210_000 },
        ...wrap,
      },
    ],
  };
}

/**
 * A device table that already holds `dek` as THIS login's own password wrap —
 * the shape a device carries after it minted locally under the pre-D2
 * behaviour (hence `dekSource: 'local'`, the union member this change stops
 * WRITING but must keep READING). A device wrap is added only when
 * `withDeviceWrap` is passed; see that option's own note below. With this
 * file's `getDeviceKey -> null` mock, step 1's bootstrap recovers nothing
 * either way, so step 3a's `own` branch is always the one that supplies `dek`.
 */
async function seedDeviceTableWithDek(
  dek: Uint8Array,
  login: string,
  password: string,
  storeId: string,
  opts: { withDeviceWrap?: boolean } = {},
): Promise<void> {
  // `withDeviceWrap` reproduces a device that also DEVICE-wrapped its key.
  // Off by default because most callers only need the password wrap, and a
  // seeded `device: null` would silently satisfy any assertion about the
  // device wrap being rewritten. `getDeviceKey` is mocked to `null` in this
  // file, so step 1's bootstrap still recovers nothing either way — the wrap
  // just sits there as stale material, exactly as it does on a drifted
  // device.
  const device = opts.withDeviceWrap
    ? await wrapDekForDevice(dek, (await getOrCreateDeviceKey())!)
    : null;
  writeDeviceDekTable({
    formatVersion: 1,
    dekSource: 'local',
    storeId,
    device,
    users: { [login]: await wrapDekWithPassword(password, dek) },
  });
}

/** A roster bundle whose wrap for `login` opens, under `password`, to `dek`. */
async function seedRosterWithDek(
  dek: Uint8Array,
  login: string,
  password: string,
  storeId: string = STORE_ID,
): Promise<void> {
  importRoster(v2Bundle(login, await wrapDekWithPassword(password, dek), storeId));
}

describe('resolveDekForLogin (design §5, the login-path algorithm)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    clearRoster();
    clearDeviceDekTable();
  });

  // REWRITTEN (design D2), same input, opposite expectation. This test used
  // to read "no roster, no table -> mints a local DEK, dekSource 'local',
  // wraps it under this password (Q2)" and asserted `getDek()` non-null with
  // `dekSource === 'local'`. Only the SERVER can re-derive a store's key
  // (HKDF over a master secret plus the store id); a key minted on the device
  // is recoverable by nobody, forever, and every byte written under it is
  // lost with it. The scenario is kept, not deleted, so the file keeps the
  // record that this exact input was considered and now has a different
  // answer.
  it('5.1: no roster, no table -> rejects DekUnwrapError and provisions nothing (design D2, was the Q2 mint)', async () => {
    await expect(
      resolveDekForLogin({ login: 'ana', password: 'secret', sessionStoreId: STORE_ID }),
    ).rejects.toMatchObject({ name: 'DekUnwrapError' });

    // No key in memory, and no half-provisioned table left behind for the
    // NEXT login to mistake for a working device.
    expect(getDek()).toBeNull();
    expect(readDeviceDekTable()).toBeNull();
  });

  it('5.3: roster wrap present, no table -> adopts the roster bytes as the device DEK, dekSource "roster"', async () => {
    const rosterDek = new Uint8Array(32).fill(0x11);
    const wrap = await wrapDekWithPassword('secret', rosterDek);
    importRoster(v2Bundle('ana', wrap));

    await resolveDekForLogin({ login: 'ana', password: 'secret', sessionStoreId: 'ignored-when-roster-decides' });

    expect(Array.from(getDek()!)).toEqual(Array.from(rosterDek));
    const table = readDeviceDekTable();
    expect(table?.dekSource).toBe('roster');
    expect(table?.storeId).toBe(STORE_ID);
  });

  // REWRITTEN (design D3), same D6 scenario, inverted outcome. This test used
  // to read "-> keeps X, records the conflict, does not throw" and asserted
  // `getDek()` still equalled X. Keeping X is exactly what D3 inverts: the
  // roster carries the key the SERVER derived and the local table does not,
  // so detecting the disagreement and then keeping the local key made
  // "import a fresh roster" a no-op on every device that had drifted — the
  // recovery route the business rules depend on did nothing at all. The
  // still-true half is kept verbatim: the conflict IS recorded, for
  // forensics, and the call still does not throw.
  it('5.5 (D6): device DEK X + a roster that unwraps to Y != X -> adopts Y, records the conflict, does not throw', async () => {
    // Establish X directly in the device table (this used to come from the
    // Q2 mint branch, removed by D2), which also gives this login its own
    // password wrap.
    const x = KEY_A;
    await seedDeviceTableWithDek(x, 'ana', 'secret', STORE_ID);

    // A disagreeing roster shows up, wrapped under the SAME (correct)
    // password, so it unwraps cleanly to different bytes.
    const rosterDek = new Uint8Array(32).fill(0x22);
    const wrap = await wrapDekWithPassword('secret', rosterDek);
    importRoster(v2Bundle('ana', wrap));

    await expect(
      resolveDekForLogin({ login: 'ana', password: 'secret', sessionStoreId: STORE_ID }),
    ).resolves.toBeUndefined();

    // Adopted the roster's Y, abandoned the local X.
    expect(Array.from(getDek()!)).toEqual(Array.from(rosterDek));
    expect(Array.from(getDek()!)).not.toEqual(Array.from(x));
    const table = readDeviceDekTable();
    expect(table?.conflictDetectedAt).toBeTypeOf('number');
    expect(table?.conflictStoreId).toBe(STORE_ID);
  });

  it('5.7 (F9): device DEK X + a roster wrap that fails to unwrap -> resolves, this login\'s table entry is refreshed', async () => {
    // SETUP RESEEDED (D2 removed the mint this used to borrow): X is written
    // straight into the device table instead of being minted by a first
    // `resolveDekForLogin` call. Every assertion below is untouched.
    const x = KEY_A;
    await seedDeviceTableWithDek(x, 'ana', 'secret', STORE_ID);
    const firstWrapSalt = readDeviceDekTable()!.users['ana'].wrapSalt;

    // Wrapped under a stale password (changed elsewhere) -> unwrapDek fails.
    const staleWrap = await wrapDekWithPassword('old-password', new Uint8Array(32).fill(0x33));
    importRoster(v2Bundle('ana', staleWrap));

    await expect(
      resolveDekForLogin({ login: 'ana', password: 'secret', sessionStoreId: STORE_ID }),
    ).resolves.toBeUndefined();

    expect(Array.from(getDek()!)).toEqual(Array.from(x));
    const table = readDeviceDekTable();
    expect(table?.conflictDetectedAt).toBeUndefined(); // F9 is not a conflict — the roster wrap simply failed
    expect(table?.users['ana'].wrapSalt).not.toBe(firstWrapSalt); // a fresh wrap was written
  });

  it('5.9 (F5): table with wraps but none for this login, no roster entry -> rejects DekUnwrapError, dead end', async () => {
    // SETUP RESEEDED (D2 removed the mint this used to borrow): the table
    // carrying a wrap for a DIFFERENT user is written directly, instead of
    // being created as a side effect of minting for 'other-user'. Every
    // assertion below is untouched — this still pins F5, the case where a
    // table EXISTS but holds nothing this login can open.
    await seedDeviceTableWithDek(KEY_A, 'other-user', 'secret2', STORE_ID);

    await expect(
      resolveDekForLogin({ login: 'ana', password: 'secret', sessionStoreId: STORE_ID }),
    ).rejects.toMatchObject({ name: 'DekUnwrapError' });
    expect(getDek()).toBeNull();
  });

  it('5.11: rewrapDeviceDekForPassword replaces (not adds) this login\'s table entry', async () => {
    // SETUP RESEEDED (D2 removed the mint this used to borrow). The real
    // `resolveDekForLogin` call is KEPT — `rewrapDeviceDekForPassword` reads
    // the in-memory DEK, so this test still needs the production resolver to
    // have put one there; it now recovers it from the seeded table (step 3a's
    // own branch) instead of minting it. Every assertion below is untouched.
    await seedDeviceTableWithDek(KEY_A, 'ana', 'secret', STORE_ID);
    await resolveDekForLogin({ login: 'ana', password: 'secret', sessionStoreId: STORE_ID });
    const dek = getDek()!;
    const before = readDeviceDekTable()!.users['ana'];

    await rewrapDeviceDekForPassword('ana', 'new-secret');

    const table = readDeviceDekTable()!;
    expect(Object.keys(table.users)).toEqual(['ana']); // replaced, not appended
    expect(table.users['ana'].wrapSalt).not.toBe(before.wrapSalt);
    const recovered = await unwrapDek('new-secret', table.users['ana']);
    expect(Array.from(recovered)).toEqual(Array.from(dek));
  });

  // GAP 3 REVISITED (this batch — device-wrapped-dek verify WARNING, "narrow
  // the unconditional password-wrap rewrite"). The previous batch (WU8.1,
  // apply-progress obs #2123) pinned step 5's write as unconditional in
  // EVERY branch, arguing design §5/§7's own prose justified it as a
  // general policy. Re-read against the delta spec
  // (specs/device-dek-wrap/spec.md:73-94, "Password wraps stay synchronized
  // with the device DEK"), mandatory regeneration is scoped to the
  // stale-wrap-recovery case (F9, 5.7) — not to an ordinary repeated login
  // whose own wrap is already, demonstrably, valid.
  //
  // This test's own scenario is exactly that demonstrable case: the SECOND
  // call's `dek` is derived by decrypting THIS LOGIN'S OWN existing table
  // entry with the SAME password (step 3a's "own" branch) — the successful
  // `unwrapDek` call there IS the proof the entry is still correct for this
  // password and this DEK, established at zero extra cost. Re-wrapping it
  // again would pay a SECOND, fully redundant 210,000-iteration PBKDF2
  // (`wrapDekWithPassword` costs exactly what the `unwrapDek` call that
  // produced `dek` already cost — see `dek-unwrap.ts`) to produce a
  // cryptographically equivalent entry under a fresh salt/iv. No roster is
  // imported here at all, which isolates "own wrap already valid" from
  // F9/D6 entirely — 5.7 (F9) and 5.5 (D6) both involve a roster entry for
  // this login and both still rewrite, unchanged by this batch (see
  // `dek-provisioning.ts` step 5's own comment for the exact condition).
  it('5.13: a repeated login whose own table entry is already valid, with no roster involved, SKIPS the redundant rewrite', async () => {
    // SETUP RESEEDED (D2 removed the mint this used to borrow): the already
    // valid entry is written straight into the table, which is what the first
    // `resolveDekForLogin` call existed to produce. Every assertion below is
    // untouched.
    const dek1 = KEY_A;
    await seedDeviceTableWithDek(dek1, 'ana', 'secret', STORE_ID);
    const firstWrapSalt = readDeviceDekTable()!.users['ana'].wrapSalt;

    // Precondition for the SECOND call: the table already holds a valid
    // entry for 'ana' under the SAME password used again — step 3a's "own"
    // branch will recover it directly, no roster, no staleness anywhere.
    expect(readDeviceDekTable()?.users['ana']).toBeDefined();

    await resolveDekForLogin({ login: 'ana', password: 'secret', sessionStoreId: STORE_ID });

    // Same DEK bytes recovered — not re-minted.
    expect(Array.from(getDek()!)).toEqual(Array.from(dek1));
    const table = readDeviceDekTable()!;
    // CHANGED this batch: was `.not.toBe(firstWrapSalt)` (pinning the old
    // unconditional rewrite). Now pins the narrowed behavior — the entry is
    // left byte-for-byte alone because it was already proven valid.
    expect(table.users['ana'].wrapSalt).toBe(firstWrapSalt);
    const recovered = await unwrapDek('secret', table.users['ana']);
    expect(Array.from(recovered)).toEqual(Array.from(dek1));
  });

  // 5.15 (verify-report WARNING, compound-failure lockout in step 3a). Two
  // independent rare events compounding, per the report's failure-mode
  // analysis: (a) WU10's `rewrapDeviceDekForPassword` silently failed
  // during a real password change, leaving THIS login's own table entry
  // wrapped under the OLD password; (b) the device key is unusable this
  // page load (this file's own `getDeviceKey -> null` mock already
  // guarantees step 1's `bootstrapDeviceDek()` never recovers `dek` here,
  // so step 3a's `own` branch is the first one actually reached). A roster
  // arrives carrying a FRESH wrap of the SAME device DEK under the NEW
  // (correct, current) password -- exactly "any other still-valid wrap in
  // the table" the spec names (specs/device-dek-wrap/spec.md:73-81,
  // "Password wraps stay synchronized with the device DEK").
  it('5.15: own table entry stale (rewrap silently failed) + device key unusable + a fresh roster wrap present -> falls through and recovers, self-healing the stale entry', async () => {
    // SETUP RESEEDED (D2 removed the mint this used to borrow): what the
    // first login under the OLD password used to produce — the device DEK and
    // this login's own table entry, wrapped under 'old-secret' — is written
    // directly. Every assertion below is untouched, including the two
    // preconditions that prove both halves of the compound scenario are
    // genuinely present.
    const x = KEY_A;
    await seedDeviceTableWithDek(x, 'ana', 'old-secret', STORE_ID);

    // (a) is already true here: nothing has re-wrapped 'ana''s table entry
    // since the first call, so it is still wrapped under 'old-secret'.
    // (b) is already true here, by this file's own module mock.
    const freshRosterWrap = await wrapDekWithPassword('new-secret', x);
    importRoster(v2Bundle('ana', freshRosterWrap));

    // PRECONDITION -- assert both halves of the compound scenario are
    // genuinely present BEFORE exercising recovery, so a pass below can't
    // be "never took the fallback branch at all" in disguise.
    const staleOwn = readDeviceDekTable()!.users['ana'];
    expect(staleOwn).toBeDefined();
    await expect(unwrapDek('new-secret', staleOwn)).rejects.toMatchObject({ name: 'DekUnwrapError' }); // genuinely stale under the new password
    const rosterCheck = await unwrapDek('new-secret', freshRosterWrap); // genuinely fresh and valid under the new password
    expect(Array.from(rosterCheck)).toEqual(Array.from(x));

    // Login with the OBJECTIVELY CORRECT new password must still succeed,
    // by falling through to the roster wrap instead of hard-failing on the
    // stale own entry.
    await expect(
      resolveDekForLogin({ login: 'ana', password: 'new-secret', sessionStoreId: STORE_ID }),
    ).resolves.toBeUndefined();

    expect(Array.from(getDek()!)).toEqual(Array.from(x));

    // Self-healing: this login's table entry is refreshed under the new
    // password, so the NEXT login recovers directly via the (now-valid)
    // own branch, without needing the roster again.
    const table = readDeviceDekTable()!;
    const healedOwn = table.users['ana'];
    expect(healedOwn.wrapSalt).not.toBe(staleOwn.wrapSalt);
    const recovered = await unwrapDek('new-secret', healedOwn);
    expect(Array.from(recovered)).toEqual(Array.from(x));
  });

  // D2 — the app never invents a key. The key the SERVER derives (HKDF over a
  // master secret plus the store id) is the only key anything can ever
  // re-derive; a locally minted one is recoverable by nobody, forever. A
  // device with no table, no roster wrap and no login-response wrap has no
  // route to those bytes, so it refuses instead of writing data under a key
  // that cannot be read back.
  it('D2: refuses to mint a key when nothing can supply the server key', async () => {
    localStorage.clear();

    await expect(
      resolveDekForLogin({ login: 'jdoe', password: 'pw', sessionStoreId: 's1' }),
    ).rejects.toThrow(DekUnwrapError);
  });

  // The refusal must also leave no trace: a persisted half-provisioned table
  // would make the NEXT login take a different (table-bearing) branch.
  it('D2: writes nothing to storage when it refuses', async () => {
    localStorage.clear();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    try {
      await expect(
        resolveDekForLogin({ login: 'jdoe', password: 'pw', sessionStoreId: 's1' }),
      ).rejects.toThrow();

      expect(setItem).not.toHaveBeenCalled();
    } finally {
      setItem.mockRestore();
    }
  });

  // D1 source 3 — the login response's wrap. The design's ordered resolution
  // is: device wrap > this login's own table entry > THE LOGIN RESPONSE'S WRAP
  // > the roster's wrap. Sources 3 and 4 both carry the key the SERVER
  // derived, so they agree by construction; what source 3 adds is the case no
  // other source can cover — a brand-new device that never imported a roster.
  // Before this, D2's refusal (5.1 above) locked that device out of the app
  // entirely, online or not.
  it('D1: no table, no roster, but the login response carries a wrap -> adopts exactly that key and creates the table', async () => {
    const serverDek = KEY_B;
    const loginWrap = await wrapDekWithPassword('secret', serverDek);

    // PRECONDITION — the device really has nothing else to fall back on, so a
    // pass below cannot be some other source quietly supplying the key.
    expect(readDeviceDekTable()).toBeNull();

    await resolveDekForLogin({
      login: 'ana',
      password: 'secret',
      sessionStoreId: STORE_ID,
      ...loginWrap,
    });

    // Exactly the bytes the login response carried — not a re-mint, not a
    // different key that merely happens to be 32 bytes long.
    expect(Array.from(getDek()!)).toEqual(Array.from(serverDek));
    // A login response carries no bundle to read a store id from, so the
    // session's own store id is the only source for it.
    expect(getDekStoreId()).toBe(STORE_ID);

    const table = readDeviceDekTable()!;
    expect(table.dekSource).toBe('login-response');
    expect(table.storeId).toBe(STORE_ID);
    // The invariant D3's cross-store test states: the scope the table restores
    // the key under on the next page load is the scope this session uses.
    expect(table.storeId).toBe(getDekStoreId());
    // Provisioned for next time: the device wrap makes the next page load
    // recover without a password, and this login's own wrap makes the next
    // login recover without a login response.
    expect(table.device).not.toBeNull();
    const recovered = await unwrapDek('secret', table.users['ana']);
    expect(Array.from(recovered)).toEqual(Array.from(serverDek));
  });

  // The SAME source, at the OTHER dead end (F5, pinned by 5.9 above): a table
  // exists but holds nothing this login can open, and there is no roster
  // entry either. Without this, a device carrying an unrelated user's wrap is
  // still refused even though the login response just handed over a valid
  // key — the same lockout D1 exists to close, one branch over.
  it('D1 (F5): table with wraps for another user only, no roster, login-response wrap -> adopts it and adds this login\'s entry', async () => {
    await seedDeviceTableWithDek(KEY_A, 'other-user', 'secret2', STORE_ID);
    const serverDek = KEY_B;
    const loginWrap = await wrapDekWithPassword('secret', serverDek);

    // PRECONDITION — this is genuinely the F5 shape 5.9 pins: a table with no
    // entry for 'ana', and no roster at all.
    expect(readDeviceDekTable()!.users['ana']).toBeUndefined();

    await resolveDekForLogin({
      login: 'ana',
      password: 'secret',
      sessionStoreId: STORE_ID,
      ...loginWrap,
    });

    expect(Array.from(getDek()!)).toEqual(Array.from(serverDek));

    const table = readDeviceDekTable()!;
    // The existing table is extended, not replaced: the other user's wrap
    // survives, and the table keeps describing its own store.
    expect(Object.keys(table.users).sort()).toEqual(['ana', 'other-user']);
    expect(table.storeId).toBe(STORE_ID);
    const recovered = await unwrapDek('secret', table.users['ana']);
    expect(Array.from(recovered)).toEqual(Array.from(serverDek));
  });

  // D1 PRIORITY — source 3 is consulted BEFORE source 4, and KEEPS its key
  // when the two disagree. Both wraps carry a server-derived key, so on a
  // healthy pair the order decides nothing; this test builds the only pair
  // that CAN disagree.
  //
  // Why that is the only one: `StoreDataKeyProvider.GetDek(storeId)` is
  // `HKDF(masterSecret, storeId)` — deterministic. Two server-derived wraps of
  // the SAME store are byte-identical, always. So a disagreement means the two
  // are scoped to DIFFERENT stores: the roster was exported for a store the
  // user no longer has selected. Not a stale copy of this key — there is no
  // such thing — but a different store's key entirely.
  //
  // Hence no reconciliation and no conflict marker. D3's "the roster is the
  // authority" was written for a DEVICE-LOCAL key vs the roster, where both
  // claim the same store and a disagreement is a genuine correctness bug. It
  // does not generalize here: adopting the roster's key would swap in the key
  // of a store this session is not for, and recording a "conflict" would fire
  // on every login of any user who has ever switched selected store and still
  // has the old roster lying around.
  it('D1 priority: a login-response wrap outranks a roster entry scoped to a DIFFERENT store, with no conflict recorded', async () => {
    const loginWrap = await wrapDekWithPassword('pw', KEY_B);
    await seedRosterWithDek(KEY_A, 'jdoe', 'pw', 'STORE-ROSTER');

    // PRECONDITION — the roster entry is genuinely VALID under this password,
    // so what decides here is the priority rule, not a failure to unwrap.
    const rosterCheck = await unwrapDek('pw', (await wrapDekWithPassword('pw', KEY_A)));
    expect(Array.from(rosterCheck)).toEqual(Array.from(KEY_A));

    await resolveDekForLogin({
      login: 'jdoe',
      password: 'pw',
      sessionStoreId: 'STORE-SESSION',
      ...loginWrap,
    });

    // The login response's key wins outright — it is the one derived for the
    // store this session is actually for.
    expect(Array.from(getDek()!)).toEqual(Array.from(KEY_B));
    expect(Array.from(getDek()!)).not.toEqual(Array.from(KEY_A));
    expect(getDekStoreId()).toBe('STORE-SESSION');

    const table = readDeviceDekTable()!;
    // The table describes the key it actually holds, so the next page load's
    // `bootstrapDeviceDek` re-scopes it to the same place this session used it.
    expect(table.storeId).toBe('STORE-SESSION');
    expect(table.storeId).toBe(getDekStoreId());
    expect(table.dekSource).toBe('login-response');
    // NOT a conflict: an old roster for another store is an ordinary state,
    // and marking it would make the marker meaningless.
    expect(table.conflictDetectedAt).toBeUndefined();
    expect(table.conflictStoreId).toBeUndefined();
    // The wrap written for next time opens to the key that won, not the one
    // that lost.
    const recovered = await unwrapDek('pw', table.users['jdoe']);
    expect(Array.from(recovered)).toEqual(Array.from(KEY_B));
  });

  // The same ordering, in the case where it changes what the USER sees. This
  // is concern 1's real-world shape: the roster export is stale (wrapped under
  // a password since changed), the login response is live and correct.
  //
  // Under the pre-fix order this login FAILED — step 3b's `unwrapDek` on the
  // stale roster wrap propagates unhandled (the behaviour `auth-store.dek.test.ts`
  // 11.4 pins for a device with no login-response wrap, which stays true).
  // Under D1's order the live wrap supplies the key, and step 4's attempt on
  // the stale roster entry lands in the existing F9 `catch`, so the login
  // proceeds. This is the one place where the login response's key is also the
  // FINAL key — the roster has none to adopt.
  it('D1 priority: a STALE roster entry no longer refuses a login the response can serve', async () => {
    const loginWrap = await wrapDekWithPassword('new-secret', KEY_B);
    await seedRosterWithDek(KEY_A, 'jdoe', 'old-secret', STORE_ID);

    await expect(
      resolveDekForLogin({
        login: 'jdoe',
        password: 'new-secret',
        sessionStoreId: STORE_ID,
        ...loginWrap,
      }),
    ).resolves.toBeUndefined();

    expect(Array.from(getDek()!)).toEqual(Array.from(KEY_B));
    const table = readDeviceDekTable()!;
    // F9, not a conflict: the roster wrap failed to open, so there was never a
    // key to compare against.
    expect(table.conflictDetectedAt).toBeUndefined();
    expect(table.dekSource).toBe('login-response');
    const recovered = await unwrapDek('new-secret', table.users['jdoe']);
    expect(Array.from(recovered)).toEqual(Array.from(KEY_B));
  });

  // A login-response wrap that EXISTS but does not open must not hard-fail a
  // login while a valid roster entry is sitting right there — the same rule,
  // and the same `try`/`catch` shape, that step 3a's `own` branch already
  // applies to a stale table entry. A malformed wrap is a server-side hiccup
  // (or a timing edge before the `OfflinePasswordPreHash` backfill lands), not
  // a verdict on the roster. Non-empty, so it is "present" per rule 4 and
  // genuinely reaches `unwrapDek`, unlike the empty-string case above.
  const CORRUPT_LOGIN_WRAP = {
    wrappedDek: 'not-valid-base64!!!',
    wrapSalt: 'also-not-valid!!!',
    wrapIv: 'nor-this!!!',
  };

  it('D1: a CORRUPT login-response wrap falls through to a valid roster entry (no table)', async () => {
    await seedRosterWithDek(KEY_A, 'jdoe', 'pw', STORE_ID);

    // PRECONDITION — the wrap really is unusable, so the fall-through is what
    // is being exercised and not a wrap that quietly worked.
    await expect(unwrapDek('pw', CORRUPT_LOGIN_WRAP)).rejects.toMatchObject({
      name: 'DekUnwrapError',
    });

    await expect(
      resolveDekForLogin({
        login: 'jdoe',
        password: 'pw',
        sessionStoreId: STORE_ID,
        ...CORRUPT_LOGIN_WRAP,
      }),
    ).resolves.toBeUndefined();

    expect(Array.from(getDek()!)).toEqual(Array.from(KEY_A));
    const table = readDeviceDekTable()!;
    expect(table.dekSource).toBe('roster');
    expect(table.storeId).toBe(STORE_ID);
  });

  it('D1 (F5): a CORRUPT login-response wrap falls through to a valid roster entry (table exists)', async () => {
    // The F5 shape: a table with no entry this login can open...
    await seedDeviceTableWithDek(KEY_B, 'other-user', 'secret2', STORE_ID);
    // ...and a roster that can serve it.
    await seedRosterWithDek(KEY_A, 'jdoe', 'pw', STORE_ID);

    await expect(
      resolveDekForLogin({
        login: 'jdoe',
        password: 'pw',
        sessionStoreId: STORE_ID,
        ...CORRUPT_LOGIN_WRAP,
      }),
    ).resolves.toBeUndefined();

    expect(Array.from(getDek()!)).toEqual(Array.from(KEY_A));
    const table = readDeviceDekTable()!;
    expect(Object.keys(table.users).sort()).toEqual(['jdoe', 'other-user']);
    const recovered = await unwrapDek('pw', table.users['jdoe']);
    expect(Array.from(recovered)).toEqual(Array.from(KEY_A));
  });

  // Backend contract rule 4: when the wrap cannot be produced, the login
  // succeeds with the three fields EMPTY rather than failing. Empty means
  // "absent" — never a malformed wrap to feed to `unwrapDek` and fail on, and
  // never a reason to stop refusing.
  it('D1: empty login-response wrap fields mean "absent" -> still refuses, exactly as with no fields at all', async () => {
    await expect(
      resolveDekForLogin({
        login: 'ana',
        password: 'secret',
        sessionStoreId: STORE_ID,
        wrappedDek: '',
        wrapSalt: '',
        wrapIv: '',
      }),
    ).rejects.toMatchObject({ name: 'DekUnwrapError' });

    expect(getDek()).toBeNull();
    expect(readDeviceDekTable()).toBeNull();
  });

  // D3 — the server's key wins. Before this change, step 4 detected the
  // disagreement and only wrote a `console.error`, which made "import a fresh
  // roster" a no-op on any device that had drifted: the recovery route the
  // business rules depend on did nothing at all.
  it('D3: adopts the roster key over a disagreeing local key, instead of only logging', async () => {
    // Arrange: a device table holding key A, and a roster wrap holding key B.
    await seedDeviceTableWithDek(KEY_A, 'jdoe', 'pw', 's1');
    await seedRosterWithDek(KEY_B, 'jdoe', 'pw');

    await resolveDekForLogin({ login: 'jdoe', password: 'pw', sessionStoreId: 's1' });

    // The server's key is the authority — the roster carries it, the local
    // table does not.
    expect(getDek()).toEqual(KEY_B);
    expect(readDeviceDekTable()?.conflictDetectedAt).toBeDefined();
  });

  // The adoption is not just in-memory: the device wrap and this login's own
  // password wrap must both be re-written under the ADOPTED key, or the next
  // login (or the next page load's device-key bootstrap) would silently
  // resurrect the abandoned local key.
  it('D3: re-wraps the device copy and this login\'s password wrap under the adopted key', async () => {
    // The device must ALREADY hold a device wrap of the abandoned key. With
    // `device: null` seeded instead, step 5 rewraps unconditionally and this
    // test would pass even if the adoption forgot to invalidate the stale
    // wrap — verified by mutation: commenting out `workingTable.device = null`
    // failed nothing until this arrangement was used.
    await seedDeviceTableWithDek(KEY_A, 'jdoe', 'pw', 's1', { withDeviceWrap: true });
    const staleDeviceWrap = readDeviceDekTable()!.device;
    expect(staleDeviceWrap).not.toBeNull(); // precondition, not an outcome

    await seedRosterWithDek(KEY_B, 'jdoe', 'pw');

    await resolveDekForLogin({ login: 'jdoe', password: 'pw', sessionStoreId: 's1' });

    const table = readDeviceDekTable()!;
    // The device wrap of the ABANDONED key must not survive the adoption, or
    // the next page load's device-key bootstrap resurrects it and D3 is a
    // no-op in exactly the scenario it exists for.
    expect(table.device).not.toBeNull();
    expect(table.device!.wrappedDek).not.toBe(staleDeviceWrap!.wrappedDek);

    const recovered = await unwrapDek('pw', table.users['jdoe']);
    expect(Array.from(recovered)).toEqual(Array.from(KEY_B));
  });

  // D3, CROSS-STORE. Every other D3 test above puts the device table and the
  // roster bundle on the SAME store id, which is why none of them could catch
  // this: design D3 says the server's key is adopted "and the device table is
  // rewritten", and rewriting the table means more than replacing the wraps —
  // the table's own `storeId` and `dekSource` describe WHICH key it holds.
  //
  // Leaving them describing the abandoned key splits the data in two. Within
  // the adopting session, step 6's `runEntityMigration()` scopes by
  // `getDekStoreId()`, so writes land under the NEW store's keys. On the next
  // page load `bootstrapDeviceDek()` does `setDek(dek, table.storeId)` — the
  // same adopted key, re-scoped to the OLD store id — so every store-scoped
  // read and write then addresses a different key space than before the
  // reload. Nothing is destroyed; it is split, in exactly the cross-store
  // conflict case `conflictStoreId` exists to record.
  it('D3: adopting a key from a DIFFERENT store rewrites the table to describe the adopted key', async () => {
    await seedDeviceTableWithDek(KEY_A, 'jdoe', 'pw', 'STORE-OLD');
    await seedRosterWithDek(KEY_B, 'jdoe', 'pw', 'STORE-NEW');

    await resolveDekForLogin({ login: 'jdoe', password: 'pw', sessionStoreId: 'STORE-OLD' });

    expect(getDek()).toEqual(KEY_B);
    expect(getDekStoreId()).toBe('STORE-NEW');

    const table = readDeviceDekTable()!;
    expect(table.storeId).toBe('STORE-NEW');
    expect(table.dekSource).toBe('roster');

    // The invariant the split violates, stated directly: the scope the table
    // will restore the key under on the next page load must be the scope this
    // session is already using it under.
    expect(table.storeId).toBe(getDekStoreId());

    // Forensics survive the rewrite — D3 adopts, it does not erase the record
    // that the two disagreed.
    expect(table.conflictDetectedAt).toBeTypeOf('number');
    expect(table.conflictStoreId).toBe('STORE-NEW');
  });
});
