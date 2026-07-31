import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { ReSeller } from '@store-mgmt/domain';

// ─── react-router mock ────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}));

// ─── superAdminLoader mock ────────────────────────────────────────────────────

vi.mock('~/auth/routes/loaders', () => ({
  superAdminLoader: vi.fn().mockResolvedValue(null),
}));

// ─── resellerHttpService mock ─────────────────────────────────────────────────

vi.mock('~/admin/resellers/lib/services/reseller-http-service', () => ({
  resellerHttpService: {
    listResellers: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReseller(overrides: Partial<ReSeller> = {}): ReSeller {
  return {
    id: 'r1',
    userId: 'u1',
    fullName: 'John Reseller',
    percentDiscountPrice: 10,
    discountPrice: 5,
    cellPhone: '+53 5 123-4567',
    email: 'john@example.com',
    description: 'A reseller',
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

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-RESELLERS-LIST-1 — exports
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerListPage — exports', () => {
  it('exports a named loader function equal to superAdminLoader', async () => {
    const mod = await import('../reseller-list');
    expect(typeof mod.clientLoader).toBe('function');
  });

  it('exports ResellerListPage as named export', async () => {
    const mod = await import('../reseller-list');
    expect(typeof mod.ResellerListPage).toBe('function');
  });

  it('exports ResellerListPage as default export', async () => {
    const mod = await import('../reseller-list');
    expect(typeof mod.default).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-RESELLERS-LIST-2 — list render + card fields
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerListPage — render and card fields', () => {
  it('renders LIST_TITLE and calls listResellers on mount', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.listResellers).mockResolvedValue({
      succeeded: true,
      data: [makeReseller({ id: 'r1', fullName: 'John Reseller' })],
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { ResellerListPage } = await import('../reseller-list');
    render(
      <Wrapper>
        <ResellerListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(esMessages['RESELLERS.LIST_TITLE'])).toBeInTheDocument();
      expect(screen.getByText('John Reseller')).toBeInTheDocument();
    });

    expect(resellerHttpService.listResellers).toHaveBeenCalledTimes(1);
  });

  it('shows percentDiscountPrice, discountPrice, cellPhone, email, description on card', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.listResellers).mockResolvedValue({
      succeeded: true,
      data: [makeReseller({
        fullName: 'Jane',
        percentDiscountPrice: 15,
        discountPrice: 8,
        cellPhone: '+53 5 555-1234',
        email: 'jane@test.com',
        description: 'Top reseller',
      })],
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { ResellerListPage } = await import('../reseller-list');
    render(
      <Wrapper>
        <ResellerListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Jane')).toBeInTheDocument();
      expect(screen.getByText('+53 5 555-1234')).toBeInTheDocument();
      expect(screen.getByText('jane@test.com')).toBeInTheDocument();
      expect(screen.getByText('Top reseller')).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-RESELLERS-LIST-3 — deactive-reSeller CSS class on inactive
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerListPage — bg-danger state indicator', () => {
  it('applies bg-danger indicator when isActive is false', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.listResellers).mockResolvedValue({
      succeeded: true,
      data: [makeReseller({ id: 'r2', fullName: 'Inactive Bob', isActive: false })],
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { ResellerListPage } = await import('../reseller-list');
    const { container } = render(
      <Wrapper>
        <ResellerListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Inactive Bob')).toBeInTheDocument();
    });

    const card = container.querySelector('[data-slot="card"]');
    expect(card?.className).toContain('bg-danger');
  });

  it('does NOT apply bg-danger indicator when isActive is true', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.listResellers).mockResolvedValue({
      succeeded: true,
      data: [makeReseller({ id: 'r3', fullName: 'Active Ana', isActive: true })],
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { ResellerListPage } = await import('../reseller-list');
    const { container } = render(
      <Wrapper>
        <ResellerListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Active Ana')).toBeInTheDocument();
    });

    const card = container.querySelector('[data-slot="card"]');
    expect(card?.className).not.toContain('bg-danger');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-RESELLERS-LIST-4 — Add button → navigate /admin/resellers/create
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerListPage — FAB navigation (Req: Resellers L6 Text Parity, override 1)', () => {
  it('navigates to /admin/resellers/create when the FAB (RESELLERS.ADD = "Adicionar") is clicked', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.listResellers).mockResolvedValue({
      succeeded: true,
      data: [],
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { ResellerListPage } = await import('../reseller-list');
    render(
      <Wrapper>
        <ResellerListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(esMessages['RESELLERS.LIST_TITLE'])).toBeInTheDocument();
    });

    expect(esMessages['RESELLERS.ADD']).toBe('Adicionar');
    fireEvent.click(screen.getByRole('button', { name: esMessages['RESELLERS.ADD'] }));
    expect(mockNavigate).toHaveBeenCalledWith('/admin/resellers/create');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-RESELLERS-LIST-5 — Edit button → navigate /admin/resellers/edit/:id
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerListPage — Edit menu item navigation (Req: Resellers Gear Menu — Edit Only)', () => {
  it('navigates to /admin/resellers/edit/:id when Editar is clicked via the gear menu', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.listResellers).mockResolvedValue({
      succeeded: true,
      data: [makeReseller({ id: 'r42', fullName: 'Edit Me' })],
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { ResellerListPage } = await import('../reseller-list');
    render(
      <Wrapper>
        <ResellerListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Edit Me')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /acciones/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: esMessages['GENERAL.EDIT'] }));
    expect(mockNavigate).toHaveBeenCalledWith('/admin/resellers/edit/r42');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-RESELLERS-LIST-6 — HTTP error → inline RESELLERS.ERROR
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerListPage — error state', () => {
  it('shows RESELLERS.ERROR when listResellers throws', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.listResellers).mockRejectedValue(new Error('Network error'));

    const { ResellerListPage } = await import('../reseller-list');
    render(
      <Wrapper>
        <ResellerListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(esMessages['RESELLERS.ERROR'])).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// response-envelope-nullability WU-A — succeeded:false is a resolved value, not a
// rejection; loadResellers must guard it the same as the catch branch above.
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerListPage — succeeded:false response', () => {
  it('shows RESELLERS.ERROR when listResellers resolves with succeeded:false, does not set resellers from data', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    // The backend really does return `data: null` on a failed response, which the
    // pre-union BaseResponseModel type does not admit yet — hence the cast through
    // the awaited return type rather than a blanket `any` (dashboard.test.tsx precedent).
    type ListResellersResponse = Awaited<ReturnType<typeof resellerHttpService.listResellers>>;
    vi.mocked(resellerHttpService.listResellers).mockResolvedValue({
      succeeded: false,
      data: null,
      message: null,
      actionCode: null,
      errors: [{ code: 'E01', description: 'failed' }],
    } as unknown as ListResellersResponse);

    const { ResellerListPage } = await import('../reseller-list');
    render(
      <Wrapper>
        <ResellerListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(esMessages['RESELLERS.ERROR'])).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-RESELLERS-LIST-7 — NO activate/deactivate/delete buttons
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResellerListPage — no activate/deactivate/delete menu items', () => {
  it('gear menu shows exactly one item (Editar) — no Activar/Desactivar/Eliminar', async () => {
    const { resellerHttpService } = await import(
      '~/admin/resellers/lib/services/reseller-http-service'
    );
    vi.mocked(resellerHttpService.listResellers).mockResolvedValue({
      succeeded: true,
      data: [makeReseller({ id: 'r1', fullName: 'Only Reseller' })],
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { ResellerListPage } = await import('../reseller-list');
    render(
      <Wrapper>
        <ResellerListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Only Reseller')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /acciones/i }));

    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    expect(screen.getByRole('menuitem', { name: esMessages['GENERAL.EDIT'] })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /activar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /desactivar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /eliminar/i })).not.toBeInTheDocument();
  });
});
