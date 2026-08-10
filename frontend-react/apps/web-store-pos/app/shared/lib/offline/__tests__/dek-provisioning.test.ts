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

  // GAP 3 (batch-2 apply-progress, obs #2123): design §5's compressed
  // pseudocode step 5 shows `if (!table.users[login]) table.users[login] =
  // ...` (write only when absent). The previous batch implemented it
  // UNCONDITIONALLY, citing the device-dek-wrap spec's "Out-of-band
  // password change recovers via the device DEK" scenario (a fresh
  // password wrap MUST be regenerated for this user). This test isolates
  // the choice from that scenario entirely: NO roster is imported at any
  // point, so step 4's reconciliation/F9 branches never run and this
  // login's own table entry is never stale by any measure — the only
  // question is whether an ordinary repeated login (DEK cleared, e.g. by a
  // reload, then logged in again with the SAME, still-valid password)
  // rewrites an entry that was already perfectly recoverable. Under the
  // literal `if (!table.users[login])` pseudocode this would be a no-op
  // (same wrapSalt both times); the shipped behavior always rewrites.
  it('5.13: a repeated login with no roster involved and a non-stale entry still rewrites this login\'s table entry (step 5 is unconditional, not "if absent")', async () => {
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
    expect(table.users['ana'].wrapSalt).not.toBe(firstWrapSalt);
    const recovered = await unwrapDek('secret', table.users['ana']);
    expect(Array.from(recovered)).toEqual(Array.from(dek1));
  });
});
