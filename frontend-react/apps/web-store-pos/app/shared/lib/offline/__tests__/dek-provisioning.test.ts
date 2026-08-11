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
import { getDek, clearDek } from '../../storage/data-key-store';
import { readDeviceDekTable, clearDeviceDekTable } from '../../storage/device-dek-table';
import { importRoster, clearRoster } from '../roster-store';
import { unwrapDek, wrapDekWithPassword } from '../dek-unwrap';
import type { OfflineRosterBundle } from '../roster-types';

const STORE_ID = 's1';

function v2Bundle(
  login: string,
  wrap: { wrappedDek: string; wrapSalt: string; wrapIv: string },
): OfflineRosterBundle {
  return {
    bundleId: 'b1',
    issuedAt: 1000,
    expiresAt: Date.now() + 1_000_000,
    formatVersion: 2,
    storeId: STORE_ID,
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
        selectedStoreId: STORE_ID,
        verifier: { hash: 'h', salt: 's', iterations: 210_000 },
        ...wrap,
      },
    ],
  };
}

describe('resolveDekForLogin (design §5, the login-path algorithm)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    clearRoster();
    clearDeviceDekTable();
  });

  it('5.1: no roster, no table -> mints a local DEK, dekSource "local", wraps it under this password (Q2)', async () => {
    await resolveDekForLogin({ login: 'ana', password: 'secret', sessionStoreId: STORE_ID });

    const dek = getDek();
    expect(dek).not.toBeNull();

    const table = readDeviceDekTable();
    expect(table?.dekSource).toBe('local');
    expect(table?.users['ana']).toBeDefined();

    const recovered = await unwrapDek('secret', table!.users['ana']);
    expect(Array.from(recovered)).toEqual(Array.from(dek!));
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

  it('5.5 (D6): device DEK X + a roster that unwraps to Y != X -> keeps X, records the conflict, does not throw', async () => {
    // Establish X first (the mint branch), which also writes this login's
    // own password wrap into the table.
    await resolveDekForLogin({ login: 'ana', password: 'secret', sessionStoreId: STORE_ID });
    const x = getDek()!;
    clearDek();

    // A disagreeing roster shows up, wrapped under the SAME (correct)
    // password, so it unwraps cleanly to different bytes.
    const rosterDek = new Uint8Array(32).fill(0x22);
    const wrap = await wrapDekWithPassword('secret', rosterDek);
    importRoster(v2Bundle('ana', wrap));

    await expect(
      resolveDekForLogin({ login: 'ana', password: 'secret', sessionStoreId: STORE_ID }),
    ).resolves.toBeUndefined();

    // Kept X, never adopted the roster's Y.
    expect(Array.from(getDek()!)).toEqual(Array.from(x));
    const table = readDeviceDekTable();
    expect(table?.conflictDetectedAt).toBeTypeOf('number');
    expect(table?.conflictStoreId).toBe(STORE_ID);
  });

  it('5.7 (F9): device DEK X + a roster wrap that fails to unwrap -> resolves, this login\'s table entry is refreshed', async () => {
    await resolveDekForLogin({ login: 'ana', password: 'secret', sessionStoreId: STORE_ID });
    const x = getDek()!;
    const firstWrapSalt = readDeviceDekTable()!.users['ana'].wrapSalt;
    clearDek();

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
    await resolveDekForLogin({ login: 'other-user', password: 'secret2', sessionStoreId: STORE_ID });
    clearDek();

    await expect(
      resolveDekForLogin({ login: 'ana', password: 'secret', sessionStoreId: STORE_ID }),
    ).rejects.toMatchObject({ name: 'DekUnwrapError' });
    expect(getDek()).toBeNull();
  });

  it('5.11: rewrapDeviceDekForPassword replaces (not adds) this login\'s table entry', async () => {
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
    await resolveDekForLogin({ login: 'ana', password: 'secret', sessionStoreId: STORE_ID });
    const dek1 = getDek()!;
    const firstWrapSalt = readDeviceDekTable()!.users['ana'].wrapSalt;
    clearDek();

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
    // First login under the OLD password establishes the device DEK and
    // this login's own table entry, wrapped under 'old-secret'.
    await resolveDekForLogin({ login: 'ana', password: 'old-secret', sessionStoreId: STORE_ID });
    const x = getDek()!;
    clearDek();

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
});
