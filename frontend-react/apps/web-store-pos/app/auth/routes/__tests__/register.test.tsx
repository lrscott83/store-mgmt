import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { IntlProvider } from 'react-intl';
import messages from '~/shared/lib/i18n/es';

// ─── react-router mock (keep real useSearchParams, mock only useNavigate) ────

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ─── authHttpService mock ──────────────────────────────────────────────────

vi.mock('~/shared/lib/http/auth-http-service', () => ({
  authHttpService: {
    register: vi.fn(),
  },
}));

// ─── ConnectivityService mock ──────────────────────────────────────────────

vi.mock('~/shared/lib/auth/connectivity-service', () => ({
  ConnectivityService: {
    isOnline: vi.fn().mockReturnValue(true),
  },
}));

// Register surfaces form-level errors via the blocking popup wrapper, never
// as an inline banner — mock the wrapper so failure tests are deterministic.
vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: vi.fn(),
}));

// ─── Auth store mock (auto-login after registration, 2026-09-28) ────────────
//
// A successful registration now opens the session through the store's own
// `login` (the register response's token carries no DEK wrap, so it cannot
// start a usable session on its own). Without this mock every test that
// resolves a successful register would run the REAL store — real /me and DEK
// provisioning — instead of asserting the call-site.
const mockSignIn = vi.fn();
vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: () => ({ login: mockSignIn }),
}));

// Home resolution is a real async service lookup (product repository over the
// encrypted local store). Stubbed so the destination is deterministic here;
// the real resolver has its own suite (user-home.test.ts).
vi.mock('~/shared/lib/auth/user-home', () => ({
  resolveUserHomePath: vi.fn().mockResolvedValue('/sales/products'),
}));

vi.mock('~/shared/lib/usage/store-usage-tracker', () => ({
  armTracking: vi.fn(),
}));

vi.mock('~/shared/lib/pwa/preload-heavy-chunks', () => ({
  preloadHeavyChunks: vi.fn(),
}));

import { authHttpService } from '~/shared/lib/http/auth-http-service';
import { ConnectivityService } from '~/shared/lib/auth/connectivity-service';
import { showBlockingError } from '~/shared/lib/blocking-alert';
import { armTracking } from '~/shared/lib/usage/store-usage-tracker';
import RegisterPage from '../register';
import type { BaseResponseModel, RegisterAuthModel } from '@store-mgmt/domain';

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText('Nombre Completo (requerido)'), { target: { value: 'Jane Doe' } });
  fireEvent.change(screen.getByLabelText('Usuario (requerido)'), { target: { value: 'janedoe' } });
  fireEvent.change(screen.getByLabelText('Nombre de la tienda (requerido)'), {
    target: { value: 'Jane Store' },
  });
  fireEvent.change(screen.getByLabelText('Correo (opcional)'), { target: { value: 'jane@test.com' } });
  fireEvent.change(screen.getByLabelText('Teléfono (requerido)'), { target: { value: '+5491100000' } });
  fireEvent.change(screen.getByLabelText('Contraseña (requerido)'), { target: { value: 'Passw0rd!' } });
  fireEvent.change(screen.getByLabelText('Confirmar Contraseña (requerido)'), {
    target: { value: 'Passw0rd!' },
  });
  acceptTerms();
}

/** Toggles the terms-acceptance checkbox on — required before submit is enabled. */
function acceptTerms() {
  fireEvent.click(screen.getByRole('checkbox'));
}

function renderRegister(initialEntries: string[] = ['/register']) {
  return render(
    <IntlProvider locale="es" messages={messages}>
      <MemoryRouter initialEntries={initialEntries}>
        <RegisterPage />
      </MemoryRouter>
    </IntlProvider>,
  );
}

// ─── Auto-login fixtures (2026-09-28) ───────────────────────────────────────

/** Resolves the register call the way the backend does on success (HTTP 201). */
function stubSuccessfulRegister() {
  vi.mocked(authHttpService.register).mockResolvedValue({
    succeeded: true,
    data: { login: 'janedoe', authToken: 'token', expiresIn: '2026-08-01T00:00:00Z' },
    message: '',
    actionCode: 0,
    errors: [],
  });
}

