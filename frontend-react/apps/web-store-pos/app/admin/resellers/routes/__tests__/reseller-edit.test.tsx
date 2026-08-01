import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { BaseResponseModel, ReSeller } from '@store-mgmt/domain';

// ─── react-router mock ────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
const mockParams: { id?: string } = { id: 'r42' };

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockParams,
  useBlocker: vi.fn().mockReturnValue({ state: 'unblocked' }),
}));

// ─── superAdminLoader mock ────────────────────────────────────────────────────

vi.mock('~/auth/routes/loaders', () => ({
  superAdminLoader: vi.fn().mockResolvedValue(null),
}));

// ─── resellerHttpService mock ─────────────────────────────────────────────────

vi.mock('~/admin/resellers/lib/services/reseller-http-service', () => ({
  resellerHttpService: {
    getReseller: vi.fn(),
    updateReseller: vi.fn(),
  },
}));

// ─── useUnsavedChangesPrompt mock ─────────────────────────────────────────────

const mockUseUnsavedChangesPrompt = vi.fn();
vi.mock('~/shared/lib/hooks/use-unsaved-changes-prompt', () => ({
  useUnsavedChangesPrompt: (isDirty: boolean) => mockUseUnsavedChangesPrompt(isDirty),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockParams.id = 'r42';
});

function makeReseller(overrides: Partial<ReSeller> = {}): ReSeller {
  return {
    id: 'r42',
    userId: 'u1',
    fullName: 'John Edit',
    percentDiscountPrice: 10,
    discountPrice: 5,
    cellPhone: '+53 5 123-4567',
    email: 'john@example.com',
    description: 'Edit reseller',
    guest: false,
    isActive: true,
    createdDate: new Date('2024-01-01'),
    createdByName: 'admin',
    ...overrides,
  };
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

async function renderPage() {
  const { ResellerEditPage } = await import('../reseller-edit');
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <Wrapper>
        <ResellerEditPage />
      </Wrapper>
    );
  });
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-RESELLERS-EDIT-1 — exports + loader
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerEditPage — exports', () => {
  it('exports a named loader = superAdminLoader', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.getReseller).mockResolvedValue({
      succeeded: true,
      data: makeReseller(),
      message: '',
      actionCode: 0,
      errors: [],
    });
    const mod = await import('../reseller-edit');
    expect(typeof mod.clientLoader).toBe('function');
  });

  it('exports ResellerEditPage as default', async () => {
    const mod = await import('../reseller-edit');
    expect(typeof mod.default).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PARITY-EDIT-1 — submit reads GENERAL.UPDATE ("Actualizar"), not USERS.SAVE
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerEditPage — submit label parity (Req: Resellers L6 Text Parity)', () => {
  it('submit button reads "Actualizar" (GENERAL.UPDATE), matching edit-reseller-details.component.html:101', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.getReseller).mockResolvedValue({
      succeeded: true,
      data: makeReseller(),
      message: '',
      actionCode: 0,
      errors: [],
    });

    await renderPage();

    await waitFor(() => {
      expect(esMessages['GENERAL.UPDATE']).toBe('Actualizar');
      expect(screen.getByRole('button', { name: 'Actualizar' })).toBeInTheDocument();
    });
  });
});

describe('ResellerEditPage — submit renders as fab (edit-reseller-details.component.html:63 parity)', () => {
  it('renders the submit control as a fab (Button variant="fab"), not a plain button', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.getReseller).mockResolvedValue({
      succeeded: true,
      data: makeReseller(),
      message: '',
      actionCode: 0,
      errors: [],
    });

    await renderPage();

    await waitFor(() => {
      const submit = screen.getByRole('button', { name: 'Actualizar' });
      expect(submit).toHaveClass('rounded-full');
      expect(submit).not.toHaveClass('rounded');
    });
  });

  // edit-reseller-details.component.html:99 — the fab carries a leading `edit` mat-icon.
  it('renders EditIcon inside the submit fab', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.getReseller).mockResolvedValue({
      succeeded: true,
      data: makeReseller(),
      message: '',
      actionCode: 0,
      errors: [],
    });

    await renderPage();

    await waitFor(() => {
      const submit = screen.getByRole('button', { name: 'Actualizar' });
      const path = submit.querySelector('svg path')?.getAttribute('d');
      expect(path).toContain('16.862 4.487');
    });
  });
});

