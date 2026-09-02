// End-to-end coverage for two `offline-auth-mode` scenarios flagged by
// verify-report WARNING #2 as only proven by COMPOSING two separately-tested
// units, not by one test driving an actually-expired / actually-inactive
// case through the rendered login form as the spec's own Given/When/Then
// phrasing describes.
//
// Unlike `login.offline.test.tsx`, this file does NOT mock
// `~/shared/lib/offline/roster-store` or `~/shared/lib/offline/offline-auth-service`
// — both run as real production code against a real (jsdom) `localStorage`
// and real Web Crypto, so a future regression in either module's expiry or
// inactive-user logic is caught here, not just at the unit level.
//
// `login.offline.test.tsx` (and its headline-invariant Suite B against the
// pre-existing bare `vi.fn()` auth-store mock) is intentionally left
// untouched by this file.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { IntlProvider } from 'react-intl';
import messages from '~/shared/lib/i18n/es';

vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('~/shared/lib/auth/connectivity-service', () => ({
  ConnectivityService: {
    isOnline: vi.fn().mockReturnValue(true),
  },
}));

vi.mock('~/shared/lib/pwa/preload-heavy-chunks', () => ({
  preloadHeavyChunks: vi.fn(),
}));

vi.mock('~/shared/lib/usage/store-usage-tracker', () => ({
  armTracking: vi.fn(),
}));

vi.mock('~/shared/lib/auth/user-home', () => ({
  resolveUserHomePath: vi.fn().mockResolvedValue('/sales/new'),
}));

import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { ConnectivityService } from '~/shared/lib/auth/connectivity-service';
import LoginPage from '../login';
import { importRoster } from '~/shared/lib/offline/roster-store';
import { authenticateOffline } from '~/shared/lib/offline/offline-auth-service';
import { sha256Base64, pbkdf2Base64 } from '~/shared/lib/offline/offline-crypto';
import type { OfflineRosterBundle } from '~/shared/lib/offline/roster-types';
import type { UserModel } from '@store-mgmt/domain';

// Matches roster-store.ts's private `ROSTER_KEY` — same convention already
// used in `roster-store.test.ts` for the D3 shape-guard test that also
// bypasses `importRoster` to write directly to storage.
const ROSTER_KEY = 'lizoft.offline-roster';
const FIXED_SALT = 'AAAAAAAAAAAAAAAAAAAAAA==';
const ITERATIONS = 210_000;

async function makeVerifier(password: string) {
  const preHash = await sha256Base64(password);
  const hash = await pbkdf2Base64(preHash, FIXED_SALT, ITERATIONS);
  return { hash, salt: FIXED_SALT, iterations: ITERATIONS };
}

function makeOnlineUser(): UserModel {
  return {
    id: 'u-online',
    login: 'ana',
    fullName: 'Ana',
    cellPhone: '',
    email: '',
    isActive: true,
    password: '',
    authToken: 'tok',
    refreshToken: '',
    expiresIn: 0,
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

function renderLogin(mockStore: Record<string, unknown>) {
  vi.mocked(useAuthStore).mockReturnValue(mockStore as ReturnType<typeof useAuthStore>);
  return render(
    <IntlProvider locale="es" messages={messages}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </IntlProvider>,
  );
}

async function submit() {
  fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'ana' } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secret' } });
  fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));
}