/** The store's `login` action resolves with the hydrated user. */
function stubSuccessfulSignIn() {
  mockSignIn.mockResolvedValue({
    id: 'user-1',
    login: 'janedoe',
    fullName: 'Jane Doe',
    selectedStoreId: 'store-1',
  });
}

describe('RegisterPage — auth-http-register-parity call-site', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ConnectivityService.isOnline).mockReturnValue(true);
    stubSuccessfulSignIn();
  });

  it('renders login and storeName inputs', () => {
    renderRegister();
    expect(screen.getByLabelText('Usuario (requerido)')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre de la tienda (requerido)')).toBeInTheDocument();
  });

  it('does not render a visible input for code', () => {
    renderRegister(['/register?code=ABC123']);
    expect(screen.queryByLabelText(/code/i)).not.toBeInTheDocument();
  });

  // Backend contract: AuthController.RegisterAsync returns Created(...) on success and
  // BadRequest(result) on EVERY failure (AuthController.cs:90-102) — a succeeded:false
  // envelope therefore NEVER resolves; it always arrives as an axios rejection whose body
  // is { succeeded:false, data:null, message:null, errors:[{code,description}], actionCode }.
  it('HTTP 400 rejection surfaces errors[0].description in the popup and does not navigate', async () => {
    vi.mocked(authHttpService.register).mockRejectedValue({
      response: {
        status: 400,
        data: {
          succeeded: false,
          data: null,
          message: null,
          actionCode: 400,
          errors: [{ code: 'Login', description: 'Login already exists' }],
        },
      },
    });
    renderRegister();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      expect(vi.mocked(showBlockingError)).toHaveBeenCalledWith(
        messages['GENERAL.RESPONSE.ERROR_TITLE'],
        'Login already exists',
      );
    });
    // The error lives ONLY in the popup — never painted inline in the view.
    expect(screen.queryByText('Login already exists')).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // Guard the array — an empty/missing errors[] on a 400 must not throw and falls back to
  // the existing generic copy (ResponseResult.Message is always null, so there is no other
  // signal to read).
  it('HTTP 400 rejection with an empty errors[] falls back to the generic validation-error copy', async () => {
    vi.mocked(authHttpService.register).mockRejectedValue({
      response: {
        status: 400,
        data: { succeeded: false, data: null, message: null, actionCode: 400, errors: [] },
      },
    });
    renderRegister();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      expect(vi.mocked(showBlockingError)).toHaveBeenCalledWith(
        messages['GENERAL.RESPONSE.ERROR_TITLE'],
        'Error de validación. Por favor, revise sus datos.',
      );
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('succeeded:true signs the new owner in and navigates to their home view, never to /login (auto-login, 2026-09-28)', async () => {
    stubSuccessfulRegister();
    renderRegister();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/sales/products');
    });
    // The session is opened with the credentials just typed — this is what makes
    // the new device able to decrypt its own store.
    expect(mockSignIn).toHaveBeenCalledWith('janedoe', 'Passw0rd!');
    expect(mockNavigate).not.toHaveBeenCalledWith('/login');
  });

  it('blocks submit on password/passwordConfirmation mismatch — register() never called', async () => {
    renderRegister();
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText('Confirmar Contraseña (requerido)'), {
      target: { value: 'Different1!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      expect(screen.getByText('Las contraseñas no son iguales')).toBeInTheDocument();
    });
    expect(authHttpService.register).not.toHaveBeenCalled();
  });

  it('?code=ABC123 flows into the register payload', async () => {
    vi.mocked(authHttpService.register).mockResolvedValue({
      succeeded: true,
      data: { login: 'janedoe', authToken: 'token', expiresIn: '2026-08-01T00:00:00Z' },
      message: '',
      actionCode: 0,
      errors: [],
    });
    renderRegister(['/register?code=ABC123']);
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      expect(authHttpService.register).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'ABC123' }),
      );
    });
  });

  it('register() payload never includes passwordConfirmation', async () => {
    vi.mocked(authHttpService.register).mockResolvedValue({
      succeeded: true,
      data: { login: 'janedoe', authToken: 'token', expiresIn: '2026-08-01T00:00:00Z' },
      message: '',
      actionCode: 0,
      errors: [],
    });
    renderRegister();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      expect(authHttpService.register).toHaveBeenCalled();
    });
    const payload = vi.mocked(authHttpService.register).mock.calls[0][0];
    expect(payload).not.toHaveProperty('passwordConfirmation');
  });
});

