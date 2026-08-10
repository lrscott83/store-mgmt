// design §11 (dek-lifecycle-and-unlock-gate) — WU11, the first behavior
// change: online `login()` unwraps and sets the DEK when a v2 roster entry
// exists for this login. Uses a REAL wrap entry (constructed with the same
// crypto path unwrapDek expects), not a mock, so this test proves the wiring
// actually recovers the correct 32-byte DEK — not just that some function
// was called.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth-store';
import { getDek, clearDek } from '../../storage/data-key-store';
import { importRoster } from '../../offline/roster-store';
import { sha256Base64, pbkdf2Base64 } from '../../offline/offline-crypto';
import { aesGcmEncrypt } from '../../storage/aes-gcm';
import { base64FromBytes, bytesFromBase64 } from '../../storage/base64';
import { isEncrypted } from '../../storage/entity-crypto';
import { StorageKeys } from '../../storage/storage-keys';
import type { OfflineRosterBundle } from '../../offline/roster-types';
import type { AuthModel, BaseResponseModel, UserModel } from '@store-mgmt/domain';

const WRAP_ITERATIONS = 210_000;
const FIXED_DEK = new Uint8Array(32).fill(0x42);

async function wrapDek(
  password: string,
  dek: Uint8Array,
): Promise<{ wrappedDek: string; wrapSalt: string; wrapIv: string }> {
  const wrapSaltBytes = new Uint8Array(16).fill(0x07);
  const wrapSalt = base64FromBytes(wrapSaltBytes);
  const wrapIvBytes = new Uint8Array(12).fill(0x08);
  const wrapIv = base64FromBytes(wrapIvBytes);
  const preHash = await sha256Base64(password);
  const kekBase64 = await pbkdf2Base64(preHash, wrapSalt, WRAP_ITERATIONS);
  const kek = bytesFromBase64(kekBase64);
  const ciphertextWithTag = aesGcmEncrypt(kek, wrapIvBytes, dek);
  return { wrappedDek: base64FromBytes(ciphertextWithTag), wrapSalt, wrapIv };
}

function makeAuthUser(): UserModel {
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
  };
}

async function seedV2Roster(entryOverrides: Partial<OfflineRosterBundle['users'][number]> = {}) {
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
        verifier: { hash: 'h', salt: 's', iterations: 210_000 },
        ...entryOverrides,
      },
    ],
  };
  importRoster(bundle);
  return bundle;
}

function mockAuthHttp(loginResponse: BaseResponseModel<AuthModel>, meUser: UserModel) {
  vi.doMock('~/shared/lib/http/auth-http-service', () => ({
    authHttpService: {
      login: vi.fn().mockResolvedValue(loginResponse),
      getMe: vi.fn().mockResolvedValue(meUser),
    },
  }));
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

describe('useAuthStore.login — DEK unwrap wiring (design §11, WU11, first behavior change)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false, error: null });
  });

  // `login()` dynamically imports `~/shared/lib/http/auth-http-service`
  // (D6) INSIDE its own body at call time, so `vi.doMock` registered here —
  // before `login()` is invoked — intercepts it without needing a fresh
  // module registry. Using the SAME statically-imported `useAuthStore` (and
  // `getDek`) as production code, instead of `vi.resetModules()` + a fresh
  // import, keeps this test observing the exact module instance
  // `data-key-store.ts` singleton that `auth-store.ts` itself writes to.
  it('11.1: leaves getDek() non-null after online login on a device provisioned for this login', async () => {
    await seedV2Roster(await wrapDek('secret', FIXED_DEK));
    mockAuthHttp(successEnvelope(), makeAuthUser());

    await useAuthStore.getState().login('ana@example.com', 'secret');

    expect(getDek()).not.toBeNull();
    expect(Array.from(getDek()!)).toEqual(Array.from(FIXED_DEK));

    vi.doUnmock('~/shared/lib/http/auth-http-service');
  });

  // AUTHORIZED rewrite (device-wrapped-dek design §5/§7): "no roster entry"
  // no longer leaves the DEK null — `resolveDekForLogin`'s Q2 mint branch
  // (step 3c) gives every device a DEK after its first login. IndexedDB is
  // absent under plain jsdom (no `fake-indexeddb` import in this file),
  // which correctly exercises the F1 local-mint path (no device-key wrap,
  // password wrap only) — no crypto mocking needed.
  it('11.3: no roster entry for this login -> login still resolves and getDek() is non-null (device-wrapped-dek Q2 mint)', async () => {
    mockAuthHttp(successEnvelope(), makeAuthUser());

    const user = await useAuthStore.getState().login('ana@example.com', 'secret');

    expect(user).toBeDefined();
    expect(getDek()).not.toBeNull();

    vi.doUnmock('~/shared/lib/http/auth-http-service');
  });

  it('11.4: roster entry wrapped under a different password -> login rejects with a DekUnwrapError-named error', async () => {
    // Wrapped under 'old-password', but the user now logs in with 'secret'
    // (the server-side check passed -- this simulates a rotated password
    // whose roster export is stale).
    await seedV2Roster(await wrapDek('old-password', FIXED_DEK));
    mockAuthHttp(successEnvelope(), makeAuthUser());

    await expect(
      useAuthStore.getState().login('ana@example.com', 'secret'),
    ).rejects.toMatchObject({ name: 'DekUnwrapError' });
    expect(getDek()).toBeNull();

    vi.doUnmock('~/shared/lib/http/auth-http-service');
  });
});

// design §12 (entity-migration, WU13.6): migration fires right after
// setDek on the online login path, wrapped so its failure never blocks
// login.
describe('useAuthStore.login — eager entity migration wiring (design §12, WU13)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false, error: null });
  });

  it('13.6: a plaintext key is marked enc:v1: after login resolves', async () => {
    const storeId = 's1';
    const productsKey = StorageKeys.entityKey('products', storeId);
    localStorage.setItem(productsKey, '[{"id":1,"name":"widget"}]');

    await seedV2Roster(await wrapDek('secret', FIXED_DEK));
    mockAuthHttp(successEnvelope(), makeAuthUser());

    await useAuthStore.getState().login('ana@example.com', 'secret');

    expect(isEncrypted(localStorage.getItem(productsKey)!)).toBe(true);

    vi.doUnmock('~/shared/lib/http/auth-http-service');
  });
});
