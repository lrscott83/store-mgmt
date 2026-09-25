import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { Currency, EModules, OrderType, PaymentType } from '@store-mgmt/domain';
import type { Order } from '@store-mgmt/domain';
import { TodayOrdersPage } from '../today-orders';

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

const fixtures = vi.hoisted(() => ({ todayOrders: [] as Order[] }));
vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: vi.fn().mockImplementation(() => ({
    getActiveOrdersInDay: vi.fn(() => fixtures.todayOrders),
    updateTodayOrder: vi.fn(),
    deactivateOrder: vi.fn(),
  })),
}));

vi.mock('../components/order-list', () => ({ OrderList: () => null }));

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'o1',
    orderItems: [],
    total: 100,
    itemsCount: 1,
    date: new Date(),
    type: OrderType.Normal,
    paymentType: PaymentType.Efectivo,
    isCredit: false,
    description: '',
    isActive: true,
    createdDate: new Date(),
    createdByName: 'test',
    ...overrides,
  } as Order;
}

function renderPage() {
  return render(
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      <TodayOrdersPage />
    </IntlProvider>,
  );
}

describe('TodayOrdersPage — filtro de moneda (MultiMonedas)', () => {
  beforeEach(() => {
    auth.state.user = { selectedStoreId: 's1', storeModuleIds: [] };
    fixtures.todayOrders = [];
  });

  it('gate OFF: mixes rows into the legacy single total (unchanged behavior)', () => {
    fixtures.todayOrders = [
      makeOrder({ id: 'usd', total: 30, currency: Currency.USD }),
      makeOrder({ id: 'eur', total: 5, currency: Currency.EUR }),
    ];
    renderPage();
    expect(screen.getByText('35 CUP')).toBeInTheDocument();
    expect(screen.queryByTestId('currency-filter-select')).not.toBeInTheDocument();
  });

  it('gate ON + 2 monedas: muestra el filtro y solo la moneda por defecto (USD)', () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    fixtures.todayOrders = [
      makeOrder({ id: 'usd', total: 30, currency: Currency.USD }),
      makeOrder({ id: 'eur', total: 5, currency: Currency.EUR }),
    ];
    renderPage();
    expect(screen.getByTestId('currency-filter-select')).toBeInTheDocument();
    expect(screen.getByText('30 USD')).toBeInTheDocument();
    // La moneda no elegida no se mezcla: no hay chips ni suma combinada.
    expect(screen.queryByText('5 EUR')).toBeNull();
    expect(screen.queryByText('35 CUP')).toBeNull();
  });

  it('gate ON + 2 monedas: cambiar el select cambia los datos y el filtro sigue visible', () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    fixtures.todayOrders = [
      makeOrder({ id: 'usd', total: 30, currency: Currency.USD }),
      makeOrder({ id: 'eur', total: 5, currency: Currency.EUR }),
    ];
    renderPage();
    fireEvent.change(screen.getByTestId('currency-filter-select'), {
      target: { value: String(Currency.EUR) },
    });
    expect(screen.getByText('5 EUR')).toBeInTheDocument();
    expect(screen.queryByText('30 USD')).toBeNull();
    expect(screen.getByTestId('currency-filter-select')).toBeInTheDocument();
  });

  it('gate ON + 1 moneda: sin filtro y sin filtrar (todos los datos visibles)', () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    fixtures.todayOrders = [
      makeOrder({ id: 'usd-1', total: 30, currency: Currency.USD }),
      makeOrder({ id: 'usd-2', total: 5, currency: Currency.USD }),
    ];
    renderPage();
    expect(screen.queryByTestId('currency-filter-select')).not.toBeInTheDocument();
    expect(screen.getByText('35 USD')).toBeInTheDocument();
  });

  it('gate ON with a single CUP currency shows the code, not the symbol', () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    fixtures.todayOrders = [makeOrder({ id: 'cup', total: 100 })];
    renderPage();
    expect(screen.getByText('100 CUP')).toBeInTheDocument();
    expect(screen.queryByTestId('currency-filter-select')).not.toBeInTheDocument();
  });
});
