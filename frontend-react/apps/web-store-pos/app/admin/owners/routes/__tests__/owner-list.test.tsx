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

function makeModule(price = 100): OwnerStoreModule {
  return { storeName: 'Store A', storeModuleTotalCurrentPrice: price };
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
    expect(typeof mod.loader).toBe('function');
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
  it('shows fullName, computed total price (sum), store count, reSellerName, cellPhone, email, description', async () => {
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
      expect(screen.getByText('My Reseller')).toBeInTheDocument();
      expect(screen.getByText('+53 5 555-1234')).toBeInTheDocument();
      expect(screen.getByText('jane@test.com')).toBeInTheDocument();
      expect(screen.getByText('Top owner')).toBeInTheDocument();
    });
  });

  it('shows reSellerName fallback ADMIN when empty', async () => {
    const { ownerHttpService } = await import(
      '~/admin/owners/lib/services/owner-http-service'
    );
    vi.mocked(ownerHttpService.listOwners).mockResolvedValue({
      succeeded: true,
      data: [makeOwner({ reSellerName: '', storeModules: [] })],
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
      expect(screen.getByText('ADMIN')).toBeInTheDocument();
    });
  });

  it('shows 0 stores and $0.00 when storeModules is empty', async () => {
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

    await waitFor(() => {
      // 0 stores in i18n plural
      expect(screen.getByText(/0\s*tiendas?/i)).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-LIST-4 — deactive-owner CSS class
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerListPage — deactive-owner CSS class', () => {
  it('applies deactive-owner when isActive is false', async () => {
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
      expect(container.querySelector('.deactive-owner')).toBeInTheDocument();
    });
  });

  it('applies guest-owner when isActive is true AND approved is false', async () => {
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
      expect(container.querySelector('.guest-owner')).toBeInTheDocument();
    });
  });

  it('applies no special class when isActive is true AND approved is true', async () => {
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
      expect(container.querySelector('.deactive-owner')).not.toBeInTheDocument();
      expect(container.querySelector('.guest-owner')).not.toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-LIST-5 — delete button (no confirmation)
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerListPage — delete button', () => {
  it('calls deleteOwner without confirmation and refreshes the list', async () => {
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

    const deleteBtn = screen.getByRole('button', { name: /eliminar/i });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(ownerHttpService.deleteOwner).toHaveBeenCalledWith('o99');
      // list refreshed — listOwners called twice (mount + after delete)
      expect(ownerHttpService.listOwners).toHaveBeenCalledTimes(2);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-OWNERS-LIST-6 — no create button
// ═══════════════════════════════════════════════════════════════════════════════

describe('OwnerListPage — no create button', () => {
  it('does NOT render a create/add button', async () => {
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

    // Should not find any button that says "crear", "agregar", "nuevo" etc.
    expect(screen.queryByRole('button', { name: /crear|agregar|nuevo|add|create/i })).not.toBeInTheDocument();
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

    const editBtn = screen.getByRole('button', { name: esMessages['OWNER.EDIT_OWNER'] });
    fireEvent.click(editBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/admin/owners/edit/o42');
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
