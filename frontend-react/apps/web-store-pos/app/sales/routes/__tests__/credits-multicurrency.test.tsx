import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

describe('SaleCreditsPage — filtro de moneda (MultiMonedas)', () => {
  beforeEach(() => {
    multiStore.enabled = false;
    multiStore.stores = [];
    auth.state.user = { selectedStoreId: 's1', storeModuleIds: [] };
    credits.items = [];
  });

  it('gate OFF: mantiene el total mezclado legacy (75\u00A0CUP) y sin filtro', async () => {
    credits.items = [
      makeCredit({ id: 'usd', total: 30, currency: Currency.USD }),
      makeCredit({ id: 'eur', total: 45, currency: Currency.EUR }),
    ];
    renderPage();
    expect((await screen.findAllByText('75 CUP')).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('currency-filter-select')).not.toBeInTheDocument();
  });

  it('gate ON + 2 monedas: header y total del día quedan en la moneda por defecto (USD)', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    credits.items = [
      makeCredit({ id: 'usd', total: 30, currency: Currency.USD }),
      makeCredit({ id: 'eur', total: 45, currency: Currency.EUR }),
    ];
    renderPage();
    expect(await screen.findByTestId('currency-filter-select')).toBeInTheDocument();
    expect(screen.getAllByText('30 USD').length).toBeGreaterThan(0);
    expect(screen.queryByText('45 EUR')).toBeNull();
    expect(screen.queryByText('75 CUP')).toBeNull();
  });

  it('gate ON + 2 monedas: cambiar el select cambia los datos y el filtro sigue visible', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    credits.items = [
      makeCredit({ id: 'usd', total: 30, currency: Currency.USD }),
      makeCredit({ id: 'eur', total: 45, currency: Currency.EUR }),
    ];
    renderPage();
    await screen.findByTestId('currency-filter-select');
    fireEvent.change(screen.getByTestId('currency-filter-select'), {
      target: { value: String(Currency.EUR) },
    });
    expect(screen.getAllByText('45 EUR').length).toBeGreaterThan(0);
    expect(screen.queryByText('30 USD')).toBeNull();
    expect(screen.getByTestId('currency-filter-select')).toBeInTheDocument();
  });

  it('gate ON + 1 moneda: sin filtro y sin filtrar (todos los datos visibles)', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    credits.items = [
      makeCredit({ id: 'usd-1', total: 30, currency: Currency.USD }),
      makeCredit({ id: 'usd-2', total: 45, currency: Currency.USD }),
    ];
    renderPage();
    expect((await screen.findAllByText('75 USD')).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('currency-filter-select')).not.toBeInTheDocument();
  });
});

describe('SaleCreditsPage — filtro de moneda en modo multi-store', () => {
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

  it('gate OFF: mantiene el total agregado legacy entre tiendas (75\u00A0CUP) y sin filtro', async () => {
    seedTwoStores();
    renderPage();
    expect(await screen.findByText('75 CUP')).toBeInTheDocument();
    expect(screen.queryByTestId('currency-filter-select')).not.toBeInTheDocument();
  });

  it('gate ON + 2 monedas: el agregado y los paneles quedan en la moneda por defecto (USD)', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    seedTwoStores();
    renderPage();
    await screen.findByTestId('currency-filter-select');
    expect(screen.getAllByText('30 USD').length).toBeGreaterThan(0);
    expect(screen.queryByText('45 EUR')).toBeNull();
    expect(screen.queryByText('75 CUP')).toBeNull();
  });

  it('gate ON + 2 monedas: cambiar el select cambia el agregado y los paneles', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    seedTwoStores();
    renderPage();
    await screen.findByTestId('currency-filter-select');
    fireEvent.change(screen.getByTestId('currency-filter-select'), {
      target: { value: String(Currency.EUR) },
    });
    expect(screen.getAllByText('45 EUR').length).toBeGreaterThan(0);
    expect(screen.queryByText('30 USD')).toBeNull();
    expect(screen.getByTestId('currency-filter-select')).toBeInTheDocument();
  });
});