describe('RegisterPage — view-text-parity: heading/already-account/signin-link/submit button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ConnectivityService.isOnline).mockReturnValue(true);
  });

  it('renders heading "Creación de cuenta" (REGISTRATION.WELCOME)', () => {
    renderRegister();
    expect(screen.getByRole('heading', { name: 'Creación de cuenta' })).toBeInTheDocument();
  });

  it('renders already-account text "¿Ya tienes una cuenta?" (REGISTRATION.ALREADY_ACCOUNT)', () => {
    renderRegister();
    expect(screen.getByText('¿Ya tienes una cuenta?')).toBeInTheDocument();
  });

  it('renders sign-in link "Entra" (REGISTRATION.SIGNIN_LINK)', () => {
    renderRegister();
    expect(screen.getByRole('link', { name: 'Entra' })).toBeInTheDocument();
  });

  it('renders submit button "Registrar" (REGISTRATION.SIGNUP_BUTTON) when idle', () => {
    renderRegister();
    expect(screen.getByRole('button', { name: 'Registrar' })).toBeInTheDocument();
  });
});

describe('RegisterPage — view-text-parity: field labels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ConnectivityService.isOnline).mockReturnValue(true);
  });

  it('renders "Nombre Completo" label (GENERAL.FULL_NAME)', () => {
    renderRegister();
    expect(screen.getByLabelText('Nombre Completo (requerido)')).toBeInTheDocument();
  });

  it('renders "Usuario" label (GENERAL.LOGIN)', () => {
    renderRegister();
    expect(screen.getByLabelText('Usuario (requerido)')).toBeInTheDocument();
  });

  it('renders "Contraseña" label (GENERAL.PASSWORD)', () => {
    renderRegister();
    expect(screen.getByLabelText('Contraseña (requerido)')).toBeInTheDocument();
  });

  it('renders "Confirmar Contraseña" label (GENERAL.CONFIRM_PASSWORD)', () => {
    renderRegister();
    expect(screen.getByLabelText('Confirmar Contraseña (requerido)')).toBeInTheDocument();
  });

  it('renders "Teléfono" label (GENERAL.CELL_PHONE)', () => {
    renderRegister();
    expect(screen.getByLabelText('Teléfono (requerido)')).toBeInTheDocument();
  });

  it('renders "Correo" label (GENERAL.EMAIL)', () => {
    renderRegister();
    expect(screen.getByLabelText('Correo (opcional)')).toBeInTheDocument();
  });

  it('renders "Nombre de la tienda" label (STORE.STORE_NAME)', () => {
    renderRegister();
    expect(screen.getByLabelText('Nombre de la tienda (requerido)')).toBeInTheDocument();
  });
});

describe('RegisterPage — view-text-parity: validate() error strings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ConnectivityService.isOnline).mockReturnValue(true);
  });

  it('shows all 6 required-field errors byte-identical to GENERAL.VALIDATION.REQUIRED interpolation', async () => {
    renderRegister();
    acceptTerms();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      expect(screen.getByText('Nombre Completo es requerido')).toBeInTheDocument();
      expect(screen.getByText('Usuario es requerido')).toBeInTheDocument();
      expect(screen.getByText('Teléfono es requerido')).toBeInTheDocument();
      expect(screen.getByText('Nombre de la tienda es requerido')).toBeInTheDocument();
      expect(screen.getByText('Contraseña es requerido')).toBeInTheDocument();
      expect(screen.getByText('Confirmar Contraseña es requerido')).toBeInTheDocument();
    });
  });

  it('shows password-policy error text (GENERAL.VALIDATION.PASSWORD_POLICY)', async () => {
    renderRegister();
    fireEvent.change(screen.getByLabelText('Nombre Completo (requerido)'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText('Usuario (requerido)'), { target: { value: 'janedoe' } });
    fireEvent.change(screen.getByLabelText('Nombre de la tienda (requerido)'), {
      target: { value: 'Jane Store' },
    });
    fireEvent.change(screen.getByLabelText('Teléfono (requerido)'), { target: { value: '+5491100000' } });
    fireEvent.change(screen.getByLabelText('Contraseña (requerido)'), { target: { value: 'weak' } });
    fireEvent.change(screen.getByLabelText('Confirmar Contraseña (requerido)'), {
      target: { value: 'weak' },
    });
    acceptTerms();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'La contraseña debe tener al menos 8 caracteres, un número y una letra en mayúscula',
        ),
      ).toBeInTheDocument();
    });
  });

  it('shows password-mismatch error text (GENERAL.VALIDATION.INVALID_PASSWORD)', async () => {
    renderRegister();
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText('Confirmar Contraseña (requerido)'), {
      target: { value: 'Different1!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      expect(screen.getByText('Las contraseñas no son iguales')).toBeInTheDocument();
    });
  });
});

