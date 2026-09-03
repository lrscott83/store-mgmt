import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth-store';
import { StorageKeys } from '../../storage/storage-keys';
import { importRoster, isRosterProvisioned } from '../../offline/roster-store';
import { sha256Base64, pbkdf2Base64 } from '../../offline/offline-crypto';
import { getDek, getDekStoreId, clearDek } from '../../storage/data-key-store';
import { readDeviceDekTable, writeDeviceDekTable } from '../../storage/device-dek-table';
import { unwrapDek, wrapDekWithPassword } from '../../offline/dek-unwrap';
import type { OfflineRosterBundle } from '../../offline/roster-types';

const FIXED_SALT = 'AAAAAAAAAAAAAAAAAAAAAA==';
const ITERATIONS = 210_000;

async function seedRoster(expiresInMs: number = 1_000_000): Promise<void> {
  const preHash = await sha256Base64('secret');
  const hash = await pbkdf2Base64(preHash, FIXED_SALT, ITERATIONS);
  const bundle: OfflineRosterBundle = {
    bundleId: 'b1',
    issuedAt: 1000,
    expiresAt: Date.now() + expiresInMs,
    formatVersion: 1,
    storeId: 's1',
    users: [
      {
        id: 'u1',
        login: 'ana',
        fullName: 'Ana Pérez',
        isActive: true,
        roles: [],
        featureIds: [1],
        storeModuleIds: [],
        isSuperAdmin: false,
        isOwnerAdmin: false,
        isReSeller: false,
        selectedStoreId: 's1',
        verifier: { hash, salt: FIXED_SALT, iterations: ITERATIONS },
      },
    ],
  };
  importRoster(bundle);
}

// WU14 (regression coverage, not new behavior): a v2 roster twin of
// seedRoster() above, with the wrap fields populated — proves the
// store-level `loginOffline` hydration seam (setUser) does not care about
// formatVersion.
async function seedV2Roster(): Promise<void> {
  const preHash = await sha256Base64('secret');
  const hash = await pbkdf2Base64(preHash, FIXED_SALT, ITERATIONS);
  const bundle: OfflineRosterBundle = {
    bundleId: 'b1',
    issuedAt: 1000,
    expiresAt: Date.now() + 1_000_000,
    formatVersion: 2,
    storeId: 's1',
    users: [
      {
        id: 'u1',
        login: 'ana',
        fullName: 'Ana Pérez',
        isActive: true,
        roles: [],
        featureIds: [1],
        storeModuleIds: [],
        isSuperAdmin: false,
        isOwnerAdmin: false,
        isReSeller: false,
        selectedStoreId: 's1',
        verifier: { hash, salt: FIXED_SALT, iterations: ITERATIONS },
        // Deliberately absent wrappedDek/wrapSalt/wrapIv: this test asserts
        // the plain hydration seam, not DEK unwrap (already covered by
        // offline-auth-service.test.ts's dedicated v2 describe block).
      },
    ],
  };
  importRoster(bundle);
}

// design D2 removed the Q2 mint, so a device with no wrap material for this
// login can no longer sign in at all — including offline, against a v1
// roster. Several tests below are about the hydration seam or about logout,
// not about keys, and they used to get a key for free from the mint. This
// gives them the provisioned device they now need: a device table holding
// THIS login's password wrap, which is exactly the state a real device is
// left in by any earlier successful login. It is a faithful precondition,
// not a bypass — step 3a's own branch recovers the key from it.
const PROVISIONED_DEK = new Uint8Array(32).fill(0x55);

async function seedProvisionedDevice(
  login: string,
  password: string,
  storeId: string,
): Promise<void> {
  writeDeviceDekTable({
    formatVersion: 1,
    dekSource: 'local',
    storeId,
    device: null,
    users: { [login]: await wrapDekWithPassword(password, PROVISIONED_DEK) },
  });
}

