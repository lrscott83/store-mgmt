import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

import { authHttpService } from '~/shared/lib/http/auth-http-service';
import { ConnectivityService } from '~/shared/lib/auth/connectivity-service';
import RegisterPage from '../register';

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText('Nombre Completo'), { target: { value: 'Jane Doe' } });
  fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'janedoe' } });
  fireEvent.change(screen.getByLabelText('Nombre de la tienda'), {
    target: { value: 'Jane Store' },
  });
  fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'jane@test.com' } });
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '+5491100000' } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Passw0rd!' } });
  fireEvent.change(screen.getByLabelText('Confirmar Contraseña'), {
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
    </IntlProvider>
  );
}

describe('RegisterPage — auth-http-register-parity call-site', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ConnectivityService.isOnline).mockReturnValue(true);
  });

  it('renders login and storeName inputs', () => {
    renderRegister();
    expect(screen.getByLabelText('Usuario')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre de la tienda')).toBeInTheDocument();
  });

  it('does not render a visible input for code', () => {
    renderRegister(['/register?code=ABC123']);
    expect(screen.queryByLabelText(/code/i)).not.toBeInTheDocument();
  });

  it('succeeded:false shows errors[0].description and does not navigate', async () => {
    vi.mocked(authHttpService.register).mockResolvedValue({
      succeeded: false,
      data: { login: 'janedoe', authToken: 'token', expiresIn: '2026-08-01T00:00:00Z' },
      message: '',
      actionCode: 400,
      errors: [{ code: 'LOGIN_TAKEN', description: 'Login already exists' }],
    });
    renderRegister();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      expect(screen.getByText('Login already exists')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('succeeded:true navigates to /login', async () => {
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
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });

  it('blocks submit on password/passwordConfirmation mismatch — register() never called', async () => {
    renderRegister();
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText('Confirmar Contraseña'), {
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
        expect.objectContaining({ code: 'ABC123' })
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
    expect(screen.getByLabelText('Nombre Completo')).toBeInTheDocument();
  });

  it('renders "Usuario" label (GENERAL.LOGIN)', () => {
    renderRegister();
    expect(screen.getByLabelText('Usuario')).toBeInTheDocument();
  });

  it('renders "Contraseña" label (GENERAL.PASSWORD)', () => {
    renderRegister();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
  });

  it('renders "Confirmar Contraseña" label (GENERAL.CONFIRM_PASSWORD)', () => {
    renderRegister();
    expect(screen.getByLabelText('Confirmar Contraseña')).toBeInTheDocument();
  });

  it('renders "Teléfono" label (GENERAL.CELL_PHONE)', () => {
    renderRegister();
    expect(screen.getByLabelText('Teléfono')).toBeInTheDocument();
  });

  it('renders "Correo" label (GENERAL.EMAIL)', () => {
    renderRegister();
    expect(screen.getByLabelText('Correo')).toBeInTheDocument();
  });

  it('renders "Nombre de la tienda" label (STORE.STORE_NAME)', () => {
    renderRegister();
    expect(screen.getByLabelText('Nombre de la tienda')).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText('Nombre Completo'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'janedoe' } });
    fireEvent.change(screen.getByLabelText('Nombre de la tienda'), {
      target: { value: 'Jane Store' },
    });
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '+5491100000' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'weak' } });
    fireEvent.change(screen.getByLabelText('Confirmar Contraseña'), {
      target: { value: 'weak' },
    });
    acceptTerms();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'La contraseña debe tener al menos 8 caracteres, un número y una letra en mayúscula'
        )
      ).toBeInTheDocument();
    });
  });

  it('shows password-mismatch error text (GENERAL.VALIDATION.INVALID_PASSWORD)', async () => {
    renderRegister();
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText('Confirmar Contraseña'), {
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
  });

  it('shows "Registrando..." on the submit button while loading (AUTH.REGISTERING)', async () => {
    let resolveRegister: (value: {
      succeeded: boolean;
      data: { login: string; authToken: string; expiresIn: string };
      message: string;
      actionCode: number;
      errors: { code: string; description: string }[];
    }) => void;
    vi.mocked(authHttpService.register).mockReturnValue(
      new Promise((resolve) => {
        resolveRegister = resolve;
      })
    );
    renderRegister();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Registrando...' })).toBeInTheDocument();
    });

    resolveRegister!({
      succeeded: true,
      data: { login: 'janedoe', authToken: 'token', expiresIn: '2026-08-01T00:00:00Z' },
      message: '',
      actionCode: 0,
      errors: [],
    });
  });

  it('shows the offline banner text exactly (REGISTRATION.OFFLINE_BANNER)', async () => {
    vi.mocked(ConnectivityService.isOnline).mockReturnValue(false);
    renderRegister();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      expect(
        screen.getByText('Estás offline. Se requiere conexión para registrarte.')
      ).toBeInTheDocument();
    });
  });

  it('shows "Algo salió mal" fallback in Spanish on generic network error (REGISTRATION.UNEXPECTED_ERROR)', async () => {
    vi.mocked(authHttpService.register).mockRejectedValue(new Error('network down'));
    renderRegister();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'Ocurrió un error inesperado en la creación de la cuenta. Por favor, revise su conexión o contacte al equipo de soporte técnico.'
        )
      ).toBeInTheDocument();
    });
  });

  it('navigates straight to /login on success and never renders the interim REGISTRATION.SUCCESS_REDIRECT screen (Angular has no such screen)', async () => {
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
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
    expect(
      screen.queryByText('Cuenta creada. Redirigiendo al inicio de sesión…')
    ).not.toBeInTheDocument();
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
        'Usted debe aceptar los términos y condiciones para registrarse en el sistema.'
      )
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
    const password = screen.getByLabelText('Contraseña');
    const confirm = screen.getByLabelText('Confirmar Contraseña');
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
