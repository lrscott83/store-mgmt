import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Owner, ReSeller } from '@store-mgmt/domain';

// ─── react-router mock ────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
const mockParams: { id?: string } = { id: 'o42' };

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockParams,
  useBlocker: vi.fn().mockReturnValue({ state: 'unblocked' }),
}));

// ─── loader mock ─────────────────────────────────────────────────────────────

vi.mock('~/auth/routes/loaders', () => ({
  resellerFeatureLoader: vi.fn(() => vi.fn().mockResolvedValue(null)),
}));

// ─── ownerHttpService mock ────────────────────────────────────────────────────

vi.mock('~/admin/owners/lib/services/owner-http-service', () => ({
  ownerHttpService: {
    getOwner: vi.fn(),
    updateOwner: vi.fn(),
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

// ─── AdminStoreListPage mock ───────────────────────────────────────────────────
// Stage 4 (management-stores-parity): owner-edit's "Stores" tab now mounts the SOLE
// super-admin store list at /admin/stores (management/stores/routes/store-list.tsx, the
// old list+lifecycle route, was deleted). AdminStoreListPage self-loads via useEffect
// (does NOT use useLoaderData) — safe to mount as child; mocked here to isolate
// edit-page tests from store fetch.
vi.mock('~/admin/stores/routes/store-list', () => ({
  AdminStoreListPage: () => <div data-testid="store-list-page">StoreListPage</div>,
  default: () => <div data-testid="store-list-page">StoreListPage</div>,
}));

// ─── useUnsavedChangesPrompt mock ─────────────────────────────────────────────

const mockUseUnsavedChangesPrompt = vi.fn();
vi.mock('~/shared/lib/hooks/use-unsaved-changes-prompt', () => ({
  useUnsavedChangesPrompt: (isDirty: boolean) => mockUseUnsavedChangesPrompt(isDirty),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockParams.id = 'o42';
});

function makeOwner(overrides: Partial<Owner> = {}): Owner {
  return {
    id: 'o42',
    userId: 'u1',
    fullName: 'John Edit',
    cellPhone: '+53 5 123-4567',
    email: 'john@example.com',
    description: 'Edit owner',
    guest: false,
    isActive: true,
    reSellerId: 'r1',
    reSellerName: 'My Reseller',
    approved: true,
    storeModules: [],
    createdDate: new Date('2024-01-01'),
    createdByName: 'admin',
    ...overrides,
  };
}

function makeReseller(overrides: Partial<ReSeller> = {}): ReSeller {
  return {
    id: 'r1',
    userId: 'u1',
    fullName: 'My Reseller',
    percentDiscountPrice: 10,
    discountPrice: 5,
    cellPhone: '+53 5 111-1111',
    email: 'reseller@test.com',
    description: '',
    guest: false,
    isActive: true,
    createdDate: new Date(),
    createdByName: 'admin',
    ...overrides,
  };
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

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

async function renderPage(isSuperAdmin = false, ownerOverrides: Partial<Owner> = {}) {
  await setAuthUser(isSuperAdmin);
  const { ownerHttpService } = await import(
    '~/admin/owners/lib/services/owner-http-service'
  );
  vi.mocked(ownerHttpService.getOwner).mockResolvedValue({
    succeeded: true,
    data: makeOwner(ownerOverrides),
    message: '',
    actionCode: 0,
    errors: [],
  });
  vi.mocked(ownerHttpService.updateOwner).mockResolvedValue({
    succeeded: true,
    data: true,
    message: '',
    actionCode: 0,
    errors: [],
  });

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

  const { OwnerEditPage } = await import('../owner-edit');
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <Wrapper>
        <OwnerEditPage />
      </Wrapper>
    );
  });
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-EDIT-DETAILS-1 — exports
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerEditPage — exports', () => {
  it('exports a named loader', async () => {
    const mod = await import('../owner-edit');
    expect(typeof mod.clientLoader).toBe('function');
  });

  it('exports OwnerEditPage as default', async () => {
    const mod = await import('../owner-edit');
    expect(typeof mod.default).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-EDIT-DETAILS-2 — loads owner and pre-populates form
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerEditPage — loads and pre-populates', () => {
  it('calls getOwner with :id and pre-populates fullName, cellPhone, email, description', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    await renderPage(false);

    expect(ownerHttpService.getOwner).toHaveBeenCalledWith('o42');

    await waitFor(() => {
      expect((screen.getByLabelText(esMessages['USERS.FULL_NAME']) as HTMLInputElement).value).toBe('John Edit');
      expect((screen.getByLabelText(esMessages['USERS.CELL_PHONE']) as HTMLInputElement).value).toBe('+53 5 123-4567');
      expect((screen.getByLabelText(esMessages['USERS.EMAIL']) as HTMLInputElement).value).toBe('john@example.com');
    });
  });

  it('login field is rendered as disabled', async () => {
    await renderPage(false);

    await waitFor(() => {
      const loginInput = screen.getByLabelText(esMessages['USERS.LOGIN']) as HTMLInputElement;
      expect(loginInput).toBeDisabled();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-EDIT-DETAILS-3 — isActive toggle SuperAdmin-only
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerEditPage — isActive SuperAdmin-only', () => {
  it('renders isActive toggle for SuperAdmin', async () => {
    await renderPage(true);

    await waitFor(() => {
      expect(screen.getByLabelText(esMessages['USERS.IS_ACTIVE'])).toBeInTheDocument();
    });
  });

  it('does NOT render isActive toggle for Reseller', async () => {
    await renderPage(false);

    await waitFor(() => {
      expect(screen.queryByLabelText(esMessages['USERS.IS_ACTIVE'])).not.toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-EDIT-DETAILS-4 — reSellerId SuperAdmin-only
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerEditPage — reSellerId SuperAdmin-only', () => {
  it('renders reSellerId select for SuperAdmin', async () => {
    await renderPage(true);

    await waitFor(() => {
      const select = screen.getByLabelText(/revendedor|reseller/i);
      expect(select).toBeInTheDocument();
    });
  });

  it('does NOT render reSellerId select for Reseller', async () => {
    await renderPage(false);

    await waitFor(() => {
      expect(screen.queryByLabelText(/revendedor|reseller/i)).not.toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-EDIT-DETAILS-5 — login NOT in PUT body
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerEditPage — login not in PUT body', () => {
  it('does NOT include login in the PUT payload', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    await renderPage(false);

    await waitFor(() => {
      expect(screen.getByLabelText(esMessages['USERS.FULL_NAME'])).toBeInTheDocument();
    });

    fireEvent.submit(screen.getByRole('button', { name: esMessages['USERS.SAVE'] }).closest('form')!);

    await waitFor(() => {
      expect(ownerHttpService.updateOwner).toHaveBeenCalled();
      const payload = vi.mocked(ownerHttpService.updateOwner).mock.calls[0]?.[1];
      expect(payload).not.toHaveProperty('login');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-EDIT-DETAILS-6 — guest carried in PUT payload (not rendered)
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerEditPage — guest carried silently', () => {
  it('includes guest from loaded Owner in PUT payload without rendering a field', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    await renderPage(false, { guest: true });

    await waitFor(() => {
      expect(screen.getByLabelText(esMessages['USERS.FULL_NAME'])).toBeInTheDocument();
    });

    // guest should NOT be a visible field
    expect(screen.queryByLabelText(/guest/i)).not.toBeInTheDocument();

    fireEvent.submit(screen.getByRole('button', { name: esMessages['USERS.SAVE'] }).closest('form')!);

    await waitFor(() => {
      const payload = vi.mocked(ownerHttpService.updateOwner).mock.calls[0]?.[1];
      expect(payload?.guest).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-EDIT-DETAILS-7 — bad phone blocks PUT
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerEditPage — phone validation', () => {
  it('shows OWNER.PHONE_FORMAT and does NOT call updateOwner when phone is invalid', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    await renderPage(false);

    await waitFor(() => {
      expect(screen.getByLabelText(esMessages['USERS.CELL_PHONE'])).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(esMessages['USERS.CELL_PHONE']), {
      target: { value: 'bad-phone' },
    });

    fireEvent.submit(screen.getByRole('button', { name: esMessages['USERS.SAVE'] }).closest('form')!);

    await waitFor(() => {
      expect(screen.getByText(esMessages['OWNER.PHONE_FORMAT'])).toBeInTheDocument();
    });

    expect(ownerHttpService.updateOwner).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-EDIT-DETAILS-8 — PUT success stays on page
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerEditPage — PUT success stays on page', () => {
  it('does NOT navigate away after successful PUT', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    await renderPage(false);

    await waitFor(() => {
      expect(screen.getByLabelText(esMessages['USERS.FULL_NAME'])).toBeInTheDocument();
    });

    fireEvent.submit(screen.getByRole('button', { name: esMessages['USERS.SAVE'] }).closest('form')!);

    await waitFor(() => {
      expect(ownerHttpService.updateOwner).toHaveBeenCalledWith('o42', expect.any(Object));
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-EDIT-DETAILS-9 — PUT failure shows error
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerEditPage — PUT failure inline error', () => {
  it('shows errors[0].description when succeeded is false', async () => {
    await setAuthUser(false);
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    vi.mocked(ownerHttpService.getOwner).mockResolvedValue({
      succeeded: true,
      data: makeOwner(),
      message: '',
      actionCode: 0,
      errors: [],
    });
    vi.mocked(ownerHttpService.updateOwner).mockResolvedValue({
      succeeded: false,
      data: false,
      message: '',
      actionCode: 0,
      errors: [{ code: 'E01', description: 'Owner not found' }],
    });

    const { OwnerEditPage } = await import('../owner-edit');
    await act(async () => {
      render(<Wrapper><OwnerEditPage /></Wrapper>);
    });

    await waitFor(() => {
      expect(screen.getByLabelText(esMessages['USERS.FULL_NAME'])).toBeInTheDocument();
    });

    fireEvent.submit(screen.getByRole('button', { name: esMessages['USERS.SAVE'] }).closest('form')!);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Owner not found')).toBeInTheDocument();
    });
  });

  it('shows OWNER.ERROR when updateOwner throws', async () => {
    await setAuthUser(false);
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    vi.mocked(ownerHttpService.getOwner).mockResolvedValue({
      succeeded: true,
      data: makeOwner(),
      message: '',
      actionCode: 0,
      errors: [],
    });
    vi.mocked(ownerHttpService.updateOwner).mockRejectedValue(new Error('Network'));

    const { OwnerEditPage } = await import('../owner-edit');
    await act(async () => {
      render(<Wrapper><OwnerEditPage /></Wrapper>);
    });

    await waitFor(() => {
      expect(screen.getByLabelText(esMessages['USERS.FULL_NAME'])).toBeInTheDocument();
    });

    fireEvent.submit(screen.getByRole('button', { name: esMessages['USERS.SAVE'] }).closest('form')!);

    await waitFor(() => {
      expect(screen.getByText(esMessages['OWNER.ERROR'])).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-EDIT-TABS-1 — SuperAdmin sees 3 tabs
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerEditPage — tabs (SuperAdmin)', () => {
  it('renders 3 tabs for SuperAdmin: Details, Stores, Users', async () => {
    await renderPage(true);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: esMessages['GENERAL.DETAILS'] })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: esMessages['GENERAL.STORES'] })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: esMessages['GENERAL.USERS'] })).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-EDIT-TABS-2 — Reseller sees Details only (no tab shell)
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerEditPage — Reseller sees Details only', () => {
  it('does NOT render Stores or Users tabs for Reseller', async () => {
    await renderPage(false);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: esMessages['GENERAL.STORES'] })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: esMessages['GENERAL.USERS'] })).not.toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-EDIT-TABS-3 — Stores tab mounts StoreListPage
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerEditPage — Stores tab', () => {
  it('renders StoreListPage when Stores tab is active (SuperAdmin)', async () => {
    await renderPage(true);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: esMessages['GENERAL.STORES'] })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: esMessages['GENERAL.STORES'] }));

    await waitFor(() => {
      expect(screen.getByTestId('store-list-page')).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-EDIT-TABS-4 — Users tab renders placeholder
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerEditPage — Users tab placeholder', () => {
  it('renders OWNER.USERS_TAB_PLACEHOLDER when Users tab is active (SuperAdmin)', async () => {
    await renderPage(true);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: esMessages['GENERAL.USERS'] })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: esMessages['GENERAL.USERS'] }));

    await waitFor(() => {
      expect(screen.getByText(esMessages['OWNER.USERS_TAB_PLACEHOLDER'])).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-EDIT-DETAILS — unsaved changes prompt
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerEditPage — unsaved changes prompt', () => {
  it('useUnsavedChangesPrompt is called', async () => {
    await renderPage(false);

    await waitFor(() => {
      expect(mockUseUnsavedChangesPrompt).toHaveBeenCalled();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PARITY-EDIT-1 — submit button disabled while pristine (matches Angular:82)
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerEditPage — submit disabled while pristine', () => {
  it('submit button is disabled immediately after load (pristine)', async () => {
    await renderPage(false);

    await waitFor(() => {
      expect(screen.getByLabelText(esMessages['USERS.FULL_NAME'])).toBeInTheDocument();
    });

    const btn = screen.getByRole('button', { name: esMessages['USERS.SAVE'] });
    expect(btn).toBeDisabled();
  });

  it('submit button is enabled after user changes a field (dirty)', async () => {
    await renderPage(false);

    await waitFor(() => {
      expect(screen.getByLabelText(esMessages['USERS.FULL_NAME'])).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(esMessages['USERS.FULL_NAME']), {
      target: { value: 'Changed Name' },
    });

    const btn = screen.getByRole('button', { name: esMessages['USERS.SAVE'] });
    expect(btn).not.toBeDisabled();
  });

  it('submit button is disabled again after successful save (re-snapshotted)', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    await renderPage(false);

    await waitFor(() => {
      expect(screen.getByLabelText(esMessages['USERS.FULL_NAME'])).toBeInTheDocument();
    });

    // Make dirty
    fireEvent.change(screen.getByLabelText(esMessages['USERS.FULL_NAME']), {
      target: { value: 'Changed Name' },
    });

    let btn = screen.getByRole('button', { name: esMessages['USERS.SAVE'] });
    expect(btn).not.toBeDisabled();

    // Submit successfully
    fireEvent.submit(btn.closest('form')!);

    await waitFor(() => {
      expect(ownerHttpService.updateOwner).toHaveBeenCalled();
    });

    await waitFor(() => {
      btn = screen.getByRole('button', { name: esMessages['USERS.SAVE'] });
      expect(btn).toBeDisabled();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PARITY-EDIT-2 — reSellerId label uses GENERAL.RESELLER (matches Angular:30)
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerEditPage — reSellerId label is GENERAL.RESELLER', () => {
  it('reSellerId select label is the GENERAL.RESELLER translation, not MENU.RESELLERS', async () => {
    await renderPage(true);

    await waitFor(() => {
      // GENERAL.RESELLER = 'Revendedor'; MENU.RESELLERS = 'Revendedores'
      const label = screen.getByLabelText(esMessages['GENERAL.RESELLER']);
      expect(label).toBeInTheDocument();
    });
  });
});
