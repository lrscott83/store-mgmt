import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { Currency, EModules, PaymentType } from '@store-mgmt/domain';
import type { SaleCredit } from '@store-mgmt/domain';
import { TodaySaleCreditsPage } from '../today-credits';

// Mutable auth state: storeModuleIds toggles the MultiMonedas gate per test.
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

const credits = vi.hoisted(() => ({ items: [] as SaleCredit[] }));
vi.mock('~/sales/lib/services/sale-credit-offline-service', () => ({
  SaleCreditOfflineService: vi.fn().mockImplementation(() => ({
    getSaleCreditsInDayObservable: vi.fn().mockResolvedValue({
      data: credits.items,
      succeeded: true,
      message: '',
      actionCode: 200,
      errors: [],
    }),
  })),
}));

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
      <TodaySaleCreditsPage />
    </IntlProvider>,
  );
}

const header = () => document.querySelector('[data-slot="card-header"]') as HTMLElement;

describe('TodaySaleCreditsPage — filtro de moneda (MultiMonedas)', () => {
  beforeEach(() => {
    auth.state.user = { selectedStoreId: 's1', storeModuleIds: [] };
    credits.items = [];
  });

  it('gate OFF: mantiene el total mezclado legacy (75\u00A0CUP) y sin filtro', async () => {
    credits.items = [
      makeCredit({ id: 'usd', total: 30, currency: Currency.USD }),
      makeCredit({ id: 'eur', total: 45, currency: Currency.EUR }),
    ];
    renderPage();
    expect((await screen.findAllByText('Ana')).length).toBeGreaterThan(0);
    expect(within(header()).getByText('75 CUP')).toBeInTheDocument();
    expect(screen.queryByTestId('currency-filter-select')).not.toBeInTheDocument();
    // Filas: cada crédito conserva su propia moneda.
    expect(screen.getByText('30 USD')).toBeInTheDocument();
    expect(screen.getByText('45 EUR')).toBeInTheDocument();
  });

  it('gate ON + 2 monedas: header y filas quedan en la moneda por defecto (USD)', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    credits.items = [
      makeCredit({ id: 'usd', total: 30, currency: Currency.USD }),
      makeCredit({ id: 'eur', total: 45, currency: Currency.EUR }),
    ];
    renderPage();
    expect(await screen.findByTestId('currency-filter-select')).toBeInTheDocument();
    expect(within(header()).getByText('30 USD')).toBeInTheDocument();
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
    expect(within(header()).getByText('45 EUR')).toBeInTheDocument();
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
    expect((await screen.findAllByText('Ana')).length).toBeGreaterThan(0);
    expect(within(header()).getByText('75 USD')).toBeInTheDocument();
    expect(screen.queryByTestId('currency-filter-select')).not.toBeInTheDocument();
  });

  it('gate ON + 2 monedas: el header cuenta TODOS los visibles y suma solo los impagos de esa moneda', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    credits.items = [
      makeCredit({ id: 'usd', total: 30, currency: Currency.USD }),
      makeCredit({ id: 'usd-paid', total: 20, isPaid: true, paid: 20, currency: Currency.USD }),
      makeCredit({ id: 'eur', total: 45, currency: Currency.EUR }),
    ];
    renderPage();
    await screen.findByTestId('currency-filter-select');
    expect((await screen.findAllByText('Ana')).length).toBeGreaterThan(0);
    // USD por defecto: 2 créditos visibles (uno pagado) y el total solo suma el impago (30).
    expect(within(header()).getByText('(2)')).toBeInTheDocument();
    expect(within(header()).getByText('30 USD')).toBeInTheDocument();
  });
});
