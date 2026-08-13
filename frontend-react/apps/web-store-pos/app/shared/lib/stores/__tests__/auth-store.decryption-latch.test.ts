// Task 4, step 6: the decryption-failure latch collapses several rejections
// from ONE cause into one dialog, but left alone it also silences every later
// failure for the lifetime of the tab. Its reset is wired to the one event that
// means "this device can read again": a login that resolved a key.
//
// The latch is observed through the REAL policy module (blocking-alert is the
// only thing stubbed), not through an exported flag — so these tests fail if
// the wiring is dropped, and would keep passing if the latch were reimplemented
// differently.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth-store';
import { clearDek } from '../../storage/data-key-store';
import { importRoster } from '../../offline/roster-store';
import { sha256Base64, pbkdf2Base64 } from '../../offline/offline-crypto';
import { aesGcmEncrypt } from '../../storage/aes-gcm';
import { base64FromBytes, bytesFromBase64 } from '../../storage/base64';
import { MissingDataKeyError } from '../../storage/entity-crypto';
import {
  handleDecryptionFailure,
  resetDecryptionFailureLatch,
} from '../../storage/decryption-failure-policy';
import type { OfflineRosterBundle } from '../../offline/roster-types';
import type { AuthModel, BaseResponseModel, UserModel } from '@store-mgmt/domain';

const showBlockingErrorMock = vi.fn();
vi.mock('../../blocking-alert', () => ({
  showBlockingError: (...args: unknown[]) => showBlockingErrorMock(...args),
}));

const WRAP_ITERATIONS = 210_000;
const FIXED_DEK = new Uint8Array(32).fill(0x42);
const PASSWORD = 'secret';

async function wrapDek(password: string, dek: Uint8Array) {
  const wrapSaltBytes = new Uint8Array(16).fill(0x07);
  const wrapSalt = base64FromBytes(wrapSaltBytes);
  const wrapIvBytes = new Uint8Array(12).fill(0x08);
  const wrapIv = base64FromBytes(wrapIvBytes);
  const preHash = await sha256Base64(password);
  const kekBase64 = await pbkdf2Base64(preHash, wrapSalt, WRAP_ITERATIONS);
  const kek = bytesFromBase64(kekBase64);
  return { wrappedDek: base64FromBytes(aesGcmEncrypt(kek, wrapIvBytes, dek)), wrapSalt, wrapIv };
}

async function passwordVerifier(password: string) {
  const salt = base64FromBytes(new Uint8Array(16).fill(0x09));
  const preHash = await sha256Base64(password);
  const hash = await pbkdf2Base64(preHash, salt, WRAP_ITERATIONS);
  return { hash, salt, iterations: WRAP_ITERATIONS };
}

function makeAuthUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    id: 'u1',
    login: 'ana@example.com',
    fullName: 'Ana',
    cellPhone: '',
    email: 'ana@example.com',
    isActive: true,
    password: '',
    authToken: 'tok123',
    refreshToken: 'ref123',
    expiresIn: Date.now() + 1_000_000,
    roles: [],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: 's1',
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
    ...overrides,
  };
}

async function seedV2Roster() {
  const bundle: OfflineRosterBundle = {
    bundleId: 'b1',
    issuedAt: 1000,
    expiresAt: Date.now() + 1_000_000,
    formatVersion: 2,
    storeId: 's1',
    users: [
      {
        id: 'u1',
        login: 'ana@example.com',
        fullName: 'Ana',
        isActive: true,
        roles: [],
        featureIds: [],
        storeModuleIds: [],
        isSuperAdmin: false,
        isOwnerAdmin: false,
        isReSeller: false,
        selectedStoreId: 's1',
        verifier: await passwordVerifier(PASSWORD),
        ...(await wrapDek(PASSWORD, FIXED_DEK)),
      },
    ],
  };
  importRoster(bundle);
}

function successEnvelope(): BaseResponseModel<AuthModel> {
  return {
    data: {
      authToken: 'tok123',
      refreshToken: 'ref123',
      expiresIn: Date.now() + 1_000_000,
    } as AuthModel,
    succeeded: true,
    message: '',
    actionCode: 200,
    errors: [],
  };
}

function mockAuthHttp() {
  vi.doMock('~/shared/lib/http/auth-http-service', () => ({
    authHttpService: {
      login: vi.fn().mockResolvedValue(successEnvelope()),
      getMe: vi.fn().mockResolvedValue(makeAuthUser()),
    },
  }));
}

describe('auth-store — a successful login clears the decryption-failure latch (Task 4, step 6)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    vi.clearAllMocks();
    resetDecryptionFailureLatch();
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false, error: null });
  });

  it('online login() re-arms the latch, so a failure AFTER it is announced again', async () => {
    await seedV2Roster();
    mockAuthHttp();

    // A first failure latches: the device could not read.
    handleDecryptionFailure(new MissingDataKeyError());
    expect(showBlockingErrorMock).toHaveBeenCalledTimes(1);

    try {
      await useAuthStore.getState().login('ana@example.com', PASSWORD);
    } finally {
      vi.doUnmock('~/shared/lib/http/auth-http-service');
    }

    // Without the reset this second announcement is swallowed for the lifetime
    // of the tab, and the user is left staring at a screen that never explains
    // itself.
    handleDecryptionFailure(new MissingDataKeyError());
    expect(showBlockingErrorMock).toHaveBeenCalledTimes(2);
  });

  it('offline loginOffline() re-arms the latch too — the offline path is where this failure lives', async () => {
    await seedV2Roster();

    handleDecryptionFailure(new MissingDataKeyError());
    expect(showBlockingErrorMock).toHaveBeenCalledTimes(1);

    await useAuthStore.getState().loginOffline('ana@example.com', PASSWORD);

    handleDecryptionFailure(new MissingDataKeyError());
    expect(showBlockingErrorMock).toHaveBeenCalledTimes(2);
  });

  it('a login that REJECTS leaves the latch armed — nothing proved this device can read', async () => {
    // No roster at all: `resolveDekForLogin` refuses (design D2, no local
    // mint), so the login rejects. Re-arming here would let one unreadable
    // store produce a dialog per retry.
    mockAuthHttp();

    handleDecryptionFailure(new MissingDataKeyError());
    expect(showBlockingErrorMock).toHaveBeenCalledTimes(1);

    await expect(
      useAuthStore.getState().login('ana@example.com', PASSWORD),
    ).rejects.toMatchObject({ name: 'DekUnwrapError' });
    vi.doUnmock('~/shared/lib/http/auth-http-service');

    handleDecryptionFailure(new MissingDataKeyError());
    expect(showBlockingErrorMock).toHaveBeenCalledTimes(1);
  });
});
