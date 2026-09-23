import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { Currency, EModules, PaymentType } from '@store-mgmt/domain';
import type { SaleCredit } from '@store-mgmt/domain';
import { readStoreSaleCredits } from '~/shared/lib/multistore/multi-store-aggregator';
import { SaleCreditsPage } from '../credits';

const auth = vi.hoisted(() => ({
  state: {
    user: { selectedStoreId: 's1', storeModuleIds: [] as number[] },
    isAuthenticated: true,
  },
}));
vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: vi.fn((selector?: (s: typeof auth.state) => unknown) =>
    typeof selector === 'function' ? selector(auth.state) : auth.state,
  ),
}));

// Multi-store gate — OFF by default (matches the real hook for a non-owner), ON per test.
const multiStore = vi.hoisted(() => ({
  enabled: false,
  stores: [] as { id: string; name: string }[],
}));
vi.mock('~/shared/lib/hooks/use-multi-store', () => ({
  useMultiStore: () => ({ enabled: multiStore.enabled, stores: multiStore.stores }),
}));

const credits = vi.hoisted(() => ({ items: [] as SaleCredit[] }));
vi.mock('~/sales/lib/services/sale-credit-offline-service', () => ({
  SaleCreditOfflineService: vi.fn().mockImplementation(() => ({
    filterSaleCredits: vi.fn().mockResolvedValue({
      data: credits.items,
      succeeded: true,
      message: '',
      actionCode: 200,
      errors: [],
    }),
  })),
}));

vi.mock('~/shared/lib/multistore/multi-store-aggregator', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('~/shared/lib/multistore/multi-store-aggregator')>();
  return {
    ...actual,
    unwrapStoreDek: vi.fn().mockResolvedValue(new Uint8Array([1])),
    readStoreSaleCredits: vi.fn().mockReturnValue([]),
  };
});

vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: vi.fn(),
  confirmDialog: vi.fn().mockResolvedValue(true),
}));

function makeCredit(overrides: Partial<SaleCredit> = {}): SaleCredit {
  return {
    id: 'c1',
    orderId: 'o1',
    client: 'Ana',
    total: 40,
    date: new Date('2024-03-15T10:00:00.000'),
    paid: 0,
    isPaid: false,
    isActive: true,
    paidDate: null as unknown as Date,
    paidType: null as unknown as PaymentType,
    note: '',
    createdDate: new Date('2024-03-15T10:00:00.000'),
    createdByName: '',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      <SaleCreditsPage />
    </IntlProvider>,
  );
}

describe('SaleCreditsPage — MultiMonedas header + day totals', () => {
  beforeEach(() => {
    multiStore.enabled = false;
    multiStore.stores = [];
    auth.state.user = { selectedStoreId: 's1', storeModuleIds: [] };
    credits.items = [];
  });

  it('gate OFF: keeps the legacy mixed total (75 CUP)', async () => {
    credits.items = [
      makeCredit({ id: 'usd', total: 30, currency: Currency.USD }),
      makeCredit({ id: 'eur', total: 45, currency: Currency.EUR }),
    ];
    renderPage();
    expect((await screen.findAllByText('75 CUP')).length).toBeGreaterThan(0);
  });

  it('gate ON: header and day totals are per currency, never mixed', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    credits.items = [
      makeCredit({ id: 'usd', total: 30, currency: Currency.USD }),
      makeCredit({ id: 'eur', total: 45, currency: Currency.EUR }),
    ];
    renderPage();
    // Header (and the single day panel) both render the per-currency breakdown.
    expect((await screen.findAllByText('30 USD')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('45 EUR').length).toBeGreaterThan(0);
    expect(screen.queryByText('75 CUP')).toBeNull();
  });
});

describe('SaleCreditsPage — MultiMonedas header in multi-store mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    multiStore.enabled = true;
    multiStore.stores = [
      { id: 's1', name: 'Tienda A' },
      { id: 's2', name: 'Tienda B' },
    ];
    auth.state.user = { selectedStoreId: 's1', storeModuleIds: [] };
    credits.items = [];
    vi.mocked(readStoreSaleCredits).mockReturnValue([]);
  });

  function seedTwoStores() {
    vi.mocked(readStoreSaleCredits).mockImplementation((storeId) =>
      storeId === 's1'
        ? [makeCredit({ id: 'c1', total: 30, currency: Currency.USD })]
        : [makeCredit({ id: 'c2', total: 45, currency: Currency.EUR })],
    );
  }

  it('gate OFF: keeps the legacy aggregate header total across stores (75 CUP)', async () => {
    seedTwoStores();
    renderPage();
    // Header outside the panels aggregates every visible store: 30 + 45 = 75 CUP.
    expect(await screen.findByText('75 CUP')).toBeInTheDocument();
  });

  it('gate ON: the aggregate header total is per currency, never mixed', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    seedTwoStores();
    renderPage();
    // Cross-store aggregation still groups by currency: USD 30 primary + EUR 45 chip.
    expect(await screen.findByText('30 USD')).toBeInTheDocument();
    expect(screen.getByText('45 EUR')).toBeInTheDocument();
    expect(screen.queryByText('75 CUP')).toBeNull();
  });
});
