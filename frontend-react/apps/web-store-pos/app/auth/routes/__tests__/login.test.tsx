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

import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { ConnectivityService } from '~/shared/lib/auth/connectivity-service';
import { preloadHeavyChunks } from '~/shared/lib/pwa/preload-heavy-chunks';
import LoginPage from '../login';
import type { UserModel } from '@store-mgmt/domain';

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
  };
}

function renderLogin(loginFn = vi.fn()) {
  const mockStore = {
    user: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    initialize: vi.fn(),
    setUser: vi.fn(),
    logout: vi.fn(),
    login: loginFn,
  };
  vi.mocked(useAuthStore).mockReturnValue(mockStore);
  return render(
    <IntlProvider locale="es" messages={messages}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </IntlProvider>
  );
}

describe('LoginPage (AUTH-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ConnectivityService.isOnline).mockReturnValue(true);
  });

  it('renders login form with email and password fields', () => {
    renderLogin();
    // GENERAL.LOGIN = "Usuario" (view-text-parity: forced literal parity, not AUTH.EMAIL)
    expect(screen.getByLabelText('Usuario')).toBeInTheDocument();
    // "Contraseña" is the Spanish label for password
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
    // "Iniciar sesión" is the Spanish text for the submit button
    expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeInTheDocument();
  });

  it('shows validation error when form submitted empty', async () => {
    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    await waitFor(() => {
      // AUTH.EMAIL_REQUIRED = "El email es requerido"
      // AUTH.PASSWORD_REQUIRED = "La contraseña es requerida"
      const errors = screen.getAllByText(/requerido|requerida/i);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  it('calls login action on valid submit — AUTH-01 happy path', async () => {
    const loginFn = vi.fn().mockResolvedValue(makeUser());
    renderLogin(loginFn);

    fireEvent.change(screen.getByLabelText('Usuario'), {
      target: { value: 'user@test.com' },
    });
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(loginFn).toHaveBeenCalledWith('user@test.com', 'password123');
    });
  });

  // PWA-PRELOAD-1: mirrors Angular's login.component.ts:171 submit() success
  // path, which calls navigateToUserHome() -> preloadHeavyChunks().
  it('preloads the heavy route chunks on successful login (AUTH-01 + PWA-PRELOAD-1)', async () => {
    const loginFn = vi.fn().mockResolvedValue(makeUser());
    renderLogin(loginFn);

    fireEvent.change(screen.getByLabelText('Usuario'), {
      target: { value: 'user@test.com' },
    });
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(preloadHeavyChunks).toHaveBeenCalledTimes(1);
    });
  });

  it('shows offline banner when device is offline — AUTH-01 offline scenario', async () => {
    vi.mocked(ConnectivityService.isOnline).mockReturnValue(false);
    renderLogin();

    fireEvent.change(screen.getByLabelText('Usuario'), {
      target: { value: 'user@test.com' },
    });
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    await waitFor(() => {
      // AUTH.OFFLINE_LOGIN = "Estás offline. Se requiere conexión para iniciar sesión."
      expect(screen.getByText(/offline/i)).toBeInTheDocument();
    });
  });

  it('displays error message from failed login', async () => {
    const loginFn = vi.fn().mockRejectedValue({ status: 401 });
    renderLogin(loginFn);

    fireEvent.change(screen.getByLabelText('Usuario'), {
      target: { value: 'user@test.com' },
    });
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: 'wrong' },
    });
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    await waitFor(() => {
      // AUTH.INVALID_CREDENTIALS = "Email o contraseña inválidos"
      expect(screen.getByText(/inválidos|contraseña/i)).toBeInTheDocument();
    });
  });

  it('links to register page', () => {
    renderLogin();
    // AUTH.REGISTER = "Crear cuenta"
    expect(screen.getByRole('link', { name: /crear cuenta/i })).toBeInTheDocument();
  });
});

describe('LoginPage — view-text-parity: identifier label forced literal parity (GENERAL.LOGIN)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ConnectivityService.isOnline).mockReturnValue(true);
  });

  it('renders the identifier label as exactly "Usuario", not "Email"', () => {
    renderLogin();
    expect(screen.getByLabelText('Usuario')).toBeInTheDocument();
    expect(screen.queryByText('Email')).not.toBeInTheDocument();
  });

  it('keeps input type="email" and autoComplete="email" unchanged', () => {
    renderLogin();
    const input = screen.getByLabelText('Usuario');
    expect(input).toHaveAttribute('type', 'email');
    expect(input).toHaveAttribute('autoComplete', 'email');
  });
});
