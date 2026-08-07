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

const isRosterProvisionedMock = vi.fn();
vi.mock('~/shared/lib/offline/roster-store', () => ({
  isRosterProvisioned: () => isRosterProvisionedMock(),
}));

import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { ConnectivityService } from '~/shared/lib/auth/connectivity-service';
import LoginPage from '../login';
import type { UserModel } from '@store-mgmt/domain';

function makeUser(): UserModel {
  return {
    id: 'u1',
    login: 'ana',
    fullName: 'Ana',
    cellPhone: '',
    email: '',
    isActive: true,
    password: '',
    authToken: 'offline-session',
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

describe('LoginPage — offline mode fork (offline-auth-mode: "Mode switch, not a fallback")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ConnectivityService.isOnline).mockReturnValue(true);
  });

  describe('Suite A — provisioned device', () => {
    beforeEach(() => {
      isRosterProvisionedMock.mockReturnValue(true);
    });

    it('A1: offline+submit calls loginOffline and navigates home', async () => {
      const loginFn = vi.fn();
      const loginOfflineFn = vi.fn().mockResolvedValue(makeUser());
      vi.mocked(ConnectivityService.isOnline).mockReturnValue(false);
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
        expect(loginOfflineFn).toHaveBeenCalledWith('ana', 'secret');
      });
      expect(loginFn).not.toHaveBeenCalled();
    });

    it('A2: online+submit STILL goes offline — loginOffline called, online login never called', async () => {
      const loginFn = vi.fn();
      const loginOfflineFn = vi.fn().mockResolvedValue(makeUser());
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
        expect(loginOfflineFn).toHaveBeenCalledWith('ana', 'secret');
      });
      expect(loginFn).not.toHaveBeenCalled();
    });

    it('A3: wrong password shows AUTH.INVALID_CREDENTIALS, no navigation', async () => {
      const loginFn = vi.fn();
      const rejection = Object.assign(new Error('bad'), { name: 'OfflineInvalidPasswordError' });
      const loginOfflineFn = vi.fn().mockRejectedValue(rejection);
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
        expect(screen.getByText('Usuario o contraseña inválidos')).toBeInTheDocument();
      });
      expect(loginFn).not.toHaveBeenCalled();
    });
  });

  describe('Suite B — unprovisioned device (localStorage cleared, bare mock unmodified)', () => {
    beforeEach(() => {
      isRosterProvisionedMock.mockReturnValue(false);
    });

    it('B1: online+submit calls the online login action only, loginOffline never called', async () => {
      const loginFn = vi.fn().mockResolvedValue(makeUser());
      const loginOfflineFn = vi.fn();
      // Bare mock shape identical to login.test.tsx:53-62 — no `getState` key.
      renderLogin({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
        initialize: vi.fn(),
        setUser: vi.fn(),
        logout: vi.fn(),
        login: loginFn,
        loginOffline: loginOfflineFn,
      });

      await submit();

      await waitFor(() => {
        expect(loginFn).toHaveBeenCalledWith('ana', 'secret');
      });
      expect(loginOfflineFn).not.toHaveBeenCalled();
    });

    it('B2: offline+submit shows the existing AUTH.OFFLINE_LOGIN banner, neither action called', async () => {
      vi.mocked(ConnectivityService.isOnline).mockReturnValue(false);
      const loginFn = vi.fn();
      const loginOfflineFn = vi.fn();
      renderLogin({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
        initialize: vi.fn(),
        setUser: vi.fn(),
        logout: vi.fn(),
        login: loginFn,
        loginOffline: loginOfflineFn,
      });

      await submit();

      await waitFor(() => {
        expect(screen.getByText(/offline/i)).toBeInTheDocument();
      });
      expect(loginFn).not.toHaveBeenCalled();
      expect(loginOfflineFn).not.toHaveBeenCalled();
    });
  });
});
