import { describe, it, expect, beforeEach } from 'vitest';
import {
  authenticateOffline,
  OfflineVerifierError,
  OfflineInvalidPasswordError,
} from '../offline-auth-service';
import { importRoster } from '../roster-store';
import { clearDek } from '../../storage/data-key-store';
import type { OfflineRosterBundle } from '../roster-types';

// offline-auth-mode delta: "A roster user with a null verifier degrades to
// OfflineVerifierError, never wrong password". Reachable now that the
// backend's Verifier is nullable (offline-auth R5/R12) instead of always
// defaulting to an all-empty object — see roster-types.ts.
describe('offline-auth-service — authenticateOffline with a null verifier (offline-auth-mode)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
  });

  function seedBundleWithNullVerifier() {
    const bundle: OfflineRosterBundle = {
      bundleId: 'b1',
      issuedAt: 1000,
      expiresAt: Date.now() + 1_000_000,
      formatVersion: 3,
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
          verifier: null,
        },
      ],
    };
    importRoster(bundle);
  }

  it('throws OfflineVerifierError for the correct password', async () => {
    seedBundleWithNullVerifier();
    await expect(authenticateOffline('ana', 'secret')).rejects.toBeInstanceOf(
      OfflineVerifierError,
    );
  });

  it('throws OfflineVerifierError for an incorrect password too — never OfflineInvalidPasswordError', async () => {
    seedBundleWithNullVerifier();
    const act = authenticateOffline('ana', 'totally-wrong');
    await expect(act).rejects.toBeInstanceOf(OfflineVerifierError);
    await expect(act).rejects.not.toBeInstanceOf(OfflineInvalidPasswordError);
  });
});
