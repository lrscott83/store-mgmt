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
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
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
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText('Contraseña'), {
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
    fireEvent.change(screen.getByLabelText('Contraseña'), {
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
    fireEvent.change(screen.getByLabelText('Contraseña'), {
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
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'wrong' },
    });
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    await waitFor(() => {
      // AUTH.INVALID_CREDENTIALS = "Email o contraseña inválidos". Assert the
      // exact error text — a loose /contraseña/i regex also matches the
      // "Contraseña" password label, which is ambiguous (multiple elements).
      expect(screen.getByText('Email o contraseña inválidos')).toBeInTheDocument();
    });
  });

  // AUTH-ERR-PARITY: mirrors Angular login.component.ts:162-167 INVALID_ERROR path
  // (auth.service.ts:60-70). A HTTP-200 body-level failure (succeeded:false, e.g.
  // wrong credentials returned by LoginCommandHandler's ResponseResult.Failure)
  // carries the backend message in errors[0].description. auth-store rethrows it
  // tagged as `loginRejectionDescription`; login must surface the EXACT text, not
  // the generic AUTH.SERVER_ERROR.
  it('surfaces the exact backend error message on a body-level login rejection (INVALID_ERROR parity)', async () => {
    const rejection = Object.assign(new Error('rejected'), {
      loginRejectionDescription: 'El usuario o la contraseña no es correcta',
    });
    const loginFn = vi.fn().mockRejectedValue(rejection);
    renderLogin(loginFn);

    fireEvent.change(screen.getByLabelText('Usuario'), {
      target: { value: 'user@test.com' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'La autenticación no es válida por el siguiente error: El usuario o la contraseña no es correcta'
        )
      ).toBeInTheDocument();
    });
  });

  // AUTH-FLICKER: while the login flow is in-flight (login() -> getUserByToken()
  // -> resolveUserHomePath() -> navigate()), the login form must NOT reappear
  // between the individual API calls. The route holds a full-cover loading state
  // from submit until navigation unmounts it, so the user never sees the form
  // flash back after entering credentials.
  it('replaces the form with a loading state while the login flow is in-flight (no form flash)', async () => {
    let resolveLogin!: (u: UserModel) => void;
    const loginFn = vi.fn(
      () => new Promise<UserModel>((res) => { resolveLogin = res; })
    );
    renderLogin(loginFn);

    fireEvent.change(screen.getByLabelText('Usuario'), {
      target: { value: 'user@test.com' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    // Login promise still pending -> the form (submit button) is gone, replaced
    // by the loading indicator. Previously the button stayed mounted, so the
    // form was visible during the gaps between API calls.
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /iniciar sesión/i })
      ).not.toBeInTheDocument();
    });

    resolveLogin(makeUser());
  });

  it('links to register page', () => {
    renderLogin();
    // AUTH.REGISTER = "Crear cuenta"
    expect(screen.getByRole('link', { name: /crear cuenta/i })).toBeInTheDocument();
  });

  // PARITY-BUCKET-C: login.component.html:84-87 — showPassword toggle (visibility/
  // visibility_off mat-icon suffix). Default hidden, flips type + icon on click.
  it('password field defaults to hidden and toggles to visible on click (parity)', () => {
    renderLogin();
    const passwordInput = screen.getByLabelText('Contraseña');
    expect(passwordInput).toHaveAttribute('type', 'password');

    // EyeOffIcon (hidden state, `visibility_off`) renders a single crossed-eye
    // <path>; EyeIcon (revealed state, `visibility`) renders 2 <path> children
    // (eyeball outline + pupil). Asserting path count catches an inverted icon
    // even when the aria-label direction (Mostrar/Ocultar) is still correct.
    const toggle = screen.getByRole('button', { name: 'Mostrar contraseña' });
    expect(toggle.querySelectorAll('svg path')).toHaveLength(1);
    fireEvent.click(toggle);

    expect(passwordInput).toHaveAttribute('type', 'text');
    const revealed = screen.getByRole('button', { name: 'Ocultar contraseña' });
    expect(revealed).toBeInTheDocument();
    expect(revealed.querySelectorAll('svg path')).toHaveLength(2);

    fireEvent.click(revealed);
    expect(passwordInput).toHaveAttribute('type', 'password');
    const hiddenAgain = screen.getByRole('button', { name: 'Mostrar contraseña' });
    expect(hiddenAgain).toBeInTheDocument();
    expect(hiddenAgain.querySelectorAll('svg path')).toHaveLength(1);
  });

  // login.component.html:96 — Angular renders the submit as a `mat-fab extended`
  // (pill-shaped, elevated), not a plain rectangular button.
  it('renders the submit control as a fab (Button variant="fab"), not a plain button', () => {
    renderLogin();
    const submit = screen.getByRole('button', { name: /iniciar sesión/i });
    expect(submit).toHaveClass('rounded-full');
    expect(submit).not.toHaveClass('rounded-lg');
  });

  // login.component.html:97 — the fab carries a leading `login` mat-icon.
  it('renders LoginIcon inside the submit fab', () => {
    renderLogin();
    const submit = screen.getByRole('button', { name: /iniciar sesión/i });
    const path = submit.querySelector('svg path')?.getAttribute('d');
    expect(path).toContain('15.75 9V5.25');
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
