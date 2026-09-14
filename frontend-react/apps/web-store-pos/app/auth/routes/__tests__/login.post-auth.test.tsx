import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { IntlProvider } from 'react-intl';
import messages from '~/shared/lib/i18n/es';
import type { UserModel } from '@store-mgmt/domain';

// Client-side login failure classification (online path): after the backend
// DID respond (401/403/429/other status) or refused the body
// (loginRejectionDescription) or the DEK could not be unwrapped
// (DekUnwrapError), the remaining failures are CLIENT-side: post-auth steps
// after login+/me already succeeded, network drops with no server response,
// and unexpected device errors. Each must show a DISTINCT diagnostic message
// — never the generic AUTH.SERVER_ERROR, whose exact copy is pinned
// byte-for-byte by e2e/login-offline.spec.ts T6 (OFLINE branch, `loginOffline`)
// and therefore must not change.

vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('~/shared/lib/auth/connectivity-service', () => ({
  ConnectivityService: { isOnline: vi.fn().mockReturnValue(true) },
}));

vi.mock('~/shared/lib/pwa/preload-heavy-chunks', () => ({
  preloadHeavyChunks: vi.fn(),
}));

vi.mock('~/shared/lib/usage/store-usage-tracker', () => ({
  armTracking: vi.fn(),
}));

// Declared before `import LoginPage` below: vitest's SSR transform calls the
// mocked module's factory at the position of the import, so the variable must
// already be initialized when the factory first runs (same pattern as
// login.dek-refusal.test.tsx's `loginFn`).
let resolveUserHomePathMock = vi.fn();
vi.mock('~/shared/lib/auth/user-home', () => ({
  resolveUserHomePath: (...args: unknown[]) => resolveUserHomePathMock(...args),
}));

import { useAuthStore } from '~/shared/lib/stores/auth-store';
import LoginPage from '../login';

const SERVER_ERROR = 'Ocurrió un error. Inténtalo de nuevo.';

function makeUser(): UserModel {
  return {
    id: 'u1',
    login: 'user@test.com',
    fullName: 'Test User',
    cellPhone: '+1234567890',
    email: 'user@test.com',
    isActive: true,
    password: '',
    authToken: 'tok',
    refreshToken: 'ref',
    expiresIn: Date.now() + 1000000,
    roles: [],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: '',
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
  };
}

function renderLogin(loginFn: ReturnType<typeof vi.fn>) {
  vi.mocked(useAuthStore).mockReturnValue({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    initialize: vi.fn(),
    setUser: vi.fn(),
    logout: vi.fn(),
    login: loginFn,
  });
  return render(
    <IntlProvider locale="es" messages={messages}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </IntlProvider>,
  );
}

async function submit(login = 'user@test.com', password = 'password123') {
  fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: login } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));
}

describe('LoginPage — distinct client-side failure messages (online path)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveUserHomePathMock = vi.fn().mockResolvedValue('/sales/new');
  });

  it('shows the post-auth message when login+/me succeed but opening the home screen fails (the credentials WERE correct)', async () => {
    // login() + getMe resolve; the failure is purely client-side home
    // resolution (mirrors the real world: resolveUserHomePath reads product
    // storage and can throw; navigate can throw too).
    const loginFn = vi.fn().mockResolvedValue(makeUser());
    resolveUserHomePathMock = vi.fn().mockRejectedValue(new Error('IndexedDB root missing'));
    renderLogin(loginFn);
    await submit();

    await waitFor(() => {
      expect(
        screen.getByText(
          /Tus credenciales son correctas.*Falló al resolver la pantalla de inicio.*Detalle: IndexedDB root missing/s,
        ),
      ).toBeInTheDocument();
    });
    // The old behavior mislabeled this as a generic server error — that copy
    // must not appear here.
    expect(screen.queryByText(SERVER_ERROR)).not.toBeInTheDocument();
  });

  it('shows a network message when the request never reached the server (axios error with no status)', async () => {
    const loginFn = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('Network Error'), { isAxiosError: true, code: 'ERR_NETWORK', status: null }));
    renderLogin(loginFn);
    await submit();

    await waitFor(() => {
      expect(
        screen.getByText(
          /No se pudo conectar con el servidor.*Detalle: ERR_NETWORK: Network Error/s,
        ),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(SERVER_ERROR)).not.toBeInTheDocument();
  });

  it('shows a network message when the response interceptor stamped the rejection with isNetworkError', async () => {
    // api-client.ts's response interceptor tags its network/timeout rejections
    // with `isNetworkError` — the second signal the classifier accepts.
    const loginFn = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('Network Error'), { isNetworkError: true, code: 'ERR_BAD_NETWORK' }));
    renderLogin(loginFn);
    await submit();

    await waitFor(() => {
      expect(
        screen.getByText(/No se pudo conectar con el servidor.*Detalle: ERR_BAD_NETWORK/s),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(SERVER_ERROR)).not.toBeInTheDocument();
  });

  it('shows an unexpected-device message with the diagnostic detail for a plain client error', async () => {
    // The real auth-store client failure after a /me verdict kills the login
    // ("AUTH: failed to load user after login") — no status, not axios.
    const loginFn = vi.fn().mockRejectedValue(new Error('AUTH: failed to load user after login'));
    renderLogin(loginFn);
    await submit();

    await waitFor(() => {
      expect(
        screen.getByText(
          /Ocurrió un error inesperado en el dispositivo.*Detalle: AUTH: failed to load user after login/s,
        ),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(SERVER_ERROR)).not.toBeInTheDocument();
  });

  it('keeps the unchanged generic message when the BACKEND answered with an HTTP error we do not own copy for (500)', async () => {
    // Backend-returned → AUTH.SERVER_ERROR stays byte-for-byte (this is also
    // the offline-generic mapping pinned by e2e/login-offline T6).
    const loginFn = vi.fn().mockRejectedValue({ status: 500 });
    renderLogin(loginFn);
    await submit();

    await waitFor(() => {
      expect(screen.getByText(SERVER_ERROR)).toBeInTheDocument();
    });
    expect(screen.queryByText(/No se pudo conectar con el servidor/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ocurrió un error inesperado en el dispositivo/)).not.toBeInTheDocument();
  });

  it('keeps the invalid-credentials message on a 401 response', async () => {
    const loginFn = vi.fn().mockRejectedValue({ status: 401 });
    renderLogin(loginFn);
    await submit();

    await waitFor(() => {
      expect(screen.getByText('Usuario o contraseña incorrectos')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Tus credenciales son correctas/)).not.toBeInTheDocument();
    expect(screen.queryByText(SERVER_ERROR)).not.toBeInTheDocument();
  });
});