// device-wrapped-dek batch-2 gap closure (GAP 1 + GAP 2): a v2 roster twin
// carrying an actual DEK wrap for 'ana', with the bundle's OWN storeId
// deliberately DIFFERENT from the user's `selectedStoreId` — this is what
// lets the GAP 2 assertion below distinguish "table.storeId came from the
// roster bundle" (via `getDekStoreId()`, set by `authenticateOffline`) from
// "table.storeId came from `sessionStoreId`" (the `resolveDekForLogin`
// argument, `user.selectedStoreId`), which would silently agree if both
// fixtures used the same id.
const V2_WRAP_ROSTER_STORE_ID = 'roster-store-id';
const V2_WRAP_SESSION_STORE_ID = 'session-store-id';

async function seedV2RosterWithWrap(): Promise<{ rosterDek: Uint8Array }> {
  const preHash = await sha256Base64('secret');
  const hash = await pbkdf2Base64(preHash, FIXED_SALT, ITERATIONS);
  const rosterDek = new Uint8Array(32).fill(0x44);
  const wrap = await wrapDekWithPassword('secret', rosterDek);
  const bundle: OfflineRosterBundle = {
    bundleId: 'b1',
    issuedAt: 1000,
    expiresAt: Date.now() + 1_000_000,
    formatVersion: 2,
    storeId: V2_WRAP_ROSTER_STORE_ID,
    users: [
      {
        id: 'u1',
        login: 'ana',
        fullName: 'Ana Pérez',
        isActive: true,
        roles: [],
        featureIds: [1],
        storeModuleIds: [],
        isSuperAdmin: false,
        isOwnerAdmin: false,
        isReSeller: false,
        selectedStoreId: V2_WRAP_SESSION_STORE_ID,
        verifier: { hash, salt: FIXED_SALT, iterations: ITERATIONS },
        ...wrap,
      },
    ],
  };
  importRoster(bundle);
  return { rosterDek };
}

// auth-session spec: "loginOffline hydrates through the existing setUser seam"
describe('useAuthStore.loginOffline (D6)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false, error: null });
  });

  it('hydrates through setUser exactly like an online login', async () => {
    await seedRoster();
    // SETUP RESEEDED (D2 removed the mint this used to borrow). Assertions
    // below untouched — this test is about the hydration seam, not the key.
    await seedProvisionedDevice('ana', 'secret', 's1');

    const user = await useAuthStore.getState().loginOffline('ana', 'secret');

    expect(user.id).toBe('u1');
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.id).toBe('u1');

    // Same storage keys an online login would write.
    expect(localStorage.getItem(StorageKeys.TOKEN)).toBe('offline-session');
    expect(localStorage.getItem(StorageKeys.CURRENT_USER)).not.toBeNull();
    expect(localStorage.getItem(StorageKeys.AUTH_MODEL)).not.toBeNull();
  });

  it('rejects and resets isLoading on a wrong password, without hydrating', async () => {
    await seedRoster();

    await expect(useAuthStore.getState().loginOffline('ana', 'wrong')).rejects.toThrow();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  it('hydrates through setUser exactly like a v1 login (WU14 regression coverage: v2 roster, no wrap fields present)', async () => {
    await seedV2Roster();
    // SETUP RESEEDED (D2 removed the mint this used to borrow). Assertions
    // below untouched — this still pins that the hydration seam does not care
    // about the roster's formatVersion.
    await seedProvisionedDevice('ana', 'secret', 's1');

    const user = await useAuthStore.getState().loginOffline('ana', 'secret');

    expect(user.id).toBe('u1');
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.id).toBe('u1');
  });
});