describe('RegisterPage — view-text-parity: loading/offline/success copy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ConnectivityService.isOnline).mockReturnValue(true);
    stubSuccessfulSignIn();
  });

  it('shows "Registrando..." on the submit button while loading (AUTH.REGISTERING)', async () => {
    let resolveRegister: (value: BaseResponseModel<RegisterAuthModel>) => void;
    vi.mocked(authHttpService.register).mockReturnValue(
      new Promise((resolve) => {
        resolveRegister = resolve;
      }),
    );
    renderRegister();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Registrando...' })).toBeInTheDocument();
    });

    await act(async () => {
      resolveRegister!({
        succeeded: true,
        data: { login: 'janedoe', authToken: 'token', expiresIn: '2026-08-01T00:00:00Z' },
        message: '',
        actionCode: 0,
        errors: [],
      });
    });
  });

  it('shows the offline banner text exactly (REGISTRATION.OFFLINE_BANNER)', async () => {
    vi.mocked(ConnectivityService.isOnline).mockReturnValue(false);
    renderRegister();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      expect(
        screen.getByText('Estás sin conexión. Se requiere conexión para registrarte.'),
      ).toBeInTheDocument();
    });
  });

  it('shows rate-limit copy on a 429 response, distinct from the unexpected-error fallback', async () => {
    vi.mocked(authHttpService.register).mockRejectedValue({ response: { status: 429 } });
    renderRegister();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      expect(vi.mocked(showBlockingError)).toHaveBeenCalledWith(
        messages['GENERAL.RESPONSE.ERROR_TITLE'],
        'Demasiados intentos de registro. Por favor, espere unos minutos antes de volver a intentar.',
      );
    });
  });

  it('shows "Algo salió mal" fallback in Spanish on generic network error (REGISTRATION.UNEXPECTED_ERROR)', async () => {
    vi.mocked(authHttpService.register).mockRejectedValue(new Error('network down'));
    renderRegister();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      expect(vi.mocked(showBlockingError)).toHaveBeenCalledWith(
        messages['GENERAL.RESPONSE.ERROR_TITLE'],
        'Ocurrió un error inesperado en la creación de la cuenta. Por favor, revise su conexión o contacte al equipo de soporte técnico.',
      );
    });
  });

  it('opens the session and lands on the owner home view, and never renders the interim REGISTRATION.SUCCESS_REDIRECT screen (Angular has no such screen)', async () => {
    stubSuccessfulRegister();
    renderRegister();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/sales/products');
    });
    expect(
      screen.queryByText('Cuenta creada. Redirigiendo al inicio de sesión…'),
    ).not.toBeInTheDocument();
  });
});