describe('LoginPage — offline-auth-mode end-to-end (real roster-store + real offline-auth-service)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(ConnectivityService.isOnline).mockReturnValue(true);
  });

  // offline-auth-mode: "An expired bundle falls back to online auth"
  it('an actually-expired stored bundle falls through to the online login action', async () => {
    const verifier = await makeVerifier('secret');
    const expiredBundle: OfflineRosterBundle = {
      bundleId: 'expired-1',
      issuedAt: 1_000,
      expiresAt: Date.now() - 1_000, // GIVEN: expiresAt in the past
      formatVersion: 1,
      storeId: 's1',
      users: [
        {
          id: 'u1',
          login: 'ana',
          fullName: 'Ana',
          isActive: true,
          roles: [],
          featureIds: [],
          storeModuleIds: [],
          isSuperAdmin: false,
          isOwnerAdmin: false,
          isReSeller: false,
          selectedStoreId: 's1',
          verifier,
        },
      ],
    };
    // `importRoster` itself rejects an already-expired bundle at import
    // time (`ExpiredBundleError`) — this simulates a bundle that WAS valid
    // when imported and has since expired, i.e. exactly the spec's GIVEN
    // ("a device's stored roster has an expiresAt in the past"), by writing
    // directly to storage the same way `roster-store.test.ts`'s D3 guard
    // test does.
    localStorage.setItem(ROSTER_KEY, JSON.stringify(expiredBundle));

    const loginFn = vi.fn().mockResolvedValue(makeOnlineUser());
    const loginOfflineFn = vi.fn();
    renderLogin({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      login: loginFn,
      loginOffline: loginOfflineFn,
    });

    await submit();

    await waitFor(() => {
      expect(loginFn).toHaveBeenCalledWith('ana', 'secret');
    });
    expect(loginOfflineFn).not.toHaveBeenCalled();
  });

  // WU14 (regression coverage, not new behavior): expiry has nothing to do
  // with encryption provisioning — same actually-expired case as above with
  // formatVersion:2 and wrap fields populated.
  it('an actually-expired v2 (wrap-field-carrying) stored bundle also falls through to the online login action (WU14 regression coverage)', async () => {
    const verifier = await makeVerifier('secret');
    const expiredBundle: OfflineRosterBundle = {
      bundleId: 'expired-2',
      issuedAt: 1_000,
      expiresAt: Date.now() - 1_000, // GIVEN: expiresAt in the past
      formatVersion: 2,
      storeId: 's1',
      users: [
        {
          id: 'u1',
          login: 'ana',
          fullName: 'Ana',
          isActive: true,
          roles: [],
          featureIds: [],
          storeModuleIds: [],
          isSuperAdmin: false,
          isOwnerAdmin: false,
          isReSeller: false,
          selectedStoreId: 's1',
          verifier,
          wrappedDek: 'ct',
          wrapSalt: 'salt',
          wrapIv: 'iv',
        },
      ],
    };
    localStorage.setItem(ROSTER_KEY, JSON.stringify(expiredBundle));

    const loginFn = vi.fn().mockResolvedValue(makeOnlineUser());
    const loginOfflineFn = vi.fn();
    renderLogin({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      login: loginFn,
      loginOffline: loginOfflineFn,
    });

    await submit();

    await waitFor(() => {
      expect(loginFn).toHaveBeenCalledWith('ana', 'secret');
    });
    expect(loginOfflineFn).not.toHaveBeenCalled();
  });

  // offline-auth-mode: "Inactive roster user is rejected distinctly"
  it('an actually-inactive roster user is rejected with AUTH.ACCOUNT_INACTIVE, not the generic message', async () => {
    const verifier = await makeVerifier('secret');
    const bundle: OfflineRosterBundle = {
      bundleId: 'inactive-1',
      issuedAt: 1_000,
      expiresAt: Date.now() + 1_000_000,
      formatVersion: 1,
      storeId: 's1',
      users: [
        {
          id: 'u1',
          login: 'ana',
          fullName: 'Ana',
          isActive: false, // GIVEN: a roster user marked inactive
          roles: [],
          featureIds: [],
          storeModuleIds: [],
          isSuperAdmin: false,
          isOwnerAdmin: false,
          isReSeller: false,
          selectedStoreId: 's1',
          verifier,
        },
      ],
    };
    importRoster(bundle);

    const loginFn = vi.fn();
    // `loginOffline` is still a store-level mock (auth-store itself is
    // mocked, per this file's shared convention), but its implementation
    // delegates to the REAL `authenticateOffline` imported above — so
    // `login.tsx`'s `offlineErrorMessageId` dispatch receives a REAL
    // `OfflineUserInactiveError` instance thrown by production code against
    // a real inactive roster user, not a hand-built `Object.assign` stand-in
    // (contrast `login.offline.test.tsx`'s A3 test).
    const loginOfflineFn = vi.fn((login: string, password: string) =>
      authenticateOffline(login, password),
    );
    renderLogin({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      login: loginFn,
      loginOffline: loginOfflineFn,
    });

    await submit();

    await waitFor(() => {
      expect(screen.getByText('Tu cuenta está inactiva. Contacta soporte.')).toBeInTheDocument();
    });
    expect(loginFn).not.toHaveBeenCalled();
  });

  // WU14 (regression coverage, not new behavior): the active-user check runs
  // before any DEK unwrap is attempted — same inactive-user case as above
  // with formatVersion:2 and wrap fields populated.
  it('an actually-inactive v2 (wrap-field-carrying) roster user is also rejected with AUTH.ACCOUNT_INACTIVE (WU14 regression coverage)', async () => {
    const verifier = await makeVerifier('secret');
    const bundle: OfflineRosterBundle = {
      bundleId: 'inactive-2',
      issuedAt: 1_000,
      expiresAt: Date.now() + 1_000_000,
      formatVersion: 2,
      storeId: 's1',
      users: [
        {
          id: 'u1',
          login: 'ana',
          fullName: 'Ana',
          isActive: false, // GIVEN: a roster user marked inactive
          roles: [],
          featureIds: [],
          storeModuleIds: [],
          isSuperAdmin: false,
          isOwnerAdmin: false,
          isReSeller: false,
          selectedStoreId: 's1',
          verifier,
          wrappedDek: 'ct',
          wrapSalt: 'salt',
          wrapIv: 'iv',
        },
      ],
    };
    importRoster(bundle);

    const loginFn = vi.fn();
    const loginOfflineFn = vi.fn((login: string, password: string) =>
      authenticateOffline(login, password),
    );
    renderLogin({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      login: loginFn,
      loginOffline: loginOfflineFn,
    });

    await submit();

    await waitFor(() => {
      expect(screen.getByText('Tu cuenta está inactiva. Contacta soporte.')).toBeInTheDocument();
    });
    expect(loginFn).not.toHaveBeenCalled();
  });
});
