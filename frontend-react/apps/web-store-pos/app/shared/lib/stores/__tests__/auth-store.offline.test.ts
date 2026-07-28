import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '../auth-store';
import { StorageKeys } from '../../storage/storage-keys';
import { importRoster } from '../../offline/roster-store';
import { sha256Base64, pbkdf2Base64 } from '../../offline/offline-crypto';
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

// auth-session spec: "loginOffline hydrates through the existing setUser seam"
describe('useAuthStore.loginOffline (D6)', () => {
  beforeEach(() => {
    localStorage.clear();
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
});