// edit-reseller.component.html:5-8 — a toolbar "+" fab (navigateToCreateReSeller),
// DISTINCT from the details-form submit above. Angular's own click handler is an
// empty no-op (edit-reseller.component.ts:12-13), so React mirrors that: renders,
// does nothing on click.
describe('ResellerEditPage — toolbar add-reseller fab (edit-reseller.component.html:5-8 parity)', () => {
  it('renders the toolbar "+" fab labeled RESELLER.ADD_RESELLER, distinct from the details submit', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.getReseller).mockResolvedValue({
      succeeded: true,
      data: makeReseller(),
      message: '',
      actionCode: 0,
      errors: [],
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Adicionar Gestor' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Actualizar' })).toBeInTheDocument();
    });
  });

  it('does nothing on click (mirrors Angular navigateToCreateReSeller empty no-op)', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.getReseller).mockResolvedValue({
      succeeded: true,
      data: makeReseller(),
      message: '',
      actionCode: 0,
      errors: [],
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Adicionar Gestor' })).toBeInTheDocument();
    });
    expect(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Adicionar Gestor' }));
    }).not.toThrow();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PARITY-EDIT-2 — discount labels match Angular literal copy
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerEditPage — discount label parity (Req: Resellers L6 Text Parity)', () => {
  it('discount labels read "Porciento de descuento" / "Descuento"', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.getReseller).mockResolvedValue({
      succeeded: true,
      data: makeReseller(),
      message: '',
      actionCode: 0,
      errors: [],
    });

    await renderPage();

    await waitFor(() => {
      expect(esMessages['RESELLERS.PERCENT_DISCOUNT']).toBe('Porciento de descuento');
      expect(esMessages['RESELLERS.DISCOUNT_PRICE']).toBe('Descuento');
      expect(screen.getByLabelText('Porciento de descuento')).toBeInTheDocument();
      expect(screen.getByLabelText('Descuento')).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-RESELLERS-EDIT-2 — loads by :id and pre-populates
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerEditPage — load by id and pre-populate', () => {
  it('calls getReseller(id) and pre-populates form fields', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.getReseller).mockResolvedValue({
      succeeded: true,
      data: makeReseller({
        fullName: 'Pre-Populated Name',
        cellPhone: '+53 5 999-8888',
        email: 'prepopulated@example.com',
      }),
      message: '',
      actionCode: 0,
      errors: [],
    });

    await renderPage();

    await waitFor(() => {
      expect(resellerHttpService.getReseller).toHaveBeenCalledWith('r42');
    });

    await waitFor(() => {
      const fullNameInput = screen.getByLabelText(esMessages['GENERAL.FULL_NAME']) as HTMLInputElement;
      expect(fullNameInput.value).toBe('Pre-Populated Name');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-RESELLERS-EDIT-3 — login field is disabled and NOT in PUT body
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerEditPage — login disabled', () => {
  it('login field is disabled/read-only', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.getReseller).mockResolvedValue({
      succeeded: true,
      data: makeReseller(),
      message: '',
      actionCode: 0,
      errors: [],
    });

    await renderPage();

    await waitFor(() => {
      const loginInput = screen.getByLabelText(esMessages['USERS.LOGIN']) as HTMLInputElement;
      expect(loginInput.disabled).toBe(true);
    });
  });

  it('login is NOT included in updateReseller payload', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.getReseller).mockResolvedValue({
      succeeded: true,
      data: makeReseller(),
      message: '',
      actionCode: 0,
      errors: [],
    });
    vi.mocked(resellerHttpService.updateReseller).mockResolvedValue({
      succeeded: true,
      data: true,
      message: '',
      actionCode: 0,
      errors: [],
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(esMessages['GENERAL.FULL_NAME'])).toBeInTheDocument();
    });

    fireEvent.submit(screen.getByRole('button', { name: esMessages['GENERAL.UPDATE'] }).closest('form')!);

    await waitFor(() => {
      expect(resellerHttpService.updateReseller).toHaveBeenCalled();
      const payload = vi.mocked(resellerHttpService.updateReseller).mock.calls[0][1];
      expect(payload).not.toHaveProperty('login');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-RESELLERS-EDIT-4 — isActive toggle
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerEditPage — isActive toggle', () => {
  it('isActive field is present and toggleable', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.getReseller).mockResolvedValue({
      succeeded: true,
      data: makeReseller({ isActive: true }),
      message: '',
      actionCode: 0,
      errors: [],
    });

    await renderPage();

    await waitFor(() => {
      const toggle = screen.getByLabelText(esMessages['USERS.IS_ACTIVE']) as HTMLInputElement;
      expect(toggle.checked).toBe(true);
      fireEvent.click(toggle);
      expect(toggle.checked).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-RESELLERS-EDIT-5 — number fields have min=0
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerEditPage — discount fields min=0', () => {
  it('percentDiscountPrice and discountPrice have min=0', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.getReseller).mockResolvedValue({
      succeeded: true,
      data: makeReseller(),
      message: '',
      actionCode: 0,
      errors: [],
    });

    await renderPage();

    await waitFor(() => {
      const percentInput = screen.getByLabelText(esMessages['RESELLERS.PERCENT_DISCOUNT']) as HTMLInputElement;
      const discountInput = screen.getByLabelText(esMessages['RESELLERS.DISCOUNT_PRICE']) as HTMLInputElement;
      expect(percentInput.min).toBe('0');
      expect(discountInput.min).toBe('0');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-RESELLERS-EDIT-6 — bad phone blocks PUT
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerEditPage — phone validation blocks PUT', () => {
  it('shows PHONE_FORMAT error and does NOT call updateReseller when phone invalid', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.getReseller).mockResolvedValue({
      succeeded: true,
      data: makeReseller(),
      message: '',
      actionCode: 0,
      errors: [],
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(esMessages['GENERAL.CELL_PHONE'])).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(esMessages['GENERAL.CELL_PHONE']), {
      target: { value: 'badphone' },
    });

    fireEvent.submit(screen.getByRole('button', { name: esMessages['GENERAL.UPDATE'] }).closest('form')!);

    await waitFor(() => {
      expect(screen.getByText(esMessages['RESELLERS.PHONE_FORMAT'])).toBeInTheDocument();
    });

    expect(resellerHttpService.updateReseller).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-RESELLERS-EDIT-7 — valid → updateReseller STAYS on page (no navigate)
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerEditPage — successful update stays on page', () => {
  it('calls updateReseller and does NOT navigate away on success', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.getReseller).mockResolvedValue({
      succeeded: true,
      data: makeReseller(),
      message: '',
      actionCode: 0,
      errors: [],
    });
    vi.mocked(resellerHttpService.updateReseller).mockResolvedValue({
      succeeded: true,
      data: true,
      message: '',
      actionCode: 0,
      errors: [],
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(esMessages['GENERAL.FULL_NAME'])).toBeInTheDocument();
    });

    fireEvent.submit(screen.getByRole('button', { name: esMessages['GENERAL.UPDATE'] }).closest('form')!);

    await waitFor(() => {
      expect(resellerHttpService.updateReseller).toHaveBeenCalledWith(
        'r42',
        expect.objectContaining({
          fullName: 'John Edit',
          cellPhone: '+53 5 123-4567',
          email: 'john@example.com',
          percentDiscountPrice: 10,
          discountPrice: 5,
          isActive: true,
          description: 'Edit reseller',
        })
      );
    });

    // STAYS on page — no navigate call
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-RESELLERS-EDIT-8 — !succeeded → errors[0].description inline
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerEditPage — server-side error', () => {
  it('shows errors[0].description when succeeded is false', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.getReseller).mockResolvedValue({
      succeeded: true,
      data: makeReseller(),
      message: '',
      actionCode: 0,
      errors: [],
    });
    vi.mocked(resellerHttpService.updateReseller).mockResolvedValue({
      succeeded: false,
      data: null,
      message: '',
      actionCode: 0,
      errors: [{ code: 'ERR02', description: 'Update failed on server' }],
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(esMessages['GENERAL.FULL_NAME'])).toBeInTheDocument();
    });

    fireEvent.submit(screen.getByRole('button', { name: esMessages['GENERAL.UPDATE'] }).closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Update failed on server')).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-RESELLERS-EDIT — HTTP throw → RESELLERS.ERROR
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerEditPage — HTTP throw on update', () => {
  it('shows RESELLERS.ERROR when updateReseller throws', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.getReseller).mockResolvedValue({
      succeeded: true,
      data: makeReseller(),
      message: '',
      actionCode: 0,
      errors: [],
    });
    vi.mocked(resellerHttpService.updateReseller).mockRejectedValue(new Error('Network error'));

    await renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(esMessages['GENERAL.FULL_NAME'])).toBeInTheDocument();
    });

    fireEvent.submit(screen.getByRole('button', { name: esMessages['GENERAL.UPDATE'] }).closest('form')!);

    await waitFor(() => {
      expect(screen.getByText(esMessages['RESELLERS.ERROR'])).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// response-envelope-nullability WU-D — getReseller succeeded:false is a resolved
// value, not a rejection; the load guard must surface RESELLERS.ERROR the same as
// the existing .catch() branch, and must not read `.data` off a null-carrying
// failure envelope.
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerEditPage — getReseller succeeded:false', () => {
  it('shows RESELLERS.ERROR and does not populate form fields when getReseller resolves with succeeded:false', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.getReseller).mockResolvedValue({
      succeeded: false,
      data: null,
      message: null,
      actionCode: null,
      errors: [{ code: 'E01', description: 'failed' }],
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(esMessages['RESELLERS.ERROR'])).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(esMessages['GENERAL.FULL_NAME'])).not.toBeInTheDocument();
  });

  // The runtime test above locks the observable behaviour, but it cannot tell a
  // guarded read from an unguarded one: without the guard, `res.data` is null,
  // `r.login` throws synchronously inside the `.then`, which rejects the chain
  // and lands in the very same `.catch` that sets the very same RESELLERS.ERROR —
  // both paths render identically. The guard is enforced by the compiler, so
  // that is where it has to be asserted.
  it('type-level: getReseller data cannot be read before succeeded is checked', () => {
    // Never invoked — the body is a compile-time assertion.
    const probe = (res: BaseResponseModel<ReSeller>) => {
      // @ts-expect-error `data` is ReSeller | null until `succeeded` narrows the union
      void res.data.fullName;
      if (res.succeeded) void res.data.fullName;
    };
    expect(probe).toBeTypeOf('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-RESELLERS-EDIT — submit disabled while pristine (Angular parity)
// Angular: [disabled]="formGroup.pristine" on edit-reseller-details.component.html line 95
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerEditPage — submit disabled while pristine', () => {
  it('submit button is disabled immediately after data loads (snapshot matches fields)', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.getReseller).mockResolvedValue({
      succeeded: true,
      data: makeReseller(),
      message: '',
      actionCode: 0,
      errors: [],
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(esMessages['GENERAL.FULL_NAME'])).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: esMessages['GENERAL.UPDATE'] });
    expect(submitBtn).toBeDisabled();
  });

  it('submit button becomes enabled after a field is changed from the loaded snapshot', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.getReseller).mockResolvedValue({
      succeeded: true,
      data: makeReseller({ fullName: 'Original Name' }),
      message: '',
      actionCode: 0,
      errors: [],
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(esMessages['GENERAL.FULL_NAME'])).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(esMessages['GENERAL.FULL_NAME']), {
      target: { value: 'Changed Name' },
    });

    const submitBtn = screen.getByRole('button', { name: esMessages['GENERAL.UPDATE'] });
    expect(submitBtn).not.toBeDisabled();
  });

  it('submit button goes back to disabled after successful save re-snapshots', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.getReseller).mockResolvedValue({
      succeeded: true,
      data: makeReseller({ fullName: 'Original' }),
      message: '',
      actionCode: 0,
      errors: [],
    });
    vi.mocked(resellerHttpService.updateReseller).mockResolvedValue({
      succeeded: true,
      data: true,
      message: '',
      actionCode: 0,
      errors: [],
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(esMessages['GENERAL.FULL_NAME'])).toBeInTheDocument();
    });

    // Make it dirty
    fireEvent.change(screen.getByLabelText(esMessages['GENERAL.FULL_NAME']), {
      target: { value: 'Changed' },
    });

    // Submit
    fireEvent.submit(screen.getByRole('button', { name: esMessages['GENERAL.UPDATE'] }).closest('form')!);

    // After save, re-snapshot → button should be disabled again
    await waitFor(() => {
      expect(resellerHttpService.updateReseller).toHaveBeenCalled();
    });

    await waitFor(() => {
      const submitBtn = screen.getByRole('button', { name: esMessages['GENERAL.UPDATE'] });
      expect(submitBtn).toBeDisabled();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-RESELLERS-EDIT — guard active on snapshot diff
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerEditPage — unsaved changes guard', () => {
  it('calls useUnsavedChangesPrompt with true when a field differs from loaded snapshot', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.getReseller).mockResolvedValue({
      succeeded: true,
      data: makeReseller({ fullName: 'Original Name' }),
      message: '',
      actionCode: 0,
      errors: [],
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(esMessages['GENERAL.FULL_NAME'])).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(esMessages['GENERAL.FULL_NAME']), {
      target: { value: 'Changed Name' },
    });

    await waitFor(() => {
      const calls = mockUseUnsavedChangesPrompt.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0]).toBe(true);
    });
  });
});