// ─── Auto-login after registration (product decision 2026-09-28) ────────────
//
// A registration now leaves the owner signed in. The register response's own
// token cannot do that on its own (`AuthDto` leaves the DEK wraps empty on this
// path), so the session is opened through the store's `login` — the same path
// the login screen uses, and the one that carries the wrap a brand-new device
// needs to read its store. Losing that leg must never look like a failed
// registration: the account exists by then.
describe('RegisterPage — auto-login after a successful registration (2026-09-28)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ConnectivityService.isOnline).mockReturnValue(true);
  });

  it('signs in with the typed credentials, arms the usage tracker and lands on the home view', async () => {
    stubSuccessfulRegister();
    stubSuccessfulSignIn();
    renderRegister();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('janedoe', 'Passw0rd!');
    });
    expect(armTracking).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/sales/products');
    });
  });

  it('a failing sign-in keeps the account and sends the owner to /login with the honest message', async () => {
    stubSuccessfulRegister();
    // A locked/corrupt key is the realistic failure: DekUnwrapError means the
    // store's DEK could not be opened, and /login is where recovery lives.
    mockSignIn.mockRejectedValue(new Error('DekUnwrapError'));
    renderRegister();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      expect(vi.mocked(showBlockingError)).toHaveBeenCalledWith(
        messages['GENERAL.RESPONSE.ERROR_TITLE'],
        messages['REGISTRATION.AUTO_LOGIN_FAILED'],
      );
    });
    expect(mockNavigate).toHaveBeenCalledWith('/login');
    // The registration SUCCEEDED (HTTP 201 already happened) — its failure copy
    // must never be shown, or the owner would think the account was not created.
    expect(vi.mocked(showBlockingError)).not.toHaveBeenCalledWith(
      messages['GENERAL.RESPONSE.ERROR_TITLE'],
      messages['REGISTRATION.UNEXPECTED_ERROR'],
    );
  });

  it('does not attempt a sign-in when the registration itself is rejected', async () => {
    vi.mocked(authHttpService.register).mockRejectedValue({
      response: {
        status: 400,
        data: {
          succeeded: false,
          data: null,
          message: null,
          actionCode: 400,
          errors: [{ code: 'Login', description: 'Login already exists' }],
        },
      },
    });
    renderRegister();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      expect(vi.mocked(showBlockingError)).toHaveBeenCalledWith(
        messages['GENERAL.RESPONSE.ERROR_TITLE'],
        'Login already exists',
      );
    });
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('RegisterPage — terms-acceptance toggle (Angular parity: register.component.html:191-210, accept control)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ConnectivityService.isOnline).mockReturnValue(true);
  });

  it('renders the accept-conditions label and the terms-and-conditions link (REGISTRATION.ACCEPT_CONDITIONS / REGISTRATION.TERMS_CONDITIONS)', () => {
    renderRegister();
    expect(screen.getByText(/Estoy de acuerdo con los/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'términos y condiciones' });
    expect(link).toHaveAttribute('href', '/terms-conditions');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('renders the info-terms-conditions text (REGISTRATION.INFO_TERMS_CONDITIONS)', () => {
    renderRegister();
    expect(
      screen.getByText(
        'Usted debe aceptar los términos y condiciones para registrarse en el sistema.',
      ),
    ).toBeInTheDocument();
  });

  it('disables the submit button on initial render (accept off)', () => {
    renderRegister();
    expect(screen.getByRole('button', { name: 'Registrar' })).toBeDisabled();
  });

  it('enables the submit button after the user toggles accept on', () => {
    renderRegister();
    expect(screen.getByRole('button', { name: 'Registrar' })).toBeDisabled();
    acceptTerms();
    expect(screen.getByRole('button', { name: 'Registrar' })).not.toBeDisabled();
  });
});

describe('RegisterPage — password visibility toggle (register.component.html:100-103,122-125 parity)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ConnectivityService.isOnline).mockReturnValue(true);
  });

  // Angular binds a SINGLE showPassword boolean to BOTH inputs (two buttons,
  // one shared state) — clicking either toggle flips both fields together.
  it('password and confirm-password share one toggle state (both flip together)', () => {
    renderRegister();
    const password = screen.getByLabelText('Contraseña (requerido)');
    const confirm = screen.getByLabelText('Confirmar Contraseña (requerido)');
    expect(password).toHaveAttribute('type', 'password');
    expect(confirm).toHaveAttribute('type', 'password');

    const toggles = screen.getAllByRole('button', { name: 'Mostrar contraseña' });
    expect(toggles).toHaveLength(2);
    // EyeOffIcon (hidden) renders 1 <path>; EyeIcon (revealed) renders 2 — catches
    // an inverted icon even when the aria-label direction is still correct.
    expect(toggles[0].querySelectorAll('svg path')).toHaveLength(1);
    expect(toggles[1].querySelectorAll('svg path')).toHaveLength(1);

    fireEvent.click(toggles[0]);
    expect(password).toHaveAttribute('type', 'text');
    expect(confirm).toHaveAttribute('type', 'text');
    const revealedToggles = screen.getAllByRole('button', { name: 'Ocultar contraseña' });
    expect(revealedToggles).toHaveLength(2);
    expect(revealedToggles[0].querySelectorAll('svg path')).toHaveLength(2);
    expect(revealedToggles[1].querySelectorAll('svg path')).toHaveLength(2);

    fireEvent.click(revealedToggles[1]);
    expect(password).toHaveAttribute('type', 'password');
    expect(confirm).toHaveAttribute('type', 'password');
    const hiddenAgainToggles = screen.getAllByRole('button', { name: 'Mostrar contraseña' });
    expect(hiddenAgainToggles).toHaveLength(2);
    expect(hiddenAgainToggles[0].querySelectorAll('svg path')).toHaveLength(1);
  });
});

