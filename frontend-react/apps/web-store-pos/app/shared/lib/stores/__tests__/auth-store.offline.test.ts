import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '../auth-store';
import { StorageKeys } from '../../storage/storage-keys';
import { importRoster, isRosterProvisioned } from '../../offline/roster-store';
import { sha256Base64, pbkdf2Base64 } from '../../offline/offline-crypto';
import { getDek, getDekStoreId, clearDek } from '../../storage/data-key-store';
import { readDeviceDekTable } from '../../storage/device-dek-table';
import { unwrapDek, wrapDekWithPassword } from '../../offline/dek-unwrap';
import type { OfflineRosterBundle } from '../../offline/roster-types';

const FIXED_SALT = 'AAAAAAAAAAAAAAAAAAAAAA==';
const ITERATIONS = 210_000;

async function seedRoster(): Promise<void> {
  const preHash = await sha256Base64('secret');
  const hash = await pbkdf2Base64(preHash, FIXED_SALT, ITERATIONS);
  const bundle: OfflineRosterBundle = {
    bundleId: 'b1',
    issuedAt: 1000,
    expiresAt: Date.now() + 1_000_000,
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

  it('loginOffline() on a v1 roster (no wrap fields) -> getDek() is non-null (offline twin of 11.3, Q2 mint)', async () => {
    await seedRoster();

    await useAuthStore.getState().loginOffline('ana', 'secret');

    expect(getDek()).not.toBeNull();
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

  // GAP 2 (batch-2 apply-progress, obs #2123): `sessionStoreId` was
  // inferred as `user.selectedStoreId` (the repo's existing "current
  // store" convention — `user-home.ts:24`, `authorization-service.ts:35`),
  // never specified explicitly by design/tasks. This pins the offline
  // call site's Q2 mint branch (step 3c — no roster wrap for this login,
  // no local table), where `sessionStoreId` is the ONLY store id
  // available. Bundle-level `storeId` and the user's `selectedStoreId` are
  // deliberately different so a wrong binding (e.g. reading the roster
  // bundle's storeId instead) would fail this assertion.
  it('loginOffline() Q2 mint branch (no wrap for this login) -> the table storeId is user.selectedStoreId, not the roster bundle storeId', async () => {
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

    await useAuthStore.getState().loginOffline('beto', 'secret');

    expect(getDek()).not.toBeNull();
    expect(getDekStoreId()).toBe('beto-session-id');
    const table = readDeviceDekTable();
    expect(table?.dekSource).toBe('local');
    expect(table?.storeId).toBe('beto-session-id');
  });
});
