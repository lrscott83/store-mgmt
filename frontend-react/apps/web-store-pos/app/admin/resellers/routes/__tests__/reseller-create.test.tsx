import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';

// ─── react-router mock ────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useBlocker: vi.fn().mockReturnValue({ state: 'unblocked' }),
}));

// ─── superAdminLoader mock ────────────────────────────────────────────────────

vi.mock('~/auth/routes/loaders', () => ({
  superAdminLoader: vi.fn().mockResolvedValue(null),
}));

// ─── resellerHttpService mock ─────────────────────────────────────────────────

vi.mock('~/admin/resellers/lib/services/reseller-http-service', () => ({
  resellerHttpService: {
    createReseller: vi.fn(),
  },
}));

// ─── useUnsavedChangesPrompt mock ─────────────────────────────────────────────

const mockUseUnsavedChangesPrompt = vi.fn();
vi.mock('~/shared/lib/hooks/use-unsaved-changes-prompt', () => ({
  useUnsavedChangesPrompt: (isDirty: boolean) => mockUseUnsavedChangesPrompt(isDirty),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

async function renderPage() {
  const { ResellerCreatePage } = await import('../reseller-create');
  return render(
    <Wrapper>
      <ResellerCreatePage />
    </Wrapper>
  );
}

function fillValidForm() {
  fireEvent.change(screen.getByLabelText(esMessages['GENERAL.FULL_NAME']), {
    target: { value: 'Jane Doe' },
  });
  fireEvent.change(screen.getByLabelText(esMessages['USERS.LOGIN']), {
    target: { value: 'janedoe' },
  });
  fireEvent.change(screen.getByLabelText(esMessages['GENERAL.PASSWORD']), {
    target: { value: 'Password1' },
  });
  fireEvent.change(screen.getByLabelText(esMessages['USERS.CONFIRM_PASSWORD']), {
    target: { value: 'Password1' },
  });
  fireEvent.change(screen.getByLabelText(esMessages['GENERAL.CELL_PHONE']), {
    target: { value: '+53 5 123-4567' },
  });
  fireEvent.change(screen.getByLabelText(esMessages['GENERAL.EMAIL']), {
    target: { value: 'jane@example.com' },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-RESELLERS-CREATE-1 — exports
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerCreatePage — exports', () => {
  it('exports a named loader = superAdminLoader', async () => {
    const mod = await import('../reseller-create');
    expect(typeof mod.clientLoader).toBe('function');
  });

  it('exports ResellerCreatePage as default', async () => {
    const mod = await import('../reseller-create');
    expect(typeof mod.default).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PARITY-CREATE-1 — title matches Angular RESELLER.ADD_RESELLER value literally
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerCreatePage — title text parity (Req: Resellers L6 Text Parity)', () => {
  it('renders the title "Adicionar Gestor" (Angular RESELLER.ADD_RESELLER, via RESELLERS.CREATE_TITLE)', async () => {
    await renderPage();

    expect(esMessages['RESELLERS.CREATE_TITLE']).toBe('Adicionar Gestor');
    expect(screen.getByText('Adicionar Gestor')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-RESELLERS-CREATE-2 — renders 7 fields
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerCreatePage — fields', () => {
  it('renders fullName, login, password, confirmPassword, cellPhone, email, description fields', async () => {
    await renderPage();

    expect(screen.getByLabelText(esMessages['GENERAL.FULL_NAME'])).toBeInTheDocument();
    expect(screen.getByLabelText(esMessages['USERS.LOGIN'])).toBeInTheDocument();
    expect(screen.getByLabelText(esMessages['GENERAL.PASSWORD'])).toBeInTheDocument();
    expect(screen.getByLabelText(esMessages['USERS.CONFIRM_PASSWORD'])).toBeInTheDocument();
    expect(screen.getByLabelText(esMessages['GENERAL.CELL_PHONE'])).toBeInTheDocument();
    expect(screen.getByLabelText(esMessages['GENERAL.EMAIL'])).toBeInTheDocument();
    expect(screen.getByLabelText(/descripci/i)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-RESELLERS-CREATE-3 — PASSWORD_REGEX fail → RESELLERS.PASSWORD_POLICY, no call
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerCreatePage — password regex validation', () => {
  it('shows PASSWORD_POLICY error and does NOT call createReseller when password fails regex', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    await renderPage();

    fireEvent.change(screen.getByLabelText(esMessages['GENERAL.FULL_NAME']), {
      target: { value: 'Jane' },
    });
    fireEvent.change(screen.getByLabelText(esMessages['USERS.LOGIN']), {
      target: { value: 'jane' },
    });
    fireEvent.change(screen.getByLabelText(esMessages['GENERAL.PASSWORD']), {
      target: { value: 'weak' }, // fails regex
    });
    fireEvent.change(screen.getByLabelText(esMessages['USERS.CONFIRM_PASSWORD']), {
      target: { value: 'weak' },
    });
    fireEvent.change(screen.getByLabelText(esMessages['GENERAL.CELL_PHONE']), {
      target: { value: '+53 5 123-4567' },
    });

    fireEvent.submit(screen.getByRole('button', { name: esMessages['GENERAL.ADD'] }).closest('form')!);

    await waitFor(() => {
      expect(screen.getByText(esMessages['RESELLERS.PASSWORD_POLICY'])).toBeInTheDocument();
    });

    expect(resellerHttpService.createReseller).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-RESELLERS-CREATE-4 — mismatch → RESELLERS.PASSWORDS_MUST_MATCH, no call
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerCreatePage — password mismatch validation', () => {
  it('shows PASSWORDS_MUST_MATCH and does NOT call createReseller when passwords differ', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    await renderPage();

    fireEvent.change(screen.getByLabelText(esMessages['GENERAL.FULL_NAME']), {
      target: { value: 'Jane' },
    });
    fireEvent.change(screen.getByLabelText(esMessages['USERS.LOGIN']), {
      target: { value: 'jane' },
    });
    fireEvent.change(screen.getByLabelText(esMessages['GENERAL.PASSWORD']), {
      target: { value: 'Password1' },
    });
    fireEvent.change(screen.getByLabelText(esMessages['USERS.CONFIRM_PASSWORD']), {
      target: { value: 'Password2' }, // mismatch
    });
    fireEvent.change(screen.getByLabelText(esMessages['GENERAL.CELL_PHONE']), {
      target: { value: '+53 5 123-4567' },
    });

    fireEvent.submit(screen.getByRole('button', { name: esMessages['GENERAL.ADD'] }).closest('form')!);

    await waitFor(() => {
      expect(screen.getByText(esMessages['RESELLERS.PASSWORDS_MUST_MATCH'])).toBeInTheDocument();
    });

    expect(resellerHttpService.createReseller).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-RESELLERS-CREATE-5 — bad phone → RESELLERS.PHONE_FORMAT, no call
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerCreatePage — phone format validation', () => {
  it('shows PHONE_FORMAT error and does NOT call createReseller when phone is invalid', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    await renderPage();

    fireEvent.change(screen.getByLabelText(esMessages['GENERAL.FULL_NAME']), {
      target: { value: 'Jane' },
    });
    fireEvent.change(screen.getByLabelText(esMessages['USERS.LOGIN']), {
      target: { value: 'jane' },
    });
    fireEvent.change(screen.getByLabelText(esMessages['GENERAL.PASSWORD']), {
      target: { value: 'Password1' },
    });
    fireEvent.change(screen.getByLabelText(esMessages['USERS.CONFIRM_PASSWORD']), {
      target: { value: 'Password1' },
    });
    fireEvent.change(screen.getByLabelText(esMessages['GENERAL.CELL_PHONE']), {
      target: { value: '12345' }, // invalid phone
    });

    fireEvent.submit(screen.getByRole('button', { name: esMessages['GENERAL.ADD'] }).closest('form')!);

    await waitFor(() => {
      expect(screen.getByText(esMessages['RESELLERS.PHONE_FORMAT'])).toBeInTheDocument();
    });

    expect(resellerHttpService.createReseller).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-RESELLERS-CREATE-6 — valid → createReseller + navigate /admin/resellers
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerCreatePage — successful submit', () => {
  it('calls createReseller and navigates to /admin/resellers on success', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.createReseller).mockResolvedValue({
      succeeded: true,
      data: true,
      message: '',
      actionCode: 0,
      errors: [],
    });

    await renderPage();
    fillValidForm();

    fireEvent.submit(screen.getByRole('button', { name: esMessages['GENERAL.ADD'] }).closest('form')!);

    await waitFor(() => {
      expect(resellerHttpService.createReseller).toHaveBeenCalledWith(
        expect.objectContaining({
          fullName: 'Jane Doe',
          login: 'janedoe',
          password: 'Password1',
          cellPhone: '+53 5 123-4567',
          email: 'jane@example.com',
        })
      );
      expect(mockNavigate).toHaveBeenCalledWith('/admin/resellers');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-RESELLERS-CREATE-7 — !succeeded → errors[0].description inline
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerCreatePage — server-side error', () => {
  it('shows errors[0].description when succeeded is false', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.createReseller).mockResolvedValue({
      succeeded: false,
      data: false,
      message: '',
      actionCode: 0,
      errors: [{ code: 'ERR01', description: 'Login already exists' }],
    });

    await renderPage();
    fillValidForm();

    fireEvent.submit(screen.getByRole('button', { name: esMessages['GENERAL.ADD'] }).closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Login already exists')).toBeInTheDocument();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-RESELLERS-CREATE-8 — throw → RESELLERS.ERROR
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerCreatePage — HTTP throw', () => {
  it('shows RESELLERS.ERROR when createReseller throws', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.createReseller).mockRejectedValue(new Error('Network error'));

    await renderPage();
    fillValidForm();

    fireEvent.submit(screen.getByRole('button', { name: esMessages['GENERAL.ADD'] }).closest('form')!);

    await waitFor(() => {
      expect(screen.getByText(esMessages['RESELLERS.ERROR'])).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-RESELLERS-CREATE-10 — submit button disabled while pristine (Angular parity)
// Angular: [disabled]="formGroup.pristine" on create-reseller.component.html line 114
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerCreatePage — submit disabled while pristine', () => {
  it('submit button is disabled on initial render (form pristine)', async () => {
    await renderPage();

    const submitBtn = screen.getByRole('button', { name: esMessages['GENERAL.ADD'] });
    expect(submitBtn).toBeDisabled();
  });

  it('submit button becomes enabled after any field is changed', async () => {
    await renderPage();

    fireEvent.change(screen.getByLabelText(esMessages['GENERAL.FULL_NAME']), {
      target: { value: 'Jane' },
    });

    const submitBtn = screen.getByRole('button', { name: esMessages['GENERAL.ADD'] });
    expect(submitBtn).not.toBeDisabled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-RESELLERS-CREATE-9 — useUnsavedChangesPrompt called with truthy isDirty
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerCreatePage — unsaved changes guard', () => {
  it('calls useUnsavedChangesPrompt with truthy isDirty after typing', async () => {
    await renderPage();

    fireEvent.change(screen.getByLabelText(esMessages['GENERAL.FULL_NAME']), {
      target: { value: 'Typing something' },
    });

    await waitFor(() => {
      const calls = mockUseUnsavedChangesPrompt.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0]).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// password visibility toggle (create-reseller.component.html:42-47,64-69 parity)
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerCreatePage — password visibility toggle', () => {
  // Angular binds a SINGLE showPassword boolean to password + confirmPassword
  // (two buttons, one shared state) — both flip together on either click.
  it('password and confirmPassword share one toggle state (both flip together)', async () => {
    await renderPage();
    const password = screen.getByLabelText(esMessages['GENERAL.PASSWORD']);
    const confirm = screen.getByLabelText(esMessages['USERS.CONFIRM_PASSWORD']);
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
  });
});

describe('ResellerCreatePage — submit renders as fab (create-reseller.component.html:95 parity)', () => {
  it('renders the submit control as a fab (Button variant="fab"), not a plain button', async () => {
    await renderPage();
    const submit = screen.getByRole('button', { name: esMessages['GENERAL.ADD'] });
    expect(submit).toHaveClass('rounded-full');
    expect(submit).not.toHaveClass('rounded');
  });

  // create-reseller.component.html:115 — the fab carries a leading `add` mat-icon.
  it('renders PlusIcon inside the submit fab', async () => {
    await renderPage();
    const submit = screen.getByRole('button', { name: esMessages['GENERAL.ADD'] });
    const path = submit.querySelector('svg path')?.getAttribute('d');
    expect(path).toBe('M12 4.5v15m7.5-7.5h-15');
  });
});
