import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

describe('TodayOrdersPage — MultiMonedas header total', () => {
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
  });

  it('gate ON: primary + chips, never the mixed sum', () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    fixtures.todayOrders = [
      makeOrder({ id: 'usd', total: 30, currency: Currency.USD }),
      makeOrder({ id: 'eur', total: 5, currency: Currency.EUR }),
    ];
    renderPage();
    expect(screen.getByText('30 USD')).toBeInTheDocument();
    expect(screen.getByText('5 EUR')).toBeInTheDocument();
    expect(screen.queryByText('35 CUP')).toBeNull();
  });

  it('gate ON with a single CUP currency shows the code, not the symbol', () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    fixtures.todayOrders = [makeOrder({ id: 'cup', total: 100 })];
    renderPage();
    expect(screen.getByText('100 CUP')).toBeInTheDocument();
    // 2026-09-23: el total con moneda existe por diseño — sin aserción de ausencia.
  });
});
