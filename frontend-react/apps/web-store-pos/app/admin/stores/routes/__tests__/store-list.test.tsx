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

// ─── resellerLoader mock ─────────────────────────────────────────────────────

vi.mock('~/auth/routes/loaders', () => ({
  resellerLoader: vi.fn().mockResolvedValue(null),
}));

// ─── storeHttpService mock ────────────────────────────────────────────────────

vi.mock('~/management/stores/lib/services/store-http-service', () => ({
  storeHttpService: {
    listStores: vi.fn(),
    approveStore: vi.fn(),
    disapproveStore: vi.fn(),
    toggleStorePlan: vi.fn(),
  },
}));

// ─── blocking-alert (confirmDialog) mock ──────────────────────────────────────

const mockConfirmDialog = vi.fn();
vi.mock('~/shared/lib/blocking-alert', () => ({
  confirmDialog: (...args: unknown[]) => mockConfirmDialog(...args),
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
    paymentStartDate: '2024-01-01',
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
  it('exports a named loader function equal to resellerLoader', async () => {
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
// S-ADMIN-STORES-PAGE-1 — card grid render
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

  it('renders the header FAB with the GENERAL.ADD label (Req: Store List Create Label Copy Parity)', async () => {
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

    const { AdminStoreListPage } = await import('../store-list');
    render(
      <Wrapper>
        <AdminStoreListPage />
      </Wrapper>
    );

    expect(
      screen.getByRole('button', { name: esMessages['GENERAL.ADD'] })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(storeHttpService.listStores).toHaveBeenCalledTimes(1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Approve — requires confirmation (Req: Approve/Disapprove Require Confirmation)
// ═══════════════════════════════════════════════════════════════════════════════

describe('AdminStoreListPage — approve requires confirmation', () => {
  beforeEach(async () => {
    const { storeHttpService } = await import(
      '~/management/stores/lib/services/store-http-service'
    );
    vi.mocked(storeHttpService.listStores).mockResolvedValue({
      succeeded: true,
      data: [makeStore({ id: 's1', name: 'Store One', approved: false })],
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
  });

  it('confirmed (true) -> calls approveStore then re-fetches', async () => {
    mockConfirmDialog.mockResolvedValue(true);
    const { storeHttpService } = await import(
      '~/management/stores/lib/services/store-http-service'
    );

    const { AdminStoreListPage } = await import('../store-list');
    render(
      <Wrapper>
        <AdminStoreListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Store One')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('store-actions-toggle-s1'));
    fireEvent.click(screen.getByRole('menuitem', { name: esMessages['STORES.APPROVE'] }));

    await waitFor(() => {
      expect(mockConfirmDialog).toHaveBeenCalledTimes(1);
      expect(mockConfirmDialog).toHaveBeenCalledWith({
        title: esMessages['STORES.APPROVE_CONFIRM_TITLE'],
        message: esMessages['STORES.APPROVE_CONFIRM_MESSAGE'],
        confirmButtonText: esMessages['GENERAL.YES'],
        cancelButtonText: esMessages['GENERAL.NO'],
      });
      expect(storeHttpService.approveStore).toHaveBeenCalledWith('s1');
      expect(storeHttpService.listStores).toHaveBeenCalledTimes(2);
    });
  });

  it('cancelled (false) -> does NOT call approveStore, status unchanged', async () => {
    mockConfirmDialog.mockResolvedValue(false);
    const { storeHttpService } = await import(
      '~/management/stores/lib/services/store-http-service'
    );

    const { AdminStoreListPage } = await import('../store-list');
    render(
      <Wrapper>
        <AdminStoreListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Store One')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('store-actions-toggle-s1'));
    fireEvent.click(screen.getByRole('menuitem', { name: esMessages['STORES.APPROVE'] }));

    await waitFor(() => {
      expect(mockConfirmDialog).toHaveBeenCalledTimes(1);
      expect(mockConfirmDialog).toHaveBeenCalledWith({
        title: esMessages['STORES.APPROVE_CONFIRM_TITLE'],
        message: esMessages['STORES.APPROVE_CONFIRM_MESSAGE'],
        confirmButtonText: esMessages['GENERAL.YES'],
        cancelButtonText: esMessages['GENERAL.NO'],
      });
    });
    expect(storeHttpService.approveStore).not.toHaveBeenCalled();
    expect(storeHttpService.listStores).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Disapprove — requires confirmation (Req: Approve/Disapprove Require Confirmation)
// ═══════════════════════════════════════════════════════════════════════════════

describe('AdminStoreListPage — disapprove requires confirmation', () => {
  beforeEach(async () => {
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
  });

  it('confirmed (true) -> calls disapproveStore then re-fetches', async () => {
    mockConfirmDialog.mockResolvedValue(true);
    const { storeHttpService } = await import(
      '~/management/stores/lib/services/store-http-service'
    );

    const { AdminStoreListPage } = await import('../store-list');
    render(
      <Wrapper>
        <AdminStoreListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Store Beta')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('store-actions-toggle-s2'));
    fireEvent.click(screen.getByRole('menuitem', { name: esMessages['STORES.DISAPPROVE'] }));

    await waitFor(() => {
      expect(mockConfirmDialog).toHaveBeenCalledTimes(1);
      expect(mockConfirmDialog).toHaveBeenCalledWith({
        title: esMessages['STORES.DISAPPROVE_CONFIRM_TITLE'],
        message: esMessages['STORES.DISAPPROVE_CONFIRM_MESSAGE'],
        confirmButtonText: esMessages['GENERAL.YES'],
        cancelButtonText: esMessages['GENERAL.NO'],
      });
      expect(storeHttpService.disapproveStore).toHaveBeenCalledWith('s2');
      expect(storeHttpService.listStores).toHaveBeenCalledTimes(2);
    });
  });

  it('cancelled (false) -> does NOT call disapproveStore, status unchanged', async () => {
    mockConfirmDialog.mockResolvedValue(false);
    const { storeHttpService } = await import(
      '~/management/stores/lib/services/store-http-service'
    );

    const { AdminStoreListPage } = await import('../store-list');
    render(
      <Wrapper>
        <AdminStoreListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Store Beta')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('store-actions-toggle-s2'));
    fireEvent.click(screen.getByRole('menuitem', { name: esMessages['STORES.DISAPPROVE'] }));

    await waitFor(() => {
      expect(mockConfirmDialog).toHaveBeenCalledTimes(1);
      expect(mockConfirmDialog).toHaveBeenCalledWith({
        title: esMessages['STORES.DISAPPROVE_CONFIRM_TITLE'],
        message: esMessages['STORES.DISAPPROVE_CONFIRM_MESSAGE'],
        confirmButtonText: esMessages['GENERAL.YES'],
        cancelButtonText: esMessages['GENERAL.NO'],
      });
    });
    expect(storeHttpService.disapproveStore).not.toHaveBeenCalled();
    expect(storeHttpService.listStores).toHaveBeenCalledTimes(1);
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

  it('shows the connectivity message (GENERAL.OFFLINE) when listStores rejects with a tagged network error', async () => {
    // api-client.ts's response interceptor tags `isNetworkError` when the call never
    // reached a server (offline / 30s timeout).
    const { storeHttpService } = await import(
      '~/management/stores/lib/services/store-http-service'
    );
    vi.mocked(storeHttpService.listStores).mockRejectedValue({
      isNetworkError: true,
      message: 'Network Error',
    } as unknown as Error);

    const { AdminStoreListPage } = await import('../store-list');
    render(
      <Wrapper>
        <AdminStoreListPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(esMessages['GENERAL.OFFLINE'])).toBeInTheDocument();
    });
    expect(screen.queryByText(esMessages['STORES.ERROR'])).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// response-envelope-nullability WU-A — succeeded:false is a resolved value, not a
// rejection; loadStores must guard it the same as the catch branch above.
// ═══════════════════════════════════════════════════════════════════════════════

describe('AdminStoreListPage — succeeded:false response', () => {
  it('shows STORES.ERROR when listStores resolves with succeeded:false, does not set stores from data', async () => {
    const { storeHttpService } = await import(
      '~/management/stores/lib/services/store-http-service'
    );
    vi.mocked(storeHttpService.listStores).mockResolvedValue({
      succeeded: false,
      data: null,
      message: null,
      actionCode: null,
      errors: [{ code: 'E01', description: 'failed' }],
    });

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
// S-ADMIN-STORES-PAGE-6 — Activate/Deactivate NOT wired (Req: Activate/Deactivate Removed)
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

// ═══════════════════════════════════════════════════════════════════════════════
// store-plan-toggle R3 — Change Plan action: direction-aware confirm dialog,
// cancel-no-call, POST + list refresh (spec scenarios: Free→Paid dialog copy,
// Paid→Free dialog copy, Cancel dialog, List refreshes after toggle)
// ═══════════════════════════════════════════════════════════════════════════════

describe('AdminStoreListPage — toggle plan', () => {
  beforeEach(async () => {
    const { storeHttpService } = await import(
      '~/management/stores/lib/services/store-http-service'
    );
    vi.mocked(storeHttpService.toggleStorePlan).mockResolvedValue({
      succeeded: true,
      data: true,
      message: '',
      actionCode: 0,
      errors: [],
    });
  });

  it('Free→Paid store shows "Activar plan pago" dialog copy and re-fetches after confirm', async () => {
    mockConfirmDialog.mockResolvedValue(true);
    const { storeHttpService } = await import(
      '~/management/stores/lib/services/store-http-service'
    );
    vi.mocked(storeHttpService.listStores).mockResolvedValue({
      succeeded: true,
      data: [makeStore({ id: 's1', name: 'Store One', paymentStartDate: null })],
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

    // Free stores are only visible under the "free-plan" filter.
    fireEvent.change(screen.getByLabelText(esMessages['STORES.FILTER_LABEL']), {
      target: { value: 'free-plan' },
    });

    await waitFor(() => {
      expect(screen.getByText('Store One')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('store-actions-toggle-s1'));
    fireEvent.click(screen.getByRole('menuitem', { name: esMessages['STORES.CHANGE_PLAN'] }));

    await waitFor(() => {
      expect(mockConfirmDialog).toHaveBeenCalledWith({
        title: esMessages['STORES.ACTIVATE_PAID_TITLE'],
        message: esMessages['STORES.ACTIVATE_PAID_MESSAGE'],
        confirmButtonText: esMessages['GENERAL.YES'],
        cancelButtonText: esMessages['GENERAL.NO'],
      });
      expect(storeHttpService.toggleStorePlan).toHaveBeenCalledWith('s1');
      expect(storeHttpService.listStores).toHaveBeenCalledTimes(2);
    });
  });

  it('Paid→Free store shows "Desactivar plan pago" dialog copy and re-fetches after confirm', async () => {
    mockConfirmDialog.mockResolvedValue(true);
    const { storeHttpService } = await import(
      '~/management/stores/lib/services/store-http-service'
    );
    vi.mocked(storeHttpService.listStores).mockResolvedValue({
      succeeded: true,
      data: [makeStore({ id: 's2', name: 'Store Two', paymentStartDate: '2024-01-01' })],
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
      expect(screen.getByText('Store Two')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('store-actions-toggle-s2'));
    fireEvent.click(screen.getByRole('menuitem', { name: esMessages['STORES.CHANGE_PLAN'] }));

    await waitFor(() => {
      expect(mockConfirmDialog).toHaveBeenCalledWith({
        title: esMessages['STORES.DEACTIVATE_PAID_TITLE'],
        message: esMessages['STORES.DEACTIVATE_PAID_MESSAGE'],
        confirmButtonText: esMessages['GENERAL.YES'],
        cancelButtonText: esMessages['GENERAL.NO'],
      });
      expect(storeHttpService.toggleStorePlan).toHaveBeenCalledWith('s2');
      expect(storeHttpService.listStores).toHaveBeenCalledTimes(2);
    });
  });

  it('cancel (false) -> does NOT call toggleStorePlan, list NOT re-fetched', async () => {
    mockConfirmDialog.mockResolvedValue(false);
    const { storeHttpService } = await import(
      '~/management/stores/lib/services/store-http-service'
    );
    vi.mocked(storeHttpService.listStores).mockResolvedValue({
      succeeded: true,
      data: [makeStore({ id: 's3', name: 'Store Three' })],
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
      expect(screen.getByText('Store Three')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('store-actions-toggle-s3'));
    fireEvent.click(screen.getByRole('menuitem', { name: esMessages['STORES.CHANGE_PLAN'] }));

    await waitFor(() => {
      expect(mockConfirmDialog).toHaveBeenCalledTimes(1);
    });
    expect(storeHttpService.toggleStorePlan).not.toHaveBeenCalled();
    expect(storeHttpService.listStores).toHaveBeenCalledTimes(1);
  });
});
