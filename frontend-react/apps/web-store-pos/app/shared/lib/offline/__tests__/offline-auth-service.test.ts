import { describe, it, expect, beforeEach } from 'vitest';
import { authenticateOffline } from '../offline-auth-service';
import {
  NoRosterError,
  OfflineUserNotFoundError,
  OfflineInvalidPasswordError,
  OfflineUserInactiveError,
} from '../offline-auth-service';
import { importRoster } from '../roster-store';
import { sha256Base64, pbkdf2Base64 } from '../offline-crypto';
import { OFFLINE_SESSION_TOKEN } from '../offline-session';
import type { OfflineRosterBundle } from '../roster-types';

const FIXED_SALT = 'AAAAAAAAAAAAAAAAAAAAAA==';
const ITERATIONS = 210_000;

async function makeVerifier(password: string) {
  const preHash = await sha256Base64(password);
  const hash = await pbkdf2Base64(preHash, FIXED_SALT, ITERATIONS);
  return { hash, salt: FIXED_SALT, iterations: ITERATIONS };
}

async function seedBundle(overrides: Partial<OfflineRosterBundle['users'][number]> = {}) {
  const verifier = await makeVerifier('secret');
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
        featureIds: [1, 2],
        storeModuleIds: [3],
        isSuperAdmin: false,
        isOwnerAdmin: true,
        isReSeller: false,
        selectedStoreId: 's1',
        verifier,
        ...overrides,
      },
    ],
  };
  importRoster(bundle);
  return bundle;
}

describe('offline-auth-service — authenticateOffline (offline-auth-mode spec)', () => {
  beforeEach(() => localStorage.clear());

  it('returns a hydrated UserModel for the right password', async () => {
    await seedBundle();
    const user = await authenticateOffline('ana', 'secret');
    expect(user.id).toBe('u1');
    expect(user.login).toBe('ana');
    expect(user.fullName).toBe('Ana Pérez');
    expect(user.isSuperAdmin).toBe(false);
    expect(user.isOwnerAdmin).toBe(true);
    expect(user.selectedStoreId).toBe('s1');
    expect(user.authToken).toBe(OFFLINE_SESSION_TOKEN);
  });

  it('rejects a wrong password with OfflineInvalidPasswordError', async () => {
    await seedBundle();
    await expect(authenticateOffline('ana', 'wrong')).rejects.toBeInstanceOf(
      OfflineInvalidPasswordError,
    );
  });

  it('rejects an unknown login like a wrong password, with OfflineUserNotFoundError', async () => {
    await seedBundle();
    await expect(authenticateOffline('ghost', 'secret')).rejects.toBeInstanceOf(
      OfflineUserNotFoundError,
    );
  });

  it('rejects an inactive roster user with OfflineUserInactiveError', async () => {
    await seedBundle({ isActive: false });
    await expect(authenticateOffline('ana', 'secret')).rejects.toBeInstanceOf(
      OfflineUserInactiveError,
    );
  });

  it('raises NoRosterError when no roster is provisioned on this device', async () => {
    await expect(authenticateOffline('ana', 'secret')).rejects.toBeInstanceOf(NoRosterError);
  });

  // offline-auth-mode: "Offline-hydrated UserModel carries no-billing-data defaults"
  it('maps billing fields to the no-billing-data defaults (design correction #1)', async () => {
    await seedBundle();
    const user = await authenticateOffline('ana', 'secret');
    expect(user.paymentDueDate).toBeNull();
    expect(user.isInTrial).toBe(false);
    expect(user.paymentStatus).toBe('NoAplica');
    expect(user.cellPhone).toBe('');
    expect(user.email).toBe('');
    expect(user.password).toBe('');
    expect(user.refreshToken).toBe('');
    expect(user.expiresIn).toBe(0);
  });
});
