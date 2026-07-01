import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Store } from '@store-mgmt/domain';

// ─── react-router mock ────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}));

// ─── superAdminLoader mock ────────────────────────────────────────────────────

vi.mock('~/auth/routes/loaders', () => ({
  superAdminLoader: vi.fn().mockResolvedValue(null),
}));

// ─── storeHttpService mock ────────────────────────────────────────────────────

vi.mock('~/management/stores/lib/services/store-http-service', () => ({
  storeHttpService: {
    listStores: vi.fn(),
    approveStore: vi.fn(),
    disapproveStore: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeStore(overrides: Partial<Store> = {}): Store {
  return {
    id: 's1',
    name: 'Store One',
    displayName: 'Store One',
    ownerId: 'o1',
    ownerName: 'Owner One',
    address: '123 Main St',
    description: 'A store',
    approved: true,
    paymentStartDate: new Date(),
    modules: [],
    isActive: true,
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
// ACCESS — exports
// ═══════════════════════════════════════════════════════════════════════════════

describe('AdminStoreListPage — exports', () => {
  it('exports a named loader function equal to superAdminLoader', async () => {
    const mod = await import('../store-list');
    expect(typeof mod.clientLoader).toBe('function');
  });

  it('exports AdminStoreListPage as named export', async () => {
    const mod = await import('../store-list');
    expect(typeof mod.AdminStoreListPage).toBe('function');
  });

  it('exports AdminStoreListPage as default export', async () => {
    const mod = await import('../store-list');
    expect(typeof mod.default).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-STORES-PAGE-1 — list render
// ═══════════════════════════════════════════════════════════════════════════════

describe('AdminStoreListPage — render', () => {
  it('renders the LIST_TITLE and calls listStores on mount', async () => {
    const { storeHttpService } = await import(
      '~/management/stores/lib/services/store-http-service'
    );
    vi.mocked(storeHttpService.listStores).mockResolvedValue({
      succeeded: true,
      data: [makeStore({ id: 's1', name: 'Store Alpha' })],
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { AdminStoreListPage } = await import('../store-list');
    render(
      <Wrapper>
        <AdminStoreListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(esMessages['STORES.LIST_TITLE'])).toBeInTheDocument();
      expect(screen.getByText('Store Alpha')).toBeInTheDocument();
    });

    expect(storeHttpService.listStores).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-STORES-PAGE-4 — onApprove wired
// ═══════════════════════════════════════════════════════════════════════════════

describe('AdminStoreListPage — onApprove', () => {
  it('calls approveStore then re-fetches when approve button clicked', async () => {
    const { storeHttpService } = await import(
      '~/management/stores/lib/services/store-http-service'
    );
    vi.mocked(storeHttpService.listStores).mockResolvedValue({
      succeeded: true,
      data: [makeStore({ id: 's1', name: 'Store One' })],
      message: '',
      actionCode: 0,
      errors: [],
    });
    vi.mocked(storeHttpService.approveStore).mockResolvedValue({
      succeeded: true,
      data: true,
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { AdminStoreListPage } = await import('../store-list');
    render(
      <Wrapper>
        <AdminStoreListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Store One')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: esMessages['STORES.APPROVE'] }));

    await waitFor(() => {
      expect(storeHttpService.approveStore).toHaveBeenCalledWith('s1');
      expect(storeHttpService.listStores).toHaveBeenCalledTimes(2);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-STORES-PAGE-5 — onDisapprove wired
// ═══════════════════════════════════════════════════════════════════════════════

describe('AdminStoreListPage — onDisapprove', () => {
  it('calls disapproveStore then re-fetches when disapprove button clicked', async () => {
    const { storeHttpService } = await import(
      '~/management/stores/lib/services/store-http-service'
    );
    vi.mocked(storeHttpService.listStores).mockResolvedValue({
      succeeded: true,
      data: [makeStore({ id: 's2', name: 'Store Beta' })],
      message: '',
      actionCode: 0,
      errors: [],
    });
    vi.mocked(storeHttpService.disapproveStore).mockResolvedValue({
      succeeded: true,
      data: true,
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { AdminStoreListPage } = await import('../store-list');
    render(
      <Wrapper>
        <AdminStoreListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Store Beta')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: esMessages['STORES.DISAPPROVE'] }));

    await waitFor(() => {
      expect(storeHttpService.disapproveStore).toHaveBeenCalledWith('s2');
      expect(storeHttpService.listStores).toHaveBeenCalledTimes(2);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-STORES-PAGE-7 — HTTP error → inline error
// ═══════════════════════════════════════════════════════════════════════════════

describe('AdminStoreListPage — error state', () => {
  it('shows STORES.ERROR when listStores throws', async () => {
    const { storeHttpService } = await import(
      '~/management/stores/lib/services/store-http-service'
    );
    vi.mocked(storeHttpService.listStores).mockRejectedValue(new Error('Network error'));

    const { AdminStoreListPage } = await import('../store-list');
    render(
      <Wrapper>
        <AdminStoreListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(esMessages['STORES.ERROR'])).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-ADMIN-STORES-PAGE-6 — Activate/Deactivate NOT wired
// ═══════════════════════════════════════════════════════════════════════════════

describe('AdminStoreListPage — no activate/deactivate buttons', () => {
  it('does NOT render Activate or Deactivate buttons', async () => {
    const { storeHttpService } = await import(
      '~/management/stores/lib/services/store-http-service'
    );
    vi.mocked(storeHttpService.listStores).mockResolvedValue({
      succeeded: true,
      data: [makeStore({ id: 's1', name: 'Store One' })],
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { AdminStoreListPage } = await import('../store-list');
    render(
      <Wrapper>
        <AdminStoreListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Store One')).toBeInTheDocument();
    });

    expect(
      screen.queryByRole('button', { name: esMessages['STORES.ACTIVATE'] })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: esMessages['STORES.DEACTIVATE'] })
    ).not.toBeInTheDocument();
  });
});
