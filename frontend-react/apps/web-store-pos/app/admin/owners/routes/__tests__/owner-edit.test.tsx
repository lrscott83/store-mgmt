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

// ─── storeHttpService mock ────────────────────────────────────────────────────
// presentation-parity-bucket-b WU2: the "Tiendas" tab no longer mounts the whole
// AdminStoreListPage (which duplicates its own STORES.LIST_TITLE h1 + "+ Agregar"
// fab). It now renders `StoreCardList` directly with fetch/approve/disapprove/edit
// logic copied from `admin/stores/routes/store-list.tsx`.
vi.mock('~/management/stores/lib/services/store-http-service', () => ({
  storeHttpService: {
    listStores: vi.fn(),
    approveStore: vi.fn(),
    disapproveStore: vi.fn(),
  },
}));

// ─── blocking-alert (confirmDialog) mock ──────────────────────────────────────

const mockConfirmDialog = vi.fn();
vi.mock('~/shared/lib/blocking-alert', () => ({
  confirmDialog: (...args: unknown[]) => mockConfirmDialog(...args),
}));

function makeStore(overrides: Partial<import('@store-mgmt/domain').Store> = {}) {
  return {
    id: 's1',
    name: 'Store One',
    displayName: 'Store One',
    ownerId: 'o1',
    ownerName: 'Owner One',
    address: '123 Main St',
    description: 'A store',
    approved: true,
    paymentStartDate: '2024-01-01',
    modules: [],
    isActive: true,
    ...overrides,
  };
}

// ─── useUnsavedChangesPrompt mock ─────────────────────────────────────────────

