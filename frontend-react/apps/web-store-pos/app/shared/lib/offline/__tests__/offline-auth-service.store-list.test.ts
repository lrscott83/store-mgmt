import { describe, it, expect, beforeEach } from 'vitest';
import { authenticateOffline } from '../offline-auth-service';
import { importRoster } from '../roster-store';
import { sha256Base64, pbkdf2Base64 } from '../offline-crypto';
import type { OfflineRosterBundle, OfflineRosterUser } from '../roster-types';

const FIXED_SALT = 'AAAAAAAAAAAAAAAAAAAAAA==';
const ITERATIONS = 210_000;

async function makeVerifier(password: string) {
  const preHash = await sha256Base64(password);
  const hash = await pbkdf2Base64(preHash, FIXED_SALT, ITERATIONS);
  return { hash, salt: FIXED_SALT, iterations: ITERATIONS };
}

function baseUser(overrides: Partial<OfflineRosterUser> = {}): OfflineRosterUser {
  return {
    id: 'u1',
    login: 'ana',
    fullName: 'Ana Pérez',
    isActive: true,
    roles: [],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: true,
    isReSeller: false,
    selectedStoreId: 's1',
    verifier: null,
    ...overrides,
  };
}

async function seedBundle(users: OfflineRosterUser[]) {
  const verifier = await makeVerifier('secret');
  const bundle: OfflineRosterBundle = {
    bundleId: 'b1',
    issuedAt: 1000,
    expiresAt: Date.now() + 1_000_000,
    formatVersion: 1,
    storeId: 's1',
    users: users.map((u) => ({ ...u, verifier })),
  };
  importRoster(bundle);
  return bundle;
}

// store-list-active-stores: the roster's OwnerAdmin rows carry the owner's
// full store list (same shape as /me's StoreList) so an offline OwnerAdmin
// gets the same active-store selection as online. `toUserModel` propagates
// it onto the hydrated UserModel; legacy bundles without the field keep
// `storeList` undefined (self-heals on next /me).
describe('offline-auth-service — roster storeList propagation (store-list-active-stores)', () => {
  beforeEach(() => localStorage.clear());

  it('propagates the roster storeList onto the hydrated OwnerAdmin UserModel', async () => {
    await seedBundle([
      baseUser({
        storeList: [
          { id: 's1', name: 'Tienda A', isActive: true },
          { id: 's2', name: 'Tienda B', isActive: false },
        ],
      }),
    ]);
    const user = await authenticateOffline('ana', 'secret');
    expect(user.isOwnerAdmin).toBe(true);
    expect(user.storeList).toEqual([
      { id: 's1', name: 'Tienda A', isActive: true },
      { id: 's2', name: 'Tienda B', isActive: false },
    ]);
  });

  it('keeps storeList undefined for a legacy bundle without the field (self-heals on next /me)', async () => {
    await seedBundle([baseUser()]);
    const user = await authenticateOffline('ana', 'secret');
    expect(user.storeList).toBeUndefined();
  });

  it('keeps storeList empty for a non-owner roster row (parity with /me)', async () => {
    await seedBundle([
      baseUser({
        id: 'u2',
        login: 'clerk',
        isOwnerAdmin: false,
        selectedStoreId: 's1',
        storeList: [],
      }),
    ]);
    const user = await authenticateOffline('clerk', 'secret');
    expect(user.isOwnerAdmin).toBe(false);
    expect(user.storeList).toEqual([]);
  });
});
