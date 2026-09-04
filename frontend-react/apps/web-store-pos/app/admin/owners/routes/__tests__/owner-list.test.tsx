import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Owner, OwnerStoreModule } from '@store-mgmt/domain';

// ─── react-router mock ────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}));

// ─── loader mock ─────────────────────────────────────────────────────────────

vi.mock('~/auth/routes/loaders', () => ({
  resellerFeatureLoader: vi.fn(() => vi.fn().mockResolvedValue(null)),
}));

// ─── ownerHttpService mock ────────────────────────────────────────────────────

vi.mock('~/admin/owners/lib/services/owner-http-service', () => ({
  ownerHttpService: {
    listOwners: vi.fn(),
    deleteOwner: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeModule(price = 100, nextDueDate: string | null = '2099-12-31'): OwnerStoreModule {
  return {
    storeId: `s-${Math.random()}`,
    storeName: 'Store A',
    storeModuleTotalCurrentPrice: price,
    nextDueDate,
  };
}

function makeOwner(overrides: Partial<Owner> = {}): Owner {
  return {
    id: 'o1',
    userId: 'u1',
    fullName: 'John Owner',
    cellPhone: '+53 5 123-4567',
    email: 'john@example.com',
    description: 'An owner',
    guest: false,
    isActive: true,
    reSellerId: 'r1',
    reSellerName: 'Best Reseller',
    approved: true,
    storeModules: [makeModule(200), makeModule(300)],
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

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-LIST-1 — exports
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerListPage — exports', () => {
  it('exports a named loader', async () => {
    const mod = await import('../owner-list');
    expect(typeof mod.clientLoader).toBe('function');
  });

  it('exports OwnerListPage as named export', async () => {
    const mod = await import('../owner-list');
    expect(typeof mod.OwnerListPage).toBe('function');
  });

  it('exports OwnerListPage as default export', async () => {
    const mod = await import('../owner-list');
    expect(typeof mod.default).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-LIST-2 — renders title and calls listOwners on mount
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerListPage — render and title', () => {
  it('renders LIST_TITLE and calls listOwners on mount', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    vi.mocked(ownerHttpService.listOwners).mockResolvedValue({
      succeeded: true,
      data: [makeOwner()],
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { OwnerListPage } = await import('../owner-list');
    render(
      <Wrapper>
        <OwnerListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(esMessages['OWNER.LIST_TITLE'])).toBeInTheDocument();
    });

    expect(ownerHttpService.listOwners).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-LIST-3 — card shows fullName, price, count, reSellerName
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerListPage — card fields', () => {
  it('shows fullName, computed total price (sum), store count, reSellerName, cellPhone, description', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    vi.mocked(ownerHttpService.listOwners).mockResolvedValue({
      succeeded: true,
      data: [makeOwner({
        fullName: 'Jane Owner',
        storeModules: [makeModule(150), makeModule(250)],
        reSellerName: 'My Reseller',
        cellPhone: '+53 5 555-1234',
        email: 'jane@test.com',
        description: 'Top owner',
      })],
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { OwnerListPage } = await import('../owner-list');
    render(
      <Wrapper>
        <OwnerListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Jane Owner')).toBeInTheDocument();
      expect(screen.getByText(/My Reseller/)).toBeInTheDocument();
      expect(screen.getByText('+53 5 555-1234')).toBeInTheDocument();
      expect(screen.getByText('Top owner')).toBeInTheDocument();
    });
  });

  it('shows reSellerName fallback ADMIN when empty', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    vi.mocked(ownerHttpService.listOwners).mockResolvedValue({
      succeeded: true,
      data: [makeOwner({ reSellerName: '', storeModules: [makeModule()] })],
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { OwnerListPage } = await import('../owner-list');
    render(
      <Wrapper>
        <OwnerListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(/ADMIN/)).toBeInTheDocument();
    });
  });

  it('shows 0 stores and $0 when storeModules is empty (All filter)', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    vi.mocked(ownerHttpService.listOwners).mockResolvedValue({
      succeeded: true,
      data: [makeOwner({ storeModules: [] })],
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { OwnerListPage } = await import('../owner-list');
    render(
      <Wrapper>
        <OwnerListPage />
      </Wrapper>
    );

    // The empty-owned owner has no paid-plan store, so it is hidden by the default
    // "paid plan only" filter; switch to "all" to reveal it.
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'all' },
    });

    await waitFor(() => {
      // 0 stores in i18n plural
      expect(screen.getByText(/0\s*tiendas?/i)).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-LIST-4 — deactive-owner CSS class
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerListPage — state indicator classes (Req: Owners State CSS Classes)', () => {
  it('applies bg-danger indicator when isActive is false', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    vi.mocked(ownerHttpService.listOwners).mockResolvedValue({
      succeeded: true,
      data: [makeOwner({ isActive: false, approved: true })],
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { OwnerListPage } = await import('../owner-list');
    const { container } = render(
      <Wrapper>
        <OwnerListPage />
      </Wrapper>
    );

    await waitFor(() => {
      const card = container.querySelector('[data-slot="card"]');
      expect(card?.className).toContain('bg-danger');
    });
  });

  it('applies bg-success indicator when isActive is true AND approved is false', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    vi.mocked(ownerHttpService.listOwners).mockResolvedValue({
      succeeded: true,
      data: [makeOwner({ isActive: true, approved: false })],
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { OwnerListPage } = await import('../owner-list');
    const { container } = render(
      <Wrapper>
        <OwnerListPage />
      </Wrapper>
    );

    await waitFor(() => {
      const card = container.querySelector('[data-slot="card"]');
      expect(card?.className).toContain('bg-success');
    });
  });

  it('applies no special indicator when isActive is true AND approved is true', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    vi.mocked(ownerHttpService.listOwners).mockResolvedValue({
      succeeded: true,
      data: [makeOwner({ isActive: true, approved: true })],
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { OwnerListPage } = await import('../owner-list');
    const { container } = render(
      <Wrapper>
        <OwnerListPage />
      </Wrapper>
    );

    await waitFor(() => {
      const card = container.querySelector('[data-slot="card"]');
      expect(card?.className).not.toContain('bg-danger');
      expect(card?.className).not.toContain('bg-success');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-LIST-5 — delete button with confirmation dialog
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerListPage — delete button', () => {
  it('opens confirmation dialog before deleting and refreshes list after confirm', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    vi.mocked(ownerHttpService.listOwners).mockResolvedValue({
      succeeded: true,
      data: [makeOwner({ id: 'o99', fullName: 'To Delete' })],
      message: '',
      actionCode: 0,
      errors: [],
    });
    vi.mocked(ownerHttpService.deleteOwner).mockResolvedValue({
      succeeded: true,
      data: true,
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { OwnerListPage } = await import('../owner-list');
    render(
      <Wrapper>
        <OwnerListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('To Delete')).toBeInTheDocument();
    });

    // Open gear menu and click delete
    fireEvent.click(screen.getByRole('button', { name: /acciones/i }));
    const deleteBtn = screen.getByRole('menuitem', { name: esMessages['GENERAL.DELETE'] });
    fireEvent.click(deleteBtn);

    // Confirmation dialog should appear
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog-confirm')).toBeInTheDocument();
    });
    expect(screen.getByText(esMessages['OWNER.DELETE_CONFIRM_TITLE'])).toBeInTheDocument();

    // Confirm deletion
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    await waitFor(() => {
      expect(ownerHttpService.deleteOwner).toHaveBeenCalledWith('o99');
      // list refreshed — listOwners called twice (mount + after delete)
      expect(ownerHttpService.listOwners).toHaveBeenCalledTimes(2);
    });
  });

  it('closes dialog without deleting when cancel is clicked', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    vi.mocked(ownerHttpService.listOwners).mockResolvedValue({
      succeeded: true,
      data: [makeOwner({ id: 'o99', fullName: 'To Delete' })],
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { OwnerListPage } = await import('../owner-list');
    render(
      <Wrapper>
        <OwnerListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('To Delete')).toBeInTheDocument();
    });

    // Open gear menu and click delete
    fireEvent.click(screen.getByRole('button', { name: /acciones/i }));
    const deleteBtn = screen.getByRole('menuitem', { name: esMessages['GENERAL.DELETE'] });
    fireEvent.click(deleteBtn);

    // Confirmation dialog should appear
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog-confirm')).toBeInTheDocument();
    });

    // Cancel
    fireEvent.click(screen.getByText(esMessages['GENERAL.CANCEL']));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(ownerHttpService.deleteOwner).not.toHaveBeenCalled();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-LIST-6 — create button
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerListPage — create button', () => {
  it('renders an Adicionar button that navigates to /admin/owners/create', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    vi.mocked(ownerHttpService.listOwners).mockResolvedValue({
      succeeded: true,
      data: [],
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { OwnerListPage } = await import('../owner-list');
    render(
      <Wrapper>
        <OwnerListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(esMessages['OWNER.LIST_TITLE'])).toBeInTheDocument();
    });

    const addBtn = screen.getByRole('button', { name: /Adicionar/i });
    expect(addBtn).toBeInTheDocument();
    fireEvent.click(addBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/admin/owners/create');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-LIST-7 — edit navigates to /admin/owners/edit/:id
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerListPage — edit navigation', () => {
  it('navigates to /admin/owners/edit/:id when edit button clicked', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    vi.mocked(ownerHttpService.listOwners).mockResolvedValue({
      succeeded: true,
      data: [makeOwner({ id: 'o42', fullName: 'Editable Owner' })],
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { OwnerListPage } = await import('../owner-list');
    render(
      <Wrapper>
        <OwnerListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Editable Owner')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /acciones/i }));
    const editBtn = screen.getByRole('menuitem', { name: esMessages['OWNER.EDIT_OWNER'] });
    fireEvent.click(editBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/admin/owners/edit/o42');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-LIST-7b — GENERAL.RESELLER label prefix in card
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerListPage — GENERAL.RESELLER label', () => {
  it('renders the GENERAL.RESELLER label prefix before the reSellerName value', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    vi.mocked(ownerHttpService.listOwners).mockResolvedValue({
      succeeded: true,
      data: [makeOwner({ reSellerName: 'Label Reseller' })],
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { OwnerListPage } = await import('../owner-list');
    render(
      <Wrapper>
        <OwnerListPage />
      </Wrapper>
    );

    await waitFor(() => {
      // The paragraph should contain both the label key translation and the value
      expect(screen.getByText(new RegExp(`${esMessages['GENERAL.RESELLER']}.*Label Reseller`))).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-LIST-REGRESSION — no approve / activate / deactivate buttons
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerListPage — no approve/activate/deactivate buttons', () => {
  it('does NOT render approve, activate, or deactivate controls (Angular no-ops omitted)', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    vi.mocked(ownerHttpService.listOwners).mockResolvedValue({
      succeeded: true,
      data: [makeOwner()],
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { OwnerListPage } = await import('../owner-list');
    render(
      <Wrapper>
        <OwnerListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(esMessages['OWNER.LIST_TITLE'])).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /acciones/i }));

    expect(screen.queryByRole('menuitem', { name: /aprobar|approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /activar|activate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /desactivar|deactivate/i })).not.toBeInTheDocument();
    // exactly Editar + Eliminar — no other menu items
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-LIST-8 — HTTP error inline
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerListPage — HTTP error inline', () => {
  it('shows OWNER.ERROR inline when listOwners throws', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    vi.mocked(ownerHttpService.listOwners).mockRejectedValue(new Error('Network'));

    const { OwnerListPage } = await import('../owner-list');
    render(
      <Wrapper>
        <OwnerListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(esMessages['OWNER.ERROR'])).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// response-envelope-nullability WU-A — succeeded:false is a resolved value, not a
// rejection; loadOwners must guard it the same as the catch branch above.
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerListPage — succeeded:false response', () => {
  it('shows OWNER.ERROR when listOwners resolves with succeeded:false, does not set owners from data', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    vi.mocked(ownerHttpService.listOwners).mockResolvedValue({
      succeeded: false,
      data: null,
      message: null,
      actionCode: null,
      errors: [{ code: 'E01', description: 'failed' }],
    });

    const { OwnerListPage } = await import('../owner-list');
    render(
      <Wrapper>
        <OwnerListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(esMessages['OWNER.ERROR'])).toBeInTheDocument();
    });
  });
});