const mockUseUnsavedChangesPrompt = vi.fn();
vi.mock('~/shared/lib/hooks/use-unsaved-changes-prompt', () => ({
  useUnsavedChangesPrompt: (isDirty: boolean) => mockUseUnsavedChangesPrompt(isDirty),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  mockParams.id = 'o42';
  const { storeHttpService } = await import(
    '~/management/stores/lib/services/store-http-service'
  );
  vi.mocked(storeHttpService.listStores).mockResolvedValue({
    succeeded: true,
    data: [],
    message: '',
    actionCode: 0,
    errors: [],
  });
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
// PARITY-EDIT-3 — submit reads GENERAL.UPDATE ("Actualizar"), not USERS.SAVE
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerEditPage — submit label parity (Req: Owners L6 Text Parity)', () => {
  it('submit button reads "Actualizar" (GENERAL.UPDATE), matching edit-owner-details.component.html:88', async () => {
    await renderPage(false);

    await waitFor(() => {
      expect(esMessages['GENERAL.UPDATE']).toBe('Actualizar');
      expect(screen.getByRole('button', { name: 'Actualizar' })).toBeInTheDocument();
    });
  });
});

describe('OwnerEditPage — submit renders as fab (edit-owner-details.component.html:82 parity)', () => {
  it('renders the submit control as a fab (Button variant="fab"), not a plain button', async () => {
    await renderPage(false);

    await waitFor(() => {
      const submit = screen.getByRole('button', { name: 'Actualizar' });
      expect(submit).toHaveClass('rounded-full');
      expect(submit).not.toHaveClass('rounded');
    });
  });

  // edit-owner-details.component.html:86 — the fab carries a leading `edit` mat-icon.
  it('renders EditIcon inside the submit fab', async () => {
    await renderPage(false);

    await waitFor(() => {
      const submit = screen.getByRole('button', { name: 'Actualizar' });
      const path = submit.querySelector('svg path')?.getAttribute('d');
      expect(path).toContain('16.862 4.487');
    });
  });
});

// edit-owner.component.html:5-8 — a toolbar "+" fab (openCreateOwnerModal), DISTINCT
// from the details-form submit above. Angular's own click handler is an empty no-op
// (edit-owner.component.ts:28-29), so React mirrors that: renders, does nothing on click.
describe('OwnerEditPage — toolbar add-owner fab (edit-owner.component.html:5-8 parity)', () => {
  it('renders the toolbar "+" fab labeled OWNER.ADD_OWNER, distinct from the details submit', async () => {
    await renderPage(false);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Adicionar Propietario' })).toBeInTheDocument();
      // Distinct from the details-form "Actualizar" submit button.
      expect(screen.getByRole('button', { name: 'Actualizar' })).toBeInTheDocument();
    });
  });

  it('renders the toolbar fab for both reseller and super-admin roles (unconditional in Angular)', async () => {
    await renderPage(true);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Adicionar Propietario' })).toBeInTheDocument();
    });
  });

  it('does nothing on click (mirrors Angular openCreateOwnerModal empty no-op)', async () => {
    await renderPage(false);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Adicionar Propietario' })).toBeInTheDocument();
    });
    expect(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Adicionar Propietario' }));
    }).not.toThrow();
    expect(mockNavigate).not.toHaveBeenCalled();
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
  expect((screen.getByLabelText(esMessages['GENERAL.FULL_NAME']) as HTMLInputElement).value).toBe('John Edit');
      expect((screen.getByLabelText(esMessages['GENERAL.CELL_PHONE']) as HTMLInputElement).value).toBe('+53 5 123-4567');
      expect((screen.getByLabelText(esMessages['GENERAL.EMAIL']) as HTMLInputElement).value).toBe('john@example.com');
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
      const select = screen.getByLabelText(/revendedor|reseller|gestor/i);
      expect(select).toBeInTheDocument();
    });
  });

  it('does NOT render reSellerId select for Reseller', async () => {
    await renderPage(false);

    await waitFor(() => {
      expect(screen.queryByLabelText(/revendedor|reseller|gestor/i)).not.toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PARITY-EDIT-1 — Gestor (reSeller) field position (edit-owner-details.component.html:27-39)
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerEditPage — Gestor (reSeller) field position (Angular parity)', () => {
  it('renders the reSeller select after Full Name and before the Activo toggle', async () => {
    await renderPage(true);

    await waitFor(() => {
      expect(screen.getByLabelText(esMessages['GENERAL.RESELLER'])).toBeInTheDocument();
    });

    const fullNameInput = screen.getByLabelText(esMessages['GENERAL.FULL_NAME']);
    const reSellerSelect = screen.getByLabelText(esMessages['GENERAL.RESELLER']);
    const isActiveToggle = screen.getByLabelText(esMessages['USERS.IS_ACTIVE']);

    expect(
      fullNameInput.compareDocumentPosition(reSellerSelect) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      reSellerSelect.compareDocumentPosition(isActiveToggle) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
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
      expect(screen.getByLabelText(esMessages['GENERAL.FULL_NAME'])).toBeInTheDocument();
    });

    fireEvent.submit(screen.getByRole('button', { name: esMessages['GENERAL.UPDATE'] }).closest('form')!);

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
      expect(screen.getByLabelText(esMessages['GENERAL.FULL_NAME'])).toBeInTheDocument();
    });

    // guest should NOT be a visible field
    expect(screen.queryByLabelText(/guest/i)).not.toBeInTheDocument();

    fireEvent.submit(screen.getByRole('button', { name: esMessages['GENERAL.UPDATE'] }).closest('form')!);

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
      expect(screen.getByLabelText(esMessages['GENERAL.CELL_PHONE'])).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(esMessages['GENERAL.CELL_PHONE']), {
      target: { value: 'bad-phone' },
    });

    fireEvent.submit(screen.getByRole('button', { name: esMessages['GENERAL.UPDATE'] }).closest('form')!);

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
      expect(screen.getByLabelText(esMessages['GENERAL.FULL_NAME'])).toBeInTheDocument();
    });

    fireEvent.submit(screen.getByRole('button', { name: esMessages['GENERAL.UPDATE'] }).closest('form')!);

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
      data: null,
      message: '',
      actionCode: 0,
      errors: [{ code: 'E01', description: 'Owner not found' }],
    });

    const { OwnerEditPage } = await import('../owner-edit');
    await act(async () => {
      render(<Wrapper><OwnerEditPage /></Wrapper>);
    });

    await waitFor(() => {
      expect(screen.getByLabelText(esMessages['GENERAL.FULL_NAME'])).toBeInTheDocument();
    });

    fireEvent.submit(screen.getByRole('button', { name: esMessages['GENERAL.UPDATE'] }).closest('form')!);

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
      expect(screen.getByLabelText(esMessages['GENERAL.FULL_NAME'])).toBeInTheDocument();
    });

    fireEvent.submit(screen.getByRole('button', { name: esMessages['GENERAL.UPDATE'] }).closest('form')!);

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
// presentation-parity-bucket-b WU2 — Stores tab renders the grid ONLY
// (StoreCardList), matching Angular's app-store-list (grid-only, no title/add-fab).
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerEditPage — Tiendas tab renders grid only (bucket-b WU2)', () => {
  async function openStoresTab(stores: ReturnType<typeof makeStore>[] = [makeStore()]) {
    const { storeHttpService } = await import(
      '~/management/stores/lib/services/store-http-service'
    );
    vi.mocked(storeHttpService.listStores).mockResolvedValue({
      succeeded: true,
      data: stores as never,
      message: '',
      actionCode: 0,
      errors: [],
    });

    await renderPage(true);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: esMessages['GENERAL.STORES'] })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: esMessages['GENERAL.STORES'] }));

    return storeHttpService;
  }

  it('renders store cards via StoreCardList', async () => {
    await openStoresTab([makeStore({ id: 's1', name: 'Store Alpha' })]);

    await waitFor(() => {
      expect(screen.getByText('Store Alpha')).toBeInTheDocument();
    });
  });

  it('does NOT render a duplicated STORES.LIST_TITLE <h1> heading inside the tab', async () => {
    await openStoresTab([makeStore({ id: 's1', name: 'Store Alpha' })]);

    await waitFor(() => {
      expect(screen.getByText('Store Alpha')).toBeInTheDocument();
    });

    // STORES.LIST_TITLE and GENERAL.STORES (the tab button label) share the same
    // literal "Tiendas" string in es.ts — assert specifically on heading level 1,
    // which is what AdminStoreListPage renders and what must NOT be duplicated here.
    const h1Headings = screen.queryAllByRole('heading', { level: 1 });
    expect(h1Headings.some((h) => h.textContent === esMessages['STORES.LIST_TITLE'])).toBe(false);
  });

  it('does NOT render a "+ Agregar" add-store fab inside the tab', async () => {
    await openStoresTab([makeStore({ id: 's1', name: 'Store Alpha' })]);

    await waitFor(() => {
      expect(screen.getByText('Store Alpha')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: esMessages['GENERAL.ADD'] })).not.toBeInTheDocument();
  });

  it('approve handler fires exactly as it does on /admin/stores', async () => {
    const storeHttpService = await openStoresTab([
      makeStore({ id: 's1', name: 'Store Alpha', approved: false }),
    ]);
    vi.mocked(storeHttpService.approveStore).mockResolvedValue({
      succeeded: true,
      data: true,
      message: '',
      actionCode: 0,
      errors: [],
    });
    mockConfirmDialog.mockResolvedValue(true);

    await waitFor(() => {
      expect(screen.getByText('Store Alpha')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('store-actions-toggle-s1'));
    fireEvent.click(screen.getByRole('menuitem', { name: esMessages['STORES.APPROVE'] }));

    await waitFor(() => {
      expect(mockConfirmDialog).toHaveBeenCalledWith({
        title: esMessages['STORES.APPROVE_CONFIRM_TITLE'],
        message: esMessages['STORES.APPROVE_CONFIRM_MESSAGE'],
        confirmButtonText: esMessages['GENERAL.YES'],
        cancelButtonText: esMessages['GENERAL.NO'],
      });
      expect(storeHttpService.approveStore).toHaveBeenCalledWith('s1');
    });
  });

  it('disapprove handler fires exactly as it does on /admin/stores', async () => {
    const storeHttpService = await openStoresTab([
      makeStore({ id: 's2', name: 'Store Beta', approved: true }),
    ]);
    vi.mocked(storeHttpService.disapproveStore).mockResolvedValue({
      succeeded: true,
      data: true,
      message: '',
      actionCode: 0,
      errors: [],
    });
    mockConfirmDialog.mockResolvedValue(true);

    await waitFor(() => {
      expect(screen.getByText('Store Beta')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('store-actions-toggle-s2'));
    fireEvent.click(screen.getByRole('menuitem', { name: esMessages['STORES.DISAPPROVE'] }));

    await waitFor(() => {
      expect(mockConfirmDialog).toHaveBeenCalledWith({
        title: esMessages['STORES.DISAPPROVE_CONFIRM_TITLE'],
        message: esMessages['STORES.DISAPPROVE_CONFIRM_MESSAGE'],
        confirmButtonText: esMessages['GENERAL.YES'],
        cancelButtonText: esMessages['GENERAL.NO'],
      });
      expect(storeHttpService.disapproveStore).toHaveBeenCalledWith('s2');
    });
  });

  it('edit handler navigates to /management/stores/edit/:id exactly as /admin/stores does', async () => {
    await openStoresTab([makeStore({ id: 's3', name: 'Store Gamma' })]);

    await waitFor(() => {
      expect(screen.getByText('Store Gamma')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('store-actions-toggle-s3'));
    fireEvent.click(screen.getByRole('menuitem', { name: esMessages['STORES.EDIT'] }));

    expect(mockNavigate).toHaveBeenCalledWith('/management/stores/edit/s3');
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
      expect(screen.getByLabelText(esMessages['GENERAL.FULL_NAME'])).toBeInTheDocument();
    });

    const btn = screen.getByRole('button', { name: esMessages['GENERAL.UPDATE'] });
    expect(btn).toBeDisabled();
  });

  it('submit button is enabled after user changes a field (dirty)', async () => {
    await renderPage(false);

    await waitFor(() => {
      expect(screen.getByLabelText(esMessages['GENERAL.FULL_NAME'])).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(esMessages['GENERAL.FULL_NAME']), {
      target: { value: 'Changed Name' },
    });

    const btn = screen.getByRole('button', { name: esMessages['GENERAL.UPDATE'] });
    expect(btn).not.toBeDisabled();
  });

  it('submit button is disabled again after successful save (re-snapshotted)', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    await renderPage(false);

    await waitFor(() => {
      expect(screen.getByLabelText(esMessages['GENERAL.FULL_NAME'])).toBeInTheDocument();
    });

    // Make dirty
    fireEvent.change(screen.getByLabelText(esMessages['GENERAL.FULL_NAME']), {
      target: { value: 'Changed Name' },
    });

    let btn = screen.getByRole('button', { name: esMessages['GENERAL.UPDATE'] });
    expect(btn).not.toBeDisabled();

    // Submit successfully
    fireEvent.submit(btn.closest('form')!);

    await waitFor(() => {
      expect(ownerHttpService.updateOwner).toHaveBeenCalled();
    });

    await waitFor(() => {
      btn = screen.getByRole('button', { name: esMessages['GENERAL.UPDATE'] });
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

// ═══════════════════════════════════════════════════════════════════════════════
// response-envelope-nullability WU-C — 3 unguarded reads in owner-edit.tsx, mixed
// idioms: getOwner uses the page loadError, loadStores uses its own storesError,
// listResellers stays silent (no new error UI, unchanged).
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerEditPage — getOwner succeeded:false (Req: Owner Edit Load Surfaces succeeded:false via OWNER.ERROR)', () => {
  it('shows OWNER.ERROR and does not populate form fields when getOwner resolves with succeeded:false', async () => {
    await setAuthUser(false);
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    // The backend really does return `data: null` on a failed response, which the
    // pre-union BaseResponseModel type does not admit yet — hence the cast through
    // the awaited return type rather than a blanket `any` (dashboard.test.tsx precedent).
    type GetOwnerResponse = Awaited<ReturnType<typeof ownerHttpService.getOwner>>;
    vi.mocked(ownerHttpService.getOwner).mockResolvedValue({
      succeeded: false,
      data: null,
      message: null,
      actionCode: null,
      errors: [{ code: 'E01', description: 'failed' }],
    } as unknown as GetOwnerResponse);

    const { OwnerEditPage } = await import('../owner-edit');
    await act(async () => {
      render(<Wrapper><OwnerEditPage /></Wrapper>);
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(esMessages['OWNER.ERROR'])).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(esMessages['GENERAL.FULL_NAME'])).not.toBeInTheDocument();
  });
});

describe('OwnerEditPage — loadStores succeeded:false (Req: Owner Edit Stores Tab Fetch Surfaces succeeded:false via Its Own storesError State)', () => {
  it('sets storesError (not loadError) to STORES.ERROR, does not set stores from data', async () => {
    const { storeHttpService } = await import(
      '~/management/stores/lib/services/store-http-service'
    );
    type ListStoresResponse = Awaited<ReturnType<typeof storeHttpService.listStores>>;
    vi.mocked(storeHttpService.listStores).mockResolvedValue({
      succeeded: false,
      data: null,
      message: null,
      actionCode: null,
      errors: [{ code: 'E01', description: 'failed' }],
    } as unknown as ListStoresResponse);

    await renderPage(true);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: esMessages['GENERAL.STORES'] })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: esMessages['GENERAL.STORES'] }));

    await waitFor(() => {
      expect(screen.getByText(esMessages['STORES.ERROR'])).toBeInTheDocument();
    });

    // getOwner succeeded in this render (default renderPage mock) — the only alert
    // on screen must be the dedicated storesError, not the page-level loadError.
    expect(screen.queryAllByRole('alert')).toHaveLength(1);
  });
});

describe('OwnerEditPage — listResellers succeeded:false (Req: Owner Edit Reseller Dropdown Fetch Preserves Its Existing Silent-Failure Idiom)', () => {
  it('leaves the dropdown empty and renders no new error UI when listResellers resolves with succeeded:false', async () => {
    await setAuthUser(true);
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

    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    type ListResellersResponse = Awaited<ReturnType<typeof resellerHttpService.listResellers>>;
    vi.mocked(resellerHttpService.listResellers).mockResolvedValue({
      succeeded: false,
      data: null,
      message: null,
      actionCode: null,
      errors: [{ code: 'E01', description: 'failed' }],
    } as unknown as ListResellersResponse);

    const { OwnerEditPage } = await import('../owner-edit');
    await act(async () => {
      render(<Wrapper><OwnerEditPage /></Wrapper>);
    });

    await waitFor(() => {
      expect(screen.getByLabelText(esMessages['GENERAL.RESELLER'])).toBeInTheDocument();
    });

    // only the "--" placeholder option remains — resellers is never populated from
    // the failed response, but no error banner/message is introduced either.
    const select = screen.getByLabelText(esMessages['GENERAL.RESELLER']) as HTMLSelectElement;
    expect(select.options.length).toBe(1);
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });
});
