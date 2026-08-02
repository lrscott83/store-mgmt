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
import { getDek, clearDek } from '../../storage/data-key-store';
import { aesGcmEncrypt } from '../../storage/aes-gcm';
import { base64FromBytes, bytesFromBase64 } from '../../storage/base64';
import { isEncrypted } from '../../storage/entity-crypto';
import { StorageKeys } from '../../storage/storage-keys';
import type { OfflineRosterBundle } from '../roster-types';

const FIXED_SALT = 'AAAAAAAAAAAAAAAAAAAAAA==';
const ITERATIONS = 210_000;
const FIXED_DEK = new Uint8Array(32).fill(0x55);

async function makeVerifier(password: string) {
  const preHash = await sha256Base64(password);
  const hash = await pbkdf2Base64(preHash, FIXED_SALT, ITERATIONS);
  return { hash, salt: FIXED_SALT, iterations: ITERATIONS };
}

// design §11 (dek-lifecycle-and-unlock-gate, WU11.5): builds a REAL wrap
// entry using the same crypto path `unwrapDek` expects, so this test proves
// `authenticateOffline` actually recovers the correct DEK, not just that
// some function was called.
async function wrapDek(
  password: string,
  dek: Uint8Array,
): Promise<{ wrappedDek: string; wrapSalt: string; wrapIv: string }> {
  const wrapSaltBytes = new Uint8Array(16).fill(0x07);
  const wrapSalt = base64FromBytes(wrapSaltBytes);
  const wrapIvBytes = new Uint8Array(12).fill(0x08);
  const wrapIv = base64FromBytes(wrapIvBytes);
  const preHash = await sha256Base64(password);
  const kekBase64 = await pbkdf2Base64(preHash, wrapSalt, ITERATIONS);
  const kek = bytesFromBase64(kekBase64);
  const ciphertextWithTag = aesGcmEncrypt(kek, wrapIvBytes, dek);
  return { wrappedDek: base64FromBytes(ciphertextWithTag), wrapSalt, wrapIv };
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
  beforeEach(() => {
    localStorage.clear();
    clearDek();
  });

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
    // design §11 (WU11.5) regression: this bundle carries `formatVersion: 1`
    // (no wrap fields) — the DEK unwrap must be skipped entirely, exactly
    // today's behavior. All 11 pre-existing v1 fixtures in this file are
    // this same regression case.
    expect(getDek()).toBeNull();
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

  // WU14 (regression coverage, not new behavior): verifier/rejection
  // mechanics have nothing to do with encryption provisioning — same
  // wrong-password case as above with formatVersion:2 and no wrap fields
  // (so this device is NOT encryption-provisioned; a v2-but-unwrapped
  // roster must reject exactly like a v1 one).
  it('rejects a wrong password with OfflineInvalidPasswordError (v2 roster, WU14 regression coverage)', async () => {
    const verifier = await makeVerifier('secret');
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
          featureIds: [1, 2],
          storeModuleIds: [3],
          isSuperAdmin: false,
          isOwnerAdmin: true,
          isReSeller: false,
          selectedStoreId: 's1',
          verifier,
        },
      ],
    };
    importRoster(bundle);

    await expect(authenticateOffline('ana', 'wrong')).rejects.toBeInstanceOf(
      OfflineInvalidPasswordError,
    );
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

// design §11 (dek-lifecycle-and-unlock-gate, WU11.5): the offline path
// unwraps AFTER the verifier check passes (password is confirmed correct),
// before `toUserModel`.
describe('offline-auth-service — authenticateOffline DEK unwrap (design §11, WU11.5)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
  });

  async function seedV2Bundle(wrapFields: { wrappedDek: string; wrapSalt: string; wrapIv: string }) {
    const verifier = await makeVerifier('secret');
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
          featureIds: [1, 2],
          storeModuleIds: [3],
          isSuperAdmin: false,
          isOwnerAdmin: true,
          isReSeller: false,
          selectedStoreId: 's1',
          verifier,
          ...wrapFields,
        },
      ],
    };
    importRoster(bundle);
  }

  it('leaves getDek() non-null after a successful v2 offline login', async () => {
    await seedV2Bundle(await wrapDek('secret', FIXED_DEK));

    await authenticateOffline('ana', 'secret');

    expect(getDek()).not.toBeNull();
    expect(Array.from(getDek()!)).toEqual(Array.from(FIXED_DEK));
  });

  // design §12 (entity-migration, WU13.6): migration fires right after
  // setDek on the offline login path too, wrapped so its failure never
  // blocks login.
  it('13.6: a plaintext key is marked enc:v1: after offline login resolves', async () => {
    const productsKey = StorageKeys.entityKey('products', 's1');
    localStorage.setItem(productsKey, '[{"id":1,"name":"widget"}]');

    await seedV2Bundle(await wrapDek('secret', FIXED_DEK));

    await authenticateOffline('ana', 'secret');

    expect(isEncrypted(localStorage.getItem(productsKey)!)).toBe(true);
  });
});
