import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { IntlProvider } from 'react-intl';
import messages from '~/shared/lib/i18n/es';
import { DekUnwrapError } from '~/shared/lib/offline/dek-unwrap';

// device-wrapped-dek design (Task 5): a device holding encrypted data it
// cannot open must not be allowed to authenticate. This suite pins the
// login-screen consequence of `resolveDekForLogin` rejecting with
// `DekUnwrapError` (Task 3): the app-wide decryption-failure policy (Task 4)
// takes over — one blocking dialog naming the recovery routes, then sign-out
// — instead of the old inline `AUTH.UNLOCK_FAILED` message that left the
// (unrecoverable, `needsUnlock`-true) session standing.

const showBlockingErrorMock = vi.fn();
vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: (...args: unknown[]) => showBlockingErrorMock(...args),
}));

const logoutMock = vi.fn();
// Idiom from app-layout.test.tsx: `useAuthStore` must work BOTH as the
// selector-less hook call login.tsx makes (`useAuthStore()`) AND as the
// static `useAuthStore.getState()` the (real, unmocked)
// decryption-failure-policy module calls internally. A bare `vi.fn()` with
// no `.getState` — the shape login.test.tsx's neighbouring suite uses —
// would make `handleDecryptionFailure` throw `TypeError: ...getState is not
// a function`, so this suite cannot reuse that bare shape.
vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = vi.fn(() => ({
    login: loginFn,
    loginOffline: loginOfflineFn,
    isLoading: false,
  }));
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

  it('refuses the login and reports the reason when the online login cannot unwrap the device DEK', async () => {
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
      expect(showBlockingErrorMock).toHaveBeenCalledWith('Error', KEY_UNAVAILABLE);
    });
    expect(logoutMock).toHaveBeenCalledTimes(1);
    // The failure is about this device's key, not the stored ciphertext —
    // nothing is touched, let alone wiped, on a refused login.
    expect(localStorage.getItem(CATEGORIES_KEY)).toBe(SEEDED_BYTES);
  });

  it('still shows the ordinary invalid-credentials message on a wrong password — no dialog, no sign-out', async () => {
    loginFn = vi.fn().mockRejectedValue({ status: 401 });

    renderLogin();
    await submit();

    await waitFor(() => {
      expect(screen.getByText('Usuario o contraseña inválidos')).toBeInTheDocument();
    });
    expect(showBlockingErrorMock).not.toHaveBeenCalled();
    expect(logoutMock).not.toHaveBeenCalled();
  });

  it('reports a second refused attempt too — a fresh login attempt is not the latched parallel-read case', async () => {
    loginFn = vi.fn().mockRejectedValue(new DekUnwrapError());

    renderLogin();
    await submit();
    await waitFor(() => expect(showBlockingErrorMock).toHaveBeenCalledTimes(1));

    await submit();
    await waitFor(() => expect(showBlockingErrorMock).toHaveBeenCalledTimes(2));
  });

  it('refuses an offline login the same way when loginOffline cannot unwrap the device DEK', async () => {
    isRosterProvisionedMock.mockReturnValue(true);
    loginOfflineFn = vi.fn().mockRejectedValue(new DekUnwrapError());

    renderLogin();
    await submit();

    await waitFor(() => {
      expect(showBlockingErrorMock).toHaveBeenCalledWith('Error', KEY_UNAVAILABLE);
    });
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });
});