// auth-session spec (MODIFIED requirement "Logout Storage-Clear Scope"):
// "Offline idle-lock logout preserves the roster" — verify-report WARNING #1
// flagged this as true only by static inspection (no test combined a REAL
// provisioned roster with a REAL, non-mocked `logout()` call). This suite
// closes that gap: nothing here is mocked — `importRoster`/`loginOffline`/
// `logout`/`isRosterProvisioned` are all the real production functions.
describe('useAuthStore.logout() — preserves the offline roster (auth-session MODIFIED)', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false, error: null });
  });

  it('keeps isRosterProvisioned() true after a real logout() call following a real offline login', async () => {
    await seedRoster();
    // SETUP RESEEDED (D2 removed the mint this used to borrow). Assertions
    // below untouched — this test is about what logout() does and does not
    // erase, and it still drives a REAL offline login to get there.
    await seedProvisionedDevice('ana', 'secret', 's1');
    await useAuthStore.getState().loginOffline('ana', 'secret');
    expect(isRosterProvisioned()).toBe(true);

    // This is the exact call the idle-lock timer makes
    // (app-layout.tsx: `useAuthStore.getState().logout()`), invoked here
    // directly against the REAL store action, not a `vi.fn()` stand-in.
    useAuthStore.getState().logout();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(isRosterProvisioned()).toBe(true);
  });
});

