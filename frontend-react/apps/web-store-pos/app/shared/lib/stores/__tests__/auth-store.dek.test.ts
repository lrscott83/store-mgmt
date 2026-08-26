// design §11 (dek-lifecycle-and-unlock-gate) — WU11, the first behavior
// change: online `login()` unwraps and sets the DEK when a v2 roster entry
// exists for this login. Uses a REAL wrap entry (constructed with the same
// crypto path unwrapDek expects), not a mock, so this test proves the wiring
// actually recovers the correct 32-byte DEK — not just that some function
// was called.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth-store';
import { getDek, getDekStoreId, clearDek } from '../../storage/data-key-store';
import { readDeviceDekTable } from '../../storage/device-dek-table';
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

// `dekWrap` (Task 7 / design D1 source 3) defaults to EMPTY, so every existing
// caller keeps describing exactly what it described before: a login response
// with no wrap — which is also the shape the backend returns when it cannot
// produce one (`AuthDto`'s three fields default to `""`).
function successEnvelope(
  dekWrap: Partial<Pick<AuthModel, 'wrappedDek' | 'wrapSalt' | 'wrapIv'>> = {},
): BaseResponseModel<AuthModel> {
  return {
    data: {
      authToken: 'tok123',
      refreshToken: 'ref123',
      expiresIn: Date.now() + 1_000_000,
      ...dekWrap,
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

  // REWRITTEN (design D2), same input, opposite expectation. This test was
  // itself an AUTHORIZED rewrite once, when the Q2 mint branch (step 3c) was
  // introduced: it then read "no roster entry for this login -> login still
  // resolves and getDek() is non-null" and asserted exactly that. The mint is
  // now gone — only the SERVER can re-derive a store's key, so a device with
  // no roster wrap, no device wrap and (until Task 7) no login-response wrap
  // has no route to it, and entering would mean writing data nobody can ever
  // read back. The login refuses instead.
  //
  // The rejection propagating out of `login()` un-swallowed is the contract
  // Task 5 builds on to show the user a message; see `auth-store.ts:297-298`.
  it('11.3: no roster entry for this login -> login rejects DekUnwrapError and no key is invented (design D2, was the Q2 mint)', async () => {
    mockAuthHttp(successEnvelope(), makeAuthUser());

    await expect(
      useAuthStore.getState().login('ana@example.com', 'secret'),
    ).rejects.toMatchObject({ name: 'DekUnwrapError' });
    expect(getDek()).toBeNull();
    expect(readDeviceDekTable()).toBeNull();

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

  // GAP 2 (batch-2 apply-progress, obs #2123): `sessionStoreId` was inferred
  // as `user.selectedStoreId` (repo convention: `user-home.ts:24`,
  // `authorization-service.ts:35`), never specified explicitly by
  // design/tasks. That binding is still a live contract and still needs
  // pinning.
  //
  // HOW IT IS PINNED CHANGED, and the reason matters. This test used to infer
  // the binding from an OUTCOME — `getDekStoreId()` and `table.storeId` both
  // came out as `user.selectedStoreId` because the Q2 mint branch called
  // `setDek(dek, sessionStoreId)`. With the mint gone, `sessionStoreId` no
  // longer reaches any observable outcome: every surviving use of it in
  // `dek-provisioning.ts` sits behind a `??` whose left side is always
  // defined (`getDekStoreId()` is non-null whenever `getDek()` is, since only
  // `setDek` sets either; and `bundle?.storeId` is defined whenever a roster
  // entry was found). Verified by mutation — replacing the parameter with a
  // sentinel value fails no test in the suite.
  //
  // So the argument is asserted directly, at the call site, which is where
  // the contract actually lives (`auth-store.ts:298`). This is strictly more
  // direct than the old inference, and it keeps working when Task 7's
  // login-response source makes the parameter load-bearing again. The real
  // resolver still runs underneath — the mock delegates to it — so this is
  // not a stub standing in for the behaviour.
  it('11.5: login() passes sessionStoreId = user.selectedStoreId to resolveDekForLogin (GAP 2 binding)', async () => {
    await seedV2Roster(await wrapDek('secret', FIXED_DEK));
    mockAuthHttp(successEnvelope(), makeAuthUser({ selectedStoreId: 'online-session-id' }));

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
      await useAuthStore.getState().login('ana@example.com', 'secret');

      // The binding under test. A distinctive, non-default id catches a
      // hardcoded fallback or a dropped argument that a coincidentally
      // matching 's1' fixture would not.
      expect(seen).toHaveLength(1);
      expect(seen[0].sessionStoreId).toBe('online-session-id');
      expect(seen[0].login).toBe('ana@example.com');

      // The delegated real resolver did its job, so the binding above was
      // observed on a live call and not on a stub that replaced it.
      expect(getDek()).not.toBeNull();
      // Where the store id actually comes from now: the roster bundle that
      // supplied the key, NOT the session. Recorded so the divergence from
      // this test's own history is explicit rather than surprising.
      expect(getDekStoreId()).toBe('s1');
      expect(readDeviceDekTable()?.storeId).toBe('s1');
    } finally {
      vi.doUnmock('../../offline/dek-provisioning');
      vi.doUnmock('~/shared/lib/http/auth-http-service');
    }
  });

  // Task 7 / design D1 source 3 — the plan's required test, end to end through
  // the real online `login()`. This is the exact device 11.3 above refuses:
  // no device table, no roster, nothing. What changed is not the resolver's
  // appetite for inventing keys (it still invents nothing) but the arrival of
  // a THIRD server-derived source: `AuthDto` now carries the store's key
  // wrapped under this user's password, byte-compatible with the roster's own
  // wrap, so `unwrapDek` opens it with no translation.
  it('11.6: login response carrying a wrap provisions a bare device (no table, no roster)', async () => {
    const loginWrap = await wrapDek('secret', FIXED_DEK);
    mockAuthHttp(
      successEnvelope(loginWrap),
      makeAuthUser({ selectedStoreId: 'online-session-id' }),
    );

    // PRECONDITION — the two sources that could otherwise supply the key are
    // genuinely absent, so a pass below is the login response's doing. (The
    // `beforeEach` clears localStorage; asserted rather than assumed, since
    // 11.3 proves this same state rejects without the wrap.)
    expect(readDeviceDekTable()).toBeNull();

    await useAuthStore.getState().login('ana@example.com', 'secret');

    expect(Array.from(getDek()!)).toEqual(Array.from(FIXED_DEK));
    // No roster bundle to read a store id from, so it is the session's own —
    // the binding 11.5 pins, now load-bearing for an observable outcome.
    expect(getDekStoreId()).toBe('online-session-id');
    const table = readDeviceDekTable()!;
    expect(table.dekSource).toBe('login-response');
    expect(table.storeId).toBe('online-session-id');
    expect(table.users['ana@example.com']).toBeDefined();

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

describe('useAuthStore.login — SuperAdmin/Reseller without store skips DEK resolution', () => {
  const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

  beforeEach(() => {
    localStorage.clear();
    clearDek();
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false, error: null });
  });

  it('SuperAdmin with no assigned store (empty GUID) logs in without DekUnwrapError', async () => {
    const superAdminUser = makeAuthUser({
      isSuperAdmin: true,
      isOwnerAdmin: false,
      selectedStoreId: EMPTY_GUID,
    });
    // Backend returns empty wrap fields for users without a store
    mockAuthHttp(successEnvelope(), superAdminUser);

    // This should NOT throw DekUnwrapError
    await useAuthStore.getState().login('admin', 'password123');

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.isSuperAdmin).toBe(true);
    expect(state.user?.selectedStoreId).toBe(EMPTY_GUID);
    // DEK was NOT resolved (skipped for users without a store)
    expect(getDek()).toBeNull();

    vi.doUnmock('~/shared/lib/http/auth-http-service');
  });

  it('Reseller with no assigned store logs in without DekUnwrapError', async () => {
    const resellerUser = makeAuthUser({
      isSuperAdmin: false,
      isReSeller: true,
      selectedStoreId: EMPTY_GUID,
    });
    mockAuthHttp(successEnvelope(), resellerUser);

    await useAuthStore.getState().login('reseller@test.com', 'password123');

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.isReSeller).toBe(true);
    expect(state.user?.selectedStoreId).toBe(EMPTY_GUID);
    expect(getDek()).toBeNull();

    vi.doUnmock('~/shared/lib/http/auth-http-service');
  });

  it('User WITH a store still resolves DEK as before (no regression)', async () => {
    await seedV2Roster(await wrapDek('secret', FIXED_DEK));
    mockAuthHttp(successEnvelope(), makeAuthUser({ selectedStoreId: 's1' }));

    await useAuthStore.getState().login('ana@example.com', 'secret');

    expect(getDek()).not.toBeNull();
    expect(Array.from(getDek()!)).toEqual(Array.from(FIXED_DEK));

    vi.doUnmock('~/shared/lib/http/auth-http-service');
  });
});