// register.component.html:207 — Angular renders the submit as a `mat-fab extended`
// (pill-shaped, elevated), not a plain rectangular button.
describe('RegisterPage — submit control renders as fab (register.component.html:207 parity)', () => {
  it('renders the submit control as a fab (Button variant="fab"), not a plain button', () => {
    renderRegister();
    const submit = screen.getByRole('button', { name: 'Registrar' });
    expect(submit).toHaveClass('rounded-full');
    expect(submit).not.toHaveClass('rounded-lg');
  });

  // register.component.html:208 — the fab carries a leading `lock_open` mat-icon.
  it('renders LockOpenIcon inside the submit fab', () => {
    renderRegister();
    const submit = screen.getByRole('button', { name: 'Registrar' });
    const path = submit.querySelector('svg path')?.getAttribute('d');
    expect(path).toContain('13.5 10.5V6.75');
  });
});

describe('RegisterPage — labels announce requiredness inline', () => {
  it('marks every required field with "(requerido)" and the only optional one with "(opcional)"', () => {
    renderRegister();

    for (const label of [
      'Nombre Completo (requerido)',
      'Usuario (requerido)',
      'Nombre de la tienda (requerido)',
      'Contraseña (requerido)',
      'Confirmar Contraseña (requerido)',
      'Teléfono (requerido)',
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    // email is the only field validate() lets through empty — saying so up front is
    // the point: a required marker on it would be a lie, and its absence here is what
    // tells the user the account can be created without one.
    expect(screen.getByLabelText('Correo (opcional)')).toBeInTheDocument();
    expect(screen.queryByLabelText('Correo (requerido)')).not.toBeInTheDocument();
  });

  it('keeps the terms checkbox marked as required, matching the disabled submit until it is ticked', () => {
    renderRegister();
    expect(screen.getByRole('checkbox').closest('label')).toHaveTextContent(
      messages['GENERAL.VALIDATION.REQUIRED_SUFFIX'],
    );
    expect(screen.getByRole('button', { name: 'Registrar' })).toBeDisabled();
  });
});

describe('RegisterPage — field order puts the contact pair below the credentials', () => {
  it('renders password, its confirmation, then phone, then email — in that DOM order', () => {
    renderRegister();

    const indexOf = (id: string) =>
      Array.prototype.indexOf.call(
        document.querySelectorAll('input'),
        document.getElementById(id)!,
      );

    expect(indexOf('password')).toBeLessThan(indexOf('passwordConfirmation'));
    expect(indexOf('passwordConfirmation')).toBeLessThan(indexOf('cellPhone'));
    expect(indexOf('cellPhone')).toBeLessThan(indexOf('email'));
  });

  it('keeps the identity fields above the credentials', () => {
    renderRegister();

    const indexOf = (id: string) =>
      Array.prototype.indexOf.call(
        document.querySelectorAll('input'),
        document.getElementById(id)!,
      );

    expect(indexOf('fullName')).toBeLessThan(indexOf('storeName'));
    expect(indexOf('storeName')).toBeLessThan(indexOf('login'));
    expect(indexOf('login')).toBeLessThan(indexOf('password'));
    expect(indexOf('email')).toBeLessThan(indexOf('acceptTerms'));
  });
});