// device-wrapped-dek design §5/§7: DEK provisioning for the offline path
// lives HERE, never in `offline-auth-service.test.ts` (D4's whole
// purpose — `authenticateOffline` stays untouched, its own
// `getDek()===null` assertion for a v1 roster survives unmodified).
describe('useAuthStore.loginOffline — DEK provisioning (device-wrapped-dek design §5)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false, error: null });
  });

  // REWRITTEN (design D2), same input, opposite expectation. This test used
  // to read "-> getDek() is non-null (offline twin of 11.3, Q2 mint)" and
  // asserted exactly that. A v1 roster carries no wrap fields, so it cannot
  // supply the key the SERVER derived; on a device with nothing else, the
  // mint was the only thing that made this login succeed, and everything
  // written afterwards was unreadable by anyone forever. The offline twin of
  // 11.3 now refuses, same as the online path.
  //
  // This is the sharpest edge of design D2's accepted trade-off: a v1 roster
  // alone is no longer enough to sign in offline on an unprovisioned device.
  it('loginOffline() on a v1 roster (no wrap fields), unprovisioned device -> rejects DekUnwrapError (design D2, was the Q2 mint)', async () => {
    await seedRoster();

    await expect(
      useAuthStore.getState().loginOffline('ana', 'secret'),
    ).rejects.toMatchObject({ name: 'DekUnwrapError' });

    expect(getDek()).toBeNull();
    expect(readDeviceDekTable()).toBeNull();
    // The refusal is not a half-login: nothing hydrated.
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  // The same v1 roster on a device that IS provisioned still signs in — the
  // pairing that shows the refusal above is about the missing key material,
  // not about v1 rosters being rejected wholesale. `seedProvisionedDevice`
  // writes `device: null`, so recovery here is step 3a's PASSWORD wrap, not
  // the device-key wrap.
  it('loginOffline() on a v1 roster, provisioned device -> recovers the key from this login\'s password wrap and signs in', async () => {
    await seedRoster();
    await seedProvisionedDevice('ana', 'secret', 's1');

    await useAuthStore.getState().loginOffline('ana', 'secret');

    expect(getDek()).not.toBeNull();
    expect(Array.from(getDek()!)).toEqual(Array.from(PROVISIONED_DEK));
  });

  // GAP 1 (batch-2 apply-progress, obs #2123): the ONE branch WU7's own
  // 7.3 test never reaches, because 7.3 deliberately uses a v1 roster (no
  // wrap fields), which never sets a DEK inside `authenticateOffline`. Here
  // the roster IS v2 with a wrap for 'ana', so `authenticateOffline`
  // (offline-auth-service.ts:127-133, UNTOUCHED) unwraps and calls
  // `setDek()` itself, BEFORE `resolveDekForLogin` ever runs — the exact
  // precondition `dek-provisioning.ts`'s "structural note 1" describes
  // (DEK already non-null on entry, no local table yet).
  it('loginOffline() on a v2 roster WITH a wrap for this login, no local table yet -> the already-set DEK is recorded as roster-sourced (dek-provisioning.ts structural note 1)', async () => {
    const { rosterDek } = await seedV2RosterWithWrap();

    // Precondition, asserted before acting: nothing has run yet on this
    // device — no local wrap table, no DEK in memory. Without pinning this
    // first, a pass below cannot be told apart from "never reached the
    // branch at all".
    expect(readDeviceDekTable()).toBeNull();
    expect(getDek()).toBeNull();

    await useAuthStore.getState().loginOffline('ana', 'secret');

    // Effect 1: the DEK in memory is EXACTLY the roster's bytes.
    // `authenticateOffline` already unwrapped them before
    // `resolveDekForLogin` ran; the branch under test must not overwrite
    // them with an unrelated, freshly-minted local DEK.
    expect(getDek()).not.toBeNull();
    expect(Array.from(getDek()!)).toEqual(Array.from(rosterDek));

    // Effect 2: a local wrap table now exists and correctly labels the
    // source as the roster, using the roster bundle's OWN storeId — read
    // back via `getDekStoreId()`, exactly as `authenticateOffline` set it —
    // and NOT `sessionStoreId` (the login call's `user.selectedStoreId`
    // argument), which the fixture deliberately set to a different value.
    const table = readDeviceDekTable();
    expect(table).not.toBeNull();
    expect(table?.dekSource).toBe('roster');
    expect(table?.storeId).toBe(V2_WRAP_ROSTER_STORE_ID);

    // Effect 3: this login's own password wrap was written (design §5 step
    // 5) and recovers the exact same DEK bytes.
    expect(table?.users['ana']).toBeDefined();
    const recovered = await unwrapDek('secret', table!.users['ana']);
    expect(Array.from(recovered)).toEqual(Array.from(rosterDek));
  });

  // GAP 2 (batch-2 apply-progress, obs #2123), OFFLINE call site
  // (`auth-store.ts:327`, the twin of `auth-store.dek.test.ts`'s 11.5).
  // `sessionStoreId` is bound to `user.selectedStoreId` (the repo's existing
  // "current store" convention — `user-home.ts:24`,
  // `authorization-service.ts:35`), never specified explicitly by
  // design/tasks. Still a live contract, still pinned.
  //
  // SPLIT from the old test, which asserted three things at once:
  //   - `table?.dekSource === 'local'` — DROPPED. It pinned the removed Q2
  //     mint branch and nothing writes `'local'` any more.
  //   - `getDekStoreId()` / `table?.storeId` === `user.selectedStoreId` —
  //     these were how the binding was INFERRED, via the mint's
  //     `setDek(dek, sessionStoreId)`. With the mint gone, `sessionStoreId`
  //     reaches no observable outcome at all (every surviving use sits behind
  //     a `??` whose left side is always defined). Verified by mutation:
  //     replacing the parameter with a sentinel fails no test in the suite.
  //   - the binding itself — KEPT, and now asserted directly on the argument,
  //     which is where the contract lives and where it stays observable when
  //     Task 7's login-response source makes the parameter load-bearing
  //     again. The real resolver still runs underneath (the mock delegates).
  it('loginOffline() passes sessionStoreId = user.selectedStoreId to resolveDekForLogin (GAP 2 binding)', async () => {
    const preHash = await sha256Base64('secret');
    const hash = await pbkdf2Base64(preHash, FIXED_SALT, ITERATIONS);
    const bundle: OfflineRosterBundle = {
      bundleId: 'b1',
      issuedAt: 1000,
      expiresAt: Date.now() + 1_000_000,
      formatVersion: 1,
      storeId: 'roster-bundle-id',
      users: [
        {
          id: 'u2',
          login: 'beto',
          fullName: 'Beto Gómez',
          isActive: true,
          roles: [],
          featureIds: [1],
          storeModuleIds: [],
          isSuperAdmin: false,
          isOwnerAdmin: false,
          isReSeller: false,
          selectedStoreId: 'beto-session-id',
          verifier: { hash, salt: FIXED_SALT, iterations: ITERATIONS },
        },
      ],
    };
    importRoster(bundle);
    // 'beto' has no roster wrap (v1 bundle), so D2 refuses unless the device
    // is provisioned for him. The seed's storeId is deliberately a THIRD
    // value, distinct from both the bundle's and the session's, so nothing
    // below can agree by coincidence.
    await seedProvisionedDevice('beto', 'secret', 'device-table-id');

    const seen: Array<{ login: string; password: string; sessionStoreId: string }> = [];
    vi.doMock('../../offline/dek-provisioning', async () => {
      const actual =
        await vi.importActual<typeof import('../../offline/dek-provisioning')>(
          '../../offline/dek-provisioning',
        );
      return {
        ...actual,
        resolveDekForLogin: (args: { login: string; password: string; sessionStoreId: string }) => {
          seen.push(args);
          return actual.resolveDekForLogin(args);
        },
      };
    });

    try {
      await useAuthStore.getState().loginOffline('beto', 'secret');

      // The binding under test: the argument is the user's selectedStoreId,
      // not the roster bundle's storeId and not the device table's.
      expect(seen).toHaveLength(1);
      expect(seen[0].sessionStoreId).toBe('beto-session-id');
      expect(seen[0].sessionStoreId).not.toBe('roster-bundle-id');
      expect(seen[0].login).toBe('beto');

      // The delegated real resolver ran, so the binding was observed on a
      // live call rather than on a stub that replaced it.
      expect(getDek()).not.toBeNull();
      // Where the store id actually comes from now: the device table that
      // supplied the key. Recorded so the divergence from this test's own
      // history is explicit rather than surprising.
      expect(getDekStoreId()).toBe('device-table-id');
      expect(readDeviceDekTable()?.storeId).toBe('device-table-id');
    } finally {
      vi.doUnmock('../../offline/dek-provisioning');
    }
  });
});

