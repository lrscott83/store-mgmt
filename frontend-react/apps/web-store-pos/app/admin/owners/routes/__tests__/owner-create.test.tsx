import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { ReSeller } from '@store-mgmt/domain';

// ─── react-router mock ────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useBlocker: vi.fn().mockReturnValue({ state: 'unblocked' }),
}));

// ─── loader mock ─────────────────────────────────────────────────────────────

vi.mock('~/auth/routes/loaders', () => ({
  resellerFeatureLoader: vi.fn(() => vi.fn().mockResolvedValue(null)),
}));

// ─── ownerHttpService mock ────────────────────────────────────────────────────

vi.mock('~/admin/owners/lib/services/owner-http-service', () => ({
  ownerHttpService: {
    createOwner: vi.fn(),
  },
}));

// ─── resellerHttpService mock ─────────────────────────────────────────────────

vi.mock('~/admin/resellers/lib/services/reseller-http-service', () => ({
  resellerHttpService: {
    listResellers: vi.fn(),
  },
}));

// ─── auth-store mock ──────────────────────────────────────────────────────────

vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: vi.fn(),
}));

// ─── useUnsavedChangesPrompt mock ─────────────────────────────────────────────

const mockUseUnsavedChangesPrompt = vi.fn();
vi.mock('~/shared/lib/hooks/use-unsaved-changes-prompt', () => ({
  useUnsavedChangesPrompt: (isDirty: boolean) => mockUseUnsavedChangesPrompt(isDirty),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReseller(overrides: Partial<ReSeller> = {}): ReSeller {
  return {
    id: 'r1',
    userId: 'u1',
    fullName: 'My Reseller',
    percentDiscountPrice: 10,
    discountPrice: 5,
    cellPhone: '+53 5 123-4567',
    email: 'reseller@test.com',
    description: '',
    guest: false,
    isActive: true,
    createdDate: new Date(),
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

async function setAuthUser(isSuperAdmin: boolean) {
  const { useAuthStore } = await import('~/shared/lib/stores/auth-store');
  vi.mocked(useAuthStore).mockReturnValue({
    user: {
      id: 'u1',
      isSuperAdmin,
      isReSeller: !isSuperAdmin,
      isOwnerAdmin: false,
      login: 'test',
      fullName: 'Test User',
      cellPhone: '',
      email: '',
      isActive: true,
      password: '',
      authToken: 'tok',
      refreshToken: 'ref',
      expiresIn: Date.now() + 1000000,
      roles: [],
      featureIds: [],
      storeModuleIds: [],
      selectedStoreId: '',
    },
    isAuthenticated: true,
    isLoading: false,
    error: null,
    initialize: vi.fn(),
    setUser: vi.fn(),
    updateUser: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  } as never);
}

async function renderPage(isSuperAdmin = false) {
  await setAuthUser(isSuperAdmin);
  const { resellerHttpService } = await import(
    '~/admin/resellers/lib/services/reseller-http-service'
  );
  if (isSuperAdmin) {
    vi.mocked(resellerHttpService.listResellers).mockResolvedValue({
      succeeded: true,
      data: [makeReseller()],
      message: '',
      actionCode: 0,
      errors: [],
    });
  }
  const { OwnerCreatePage } = await import('../owner-create');
  return render(
    <Wrapper>
      <OwnerCreatePage />
    </Wrapper>
  );
}

function fillValidForm(isSuperAdmin = false) {
  fireEvent.change(screen.getByLabelText(esMessages['USERS.FULL_NAME']), {
    target: { value: 'Jane Owner' },
  });
  fireEvent.change(screen.getByLabelText(esMessages['USERS.LOGIN']), {
    target: { value: 'janeowner' },
  });
  fireEvent.change(screen.getByLabelText(esMessages['USERS.PASSWORD']), {
    target: { value: 'Password1' },
  });
  fireEvent.change(screen.getByLabelText(esMessages['USERS.CONFIRM_PASSWORD']), {
    target: { value: 'Password1' },
  });
  fireEvent.change(screen.getByLabelText(esMessages['USERS.CELL_PHONE']), {
    target: { value: '+53 5 123-4567' },
  });
  fireEvent.change(screen.getByLabelText(esMessages['USERS.EMAIL']), {
    target: { value: 'jane@example.com' },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-CREATE-1 — exports
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerCreatePage — exports', () => {
  it('exports a named loader', async () => {
    const mod = await import('../owner-create');
    expect(typeof mod.loader).toBe('function');
  });

  it('exports OwnerCreatePage as default', async () => {
    const mod = await import('../owner-create');
    expect(typeof mod.default).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-CREATE-2 — renders all 7 fields for Reseller user
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerCreatePage — fields (Reseller view)', () => {
  it('renders fullName, login, password, confirmPassword, cellPhone, email, description fields', async () => {
    await renderPage(false);

    expect(screen.getByLabelText(esMessages['USERS.FULL_NAME'])).toBeInTheDocument();
    expect(screen.getByLabelText(esMessages['USERS.LOGIN'])).toBeInTheDocument();
    expect(screen.getByLabelText(esMessages['USERS.PASSWORD'])).toBeInTheDocument();
    expect(screen.getByLabelText(esMessages['USERS.CONFIRM_PASSWORD'])).toBeInTheDocument();
    expect(screen.getByLabelText(esMessages['USERS.CELL_PHONE'])).toBeInTheDocument();
    expect(screen.getByLabelText(esMessages['USERS.EMAIL'])).toBeInTheDocument();
    expect(screen.getByLabelText(/descripci/i)).toBeInTheDocument();
  });

  it('does NOT render reSellerId select for non-SuperAdmin', async () => {
    await renderPage(false);
    // reSellerId select should not be present
    expect(screen.queryByLabelText(/revendedor|reseller/i)).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-CREATE-3 — reSellerId select for SuperAdmin
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerCreatePage — reSellerId SuperAdmin-only', () => {
  it('renders reSellerId select populated from listResellers for SuperAdmin', async () => {
    await renderPage(true);

    await waitFor(() => {
      const select = screen.getByLabelText(/revendedor|reseller/i);
      expect(select).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-CREATE-4 — PASSWORD_REGEX validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerCreatePage — password regex validation', () => {
  it('shows OWNER.PASSWORD_POLICY error when password fails regex', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    await renderPage(false);

    fireEvent.change(screen.getByLabelText(esMessages['USERS.FULL_NAME']), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByLabelText(esMessages['USERS.LOGIN']), { target: { value: 'jane' } });
    fireEvent.change(screen.getByLabelText(esMessages['USERS.PASSWORD']), { target: { value: 'weak' } });
    fireEvent.change(screen.getByLabelText(esMessages['USERS.CONFIRM_PASSWORD']), { target: { value: 'weak' } });
    fireEvent.change(screen.getByLabelText(esMessages['USERS.CELL_PHONE']), { target: { value: '+53 5 123-4567' } });

    fireEvent.submit(screen.getByRole('button', { name: esMessages['USERS.SAVE'] }).closest('form')!);

    await waitFor(() => {
      expect(screen.getByText(esMessages['OWNER.PASSWORD_POLICY'])).toBeInTheDocument();
    });

    expect(ownerHttpService.createOwner).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-CREATE-5 — password mismatch
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerCreatePage — password mismatch validation', () => {
  it('shows OWNER.PASSWORDS_MUST_MATCH when passwords differ', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    await renderPage(false);

    fireEvent.change(screen.getByLabelText(esMessages['USERS.FULL_NAME']), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByLabelText(esMessages['USERS.LOGIN']), { target: { value: 'jane' } });
    fireEvent.change(screen.getByLabelText(esMessages['USERS.PASSWORD']), { target: { value: 'Password1' } });
    fireEvent.change(screen.getByLabelText(esMessages['USERS.CONFIRM_PASSWORD']), { target: { value: 'Password2' } });
    fireEvent.change(screen.getByLabelText(esMessages['USERS.CELL_PHONE']), { target: { value: '+53 5 123-4567' } });

    fireEvent.submit(screen.getByRole('button', { name: esMessages['USERS.SAVE'] }).closest('form')!);

    await waitFor(() => {
      expect(screen.getByText(esMessages['OWNER.PASSWORDS_MUST_MATCH'])).toBeInTheDocument();
    });

    expect(ownerHttpService.createOwner).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-CREATE-6 — phone format validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerCreatePage — phone format validation', () => {
  it('shows OWNER.PHONE_FORMAT when phone is invalid', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    await renderPage(false);

    fireEvent.change(screen.getByLabelText(esMessages['USERS.FULL_NAME']), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByLabelText(esMessages['USERS.LOGIN']), { target: { value: 'jane' } });
    fireEvent.change(screen.getByLabelText(esMessages['USERS.PASSWORD']), { target: { value: 'Password1' } });
    fireEvent.change(screen.getByLabelText(esMessages['USERS.CONFIRM_PASSWORD']), { target: { value: 'Password1' } });
    fireEvent.change(screen.getByLabelText(esMessages['USERS.CELL_PHONE']), { target: { value: '12345' } });

    fireEvent.submit(screen.getByRole('button', { name: esMessages['USERS.SAVE'] }).closest('form')!);

    await waitFor(() => {
      expect(screen.getByText(esMessages['OWNER.PHONE_FORMAT'])).toBeInTheDocument();
    });

    expect(ownerHttpService.createOwner).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-CREATE-7 — valid submit → createOwner + navigate /management/stores/create
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerCreatePage — successful submit', () => {
  it('calls createOwner and navigates to /management/stores/create on success', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    vi.mocked(ownerHttpService.createOwner).mockResolvedValue({
      succeeded: true,
      data: '',
      message: '',
      actionCode: 0,
      errors: [],
    });

    await renderPage(false);
    fillValidForm(false);

    fireEvent.submit(screen.getByRole('button', { name: esMessages['USERS.SAVE'] }).closest('form')!);

    await waitFor(() => {
      expect(ownerHttpService.createOwner).toHaveBeenCalledWith(
        expect.objectContaining({
          fullName: 'Jane Owner',
          login: 'janeowner',
          password: 'Password1',
          cellPhone: '+53 5 123-4567',
          email: 'jane@example.com',
        })
      );
      expect(mockNavigate).toHaveBeenCalledWith('/management/stores/create');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-CREATE-8 — server failure → inline errors[0].description
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerCreatePage — server error', () => {
  it('shows errors[0].description when succeeded is false', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    vi.mocked(ownerHttpService.createOwner).mockResolvedValue({
      succeeded: false,
      data: '',
      message: '',
      actionCode: 0,
      errors: [{ code: 'E01', description: 'Login already taken' }],
    });

    await renderPage(false);
    fillValidForm(false);

    fireEvent.submit(screen.getByRole('button', { name: esMessages['USERS.SAVE'] }).closest('form')!);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Login already taken')).toBeInTheDocument();
    });
  });

  it('shows OWNER.ERROR when createOwner throws', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    vi.mocked(ownerHttpService.createOwner).mockRejectedValue(new Error('Network'));

    await renderPage(false);
    fillValidForm(false);

    fireEvent.submit(screen.getByRole('button', { name: esMessages['USERS.SAVE'] }).closest('form')!);

    await waitFor(() => {
      expect(screen.getByText(esMessages['OWNER.ERROR'])).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-CREATE-9 — unsaved changes prompt
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerCreatePage — unsaved changes prompt', () => {
  it('calls useUnsavedChangesPrompt with true when form is dirty', async () => {
    await renderPage(false);

    fireEvent.change(screen.getByLabelText(esMessages['USERS.FULL_NAME']), {
      target: { value: 'Dirty' },
    });

    await waitFor(() => {
      expect(mockUseUnsavedChangesPrompt).toHaveBeenCalledWith(true);
    });
  });

  it('calls useUnsavedChangesPrompt with false when form is pristine', async () => {
    await renderPage(false);

    expect(mockUseUnsavedChangesPrompt).toHaveBeenCalledWith(false);
  });
});
