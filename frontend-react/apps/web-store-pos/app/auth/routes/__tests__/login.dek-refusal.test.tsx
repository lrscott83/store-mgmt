import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { IntlProvider } from 'react-intl';
import messages from '~/shared/lib/i18n/es';
import { DekUnwrapError } from '~/shared/lib/offline/dek-unwrap';

// device-wrapped-dek design (Task 5, corrected TWICE by controller rulings
// after the first version of this file): a device holding encrypted data it
// cannot open must not be allowed to authenticate — but on the login SCREEN
// itself, the recovery is an INLINE banner, not the app-wide blocking-dialog
// + sign-out policy (`handleDecryptionFailure`,
// storage/decryption-failure-policy.ts). That policy exists to carry a user
// OFF an authenticated screen and ONTO /login, where the recovery routes
// live; here the user is already there, so a modal + logout would be pure
// friction on a form they can act on directly.
//
// The SECOND ruling split the copy by branch, because
// `e2e/login-offline.spec.ts` T7 pins the OFFLINE branch's exact text and
// that file is untouchable without authorization:
//   - offline (`loginOffline` rejects): AUTH.UNLOCK_FAILED — T7's scenario,
//     a wrap that no longer opens (e.g. after a password change).
//   - online (`login` rejects): ENCRYPTION.KEY_UNAVAILABLE — the refusal
//     when no server key can be obtained at all (design D2), which is what
//     the first ruling was actually about. No E2E test pins this branch.

const showBlockingErrorMock = vi.fn();
vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: (...args: unknown[]) => showBlockingErrorMock(...args),
}));

const logoutMock = vi.fn();
vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = vi.fn(() => ({
    login: loginFn,
    loginOffline: loginOfflineFn,
    isLoading: false,
  }));
  // Not strictly required by login.tsx itself (this seam never reaches
  // handleDecryptionFailure's `useAuthStore.getState().logout()`), but kept
  // so `logoutMock`/`showBlockingErrorMock` can assert the NEGATIVE — that
  // this seam never touches the app-wide policy at all — which is the whole
  // point this suite now pins.
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => ({
    logout: logoutMock,
  });
  return { useAuthStore };
});

vi.mock('~/shared/lib/auth/connectivity-service', () => ({
  ConnectivityService: { isOnline: vi.fn().mockReturnValue(true) },
}));

vi.mock('~/shared/lib/pwa/preload-heavy-chunks', () => ({
  preloadHeavyChunks: vi.fn(),
}));

const isRosterProvisionedMock = vi.fn().mockReturnValue(false);
vi.mock('~/shared/lib/offline/roster-store', () => ({
  isRosterProvisioned: () => isRosterProvisionedMock(),
}));

// Declared before the `vi.mock('~/shared/lib/stores/auth-store', ...)` factory
// above reads them via closure — vi.mock factories run before this module's
// own top-level `const`s would otherwise be initialized, but function
// declarations (`var`-like hoisting) are safe to reference from inside them.
let loginFn = vi.fn();
let loginOfflineFn = vi.fn();

import LoginPage from '../login';

const KEY_UNAVAILABLE =
  'No se pudo abrir la información de esta tienda. Inicie sesión con conexión o importe un roster para recuperarla.';
// Byte-for-byte the string e2e/login-offline.spec.ts T7 asserts
// (UNLOCK_FAILED_TEXT, :40-41) — pinned there, restored here.
const UNLOCK_FAILED =
  'No se pudieron desbloquear los datos de este dispositivo. Si cambiaste tu contraseña, pedí una nueva activación.';
const CATEGORIES_KEY = 'lizoft.store-product-categories-s1';
const SEEDED_BYTES = 'enc:v1:AAAA';

function renderLogin() {
  return render(
    <IntlProvider locale="es" messages={messages}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </IntlProvider>,
  );
}

async function submit(login = 'jdoe', password = 'pw') {
  fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: login } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));
}

describe('LoginPage — refuses a device that cannot open its own data (Task 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isRosterProvisionedMock.mockReturnValue(false);
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders the recovery banner inline and does NOT sign out when the online login cannot unwrap the device DEK', async () => {
    localStorage.setItem(CATEGORIES_KEY, SEEDED_BYTES);
    loginFn = vi.fn().mockRejectedValue(new DekUnwrapError());

    // Precondition, not the behavior under test: the mocked login action
    // itself genuinely rejects with a real `DekUnwrapError` instance — same
    // spirit as CLAUDE.md's E2E gotcha ("assert the precondition first").
    await expect(loginFn('jdoe', 'pw')).rejects.toThrow(DekUnwrapError);
    loginFn.mockClear();

    renderLogin();
    await submit();

    await waitFor(() => {
      expect(screen.getByText(KEY_UNAVAILABLE)).toBeInTheDocument();
    });
    // The mechanism is the inline banner, NOT the app-wide policy: no dialog,
    // no sign-out. The user is already on /login, where both recovery routes
    // (named in the banner text above) live.
    expect(showBlockingErrorMock).not.toHaveBeenCalled();
    expect(logoutMock).not.toHaveBeenCalled();
    // The failure is about this device's key, not the stored ciphertext —
    // nothing is touched, let alone wiped, on a refused login.
    expect(localStorage.getItem(CATEGORIES_KEY)).toBe(SEEDED_BYTES);
  });

  it('still shows the ordinary invalid-credentials message on a wrong password, never the data-recovery copy', async () => {
    loginFn = vi.fn().mockRejectedValue({ status: 401 });

    renderLogin();
    await submit();

    await waitFor(() => {
      expect(screen.getByText('Usuario o contraseña inválidos')).toBeInTheDocument();
    });
    expect(screen.queryByText(KEY_UNAVAILABLE)).not.toBeInTheDocument();
    expect(showBlockingErrorMock).not.toHaveBeenCalled();
    expect(logoutMock).not.toHaveBeenCalled();
  });

  it('reports a second refused attempt too — the banner is not a one-shot latch', async () => {
    loginFn = vi.fn().mockRejectedValue(new DekUnwrapError());

    renderLogin();
    await submit();
    await waitFor(() => expect(screen.getByText(KEY_UNAVAILABLE)).toBeInTheDocument());

    await submit();
    await waitFor(() => expect(screen.getByText(KEY_UNAVAILABLE)).toBeInTheDocument());
    expect(showBlockingErrorMock).not.toHaveBeenCalled();
    expect(logoutMock).not.toHaveBeenCalled();
  });

  // Mirrors e2e/login-offline.spec.ts T7 at the unit level: same cause
  // (a roster wrap that no longer unwraps), same expected copy
  // (AUTH.UNLOCK_FAILED, NOT ENCRYPTION.KEY_UNAVAILABLE — those diverged by
  // the second controller ruling), same "never invalid-credentials" guard.
  it('refuses an offline login with AUTH.UNLOCK_FAILED (inline banner, no dialog, no sign-out) when loginOffline cannot unwrap the device DEK', async () => {
    isRosterProvisionedMock.mockReturnValue(true);
    loginOfflineFn = vi.fn().mockRejectedValue(new DekUnwrapError());

    renderLogin();
    await submit();

    await waitFor(() => {
      expect(screen.getByText(UNLOCK_FAILED)).toBeInTheDocument();
    });
    expect(screen.queryByText('Usuario o contraseña inválidos')).not.toBeInTheDocument();
    expect(screen.queryByText(KEY_UNAVAILABLE)).not.toBeInTheDocument();
    expect(showBlockingErrorMock).not.toHaveBeenCalled();
    expect(logoutMock).not.toHaveBeenCalled();
  });
});