// offline-session-expiry rule: the OFFLINE session must expire at the SAME
// instant as the roster bundle that authenticated it — whatever value the
// backend gave the bundle (paid: next due date + 5d; free: configured TTL) —
// never at the legacy hardcoded now+35d stamp setUser used to apply.
// `loginOffline` now passes `getRoster().expiresAt` through the optional
// `setUser` parameter.
describe('useAuthStore.loginOffline — session expiry = roster bundle expiresAt (offline-session-expiry rule)', () => {
  const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
  const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

  beforeEach(() => {
    localStorage.clear();
    clearDek();
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false, error: null });
  });

  async function expectExpiryFollowsRoster(rosterExpiresInMs: number): Promise<void> {
    const expiresAt = Date.now() + rosterExpiresInMs;
    await seedRoster(rosterExpiresInMs);
    await seedProvisionedDevice('ana', 'secret', 's1');

    await useAuthStore.getState().loginOffline('ana', 'secret');

    const auth = JSON.parse(localStorage.getItem(StorageKeys.AUTH_MODEL)!) as {
      authToken?: string;
      expiresIn?: number;
    };
    expect(auth.authToken).toBe('offline-session');
    // The stamped value is the roster's ABSOLUTE expiresAt — not now+35d, and
    // not capped at 35 days when the bundle horizon is longer.
    expect(auth.expiresIn).toBeGreaterThanOrEqual(expiresAt - 2_000);
    expect(auth.expiresIn).toBeLessThanOrEqual(expiresAt + 2_000);
    expect(useAuthStore.getState().user?.expiresIn).toBe(auth.expiresIn);
  }

  it('paid-like bundle (expiresAt = +5 days) → session expires at +5 days, not the legacy +35', async () => {
    await expectExpiryFollowsRoster(FIVE_DAYS_MS);
  });

  it('bundle with a horizon beyond the legacy default (+60 days) → session keeps the roster horizon', async () => {
    await expectExpiryFollowsRoster(SIXTY_DAYS_MS);
  });
});
