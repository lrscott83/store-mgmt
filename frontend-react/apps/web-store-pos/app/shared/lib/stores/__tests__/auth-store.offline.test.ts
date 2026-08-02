import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '../auth-store';
import { StorageKeys } from '../../storage/storage-keys';
import { importRoster, isRosterProvisioned } from '../../offline/roster-store';
import { sha256Base64, pbkdf2Base64 } from '../../offline/offline-crypto';
import { clearDek } from '../../storage/data-key-store';
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
