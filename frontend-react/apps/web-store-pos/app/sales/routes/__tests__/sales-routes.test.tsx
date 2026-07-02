import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { PaymentType, OrderType } from '@store-mgmt/domain';
import type { Order, SaleCredit, Product, ProductCategory } from '@store-mgmt/domain';

// --- Global mocks ---

vi.mock('~/shared/lib/stores/auth-store', () => {
  const state = { user: { selectedStoreId: 's1' }, isAuthenticated: true };
  const useAuthStore = vi.fn((selector?: (s: typeof state) => unknown) => {
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useAuthStore };
});

vi.mock('~/shared/lib/stores/cart-store', () => ({
  useCartStore: vi.fn(() => ({
    items: [],
    addItem: vi.fn(),
    paymentType: PaymentType.Efectivo,
    isCredit: false,
    clientName: '',
    setPaymentType: vi.fn(),
    setClientName: vi.fn(),
    toggleCredit: vi.fn(),
    updateQuantity: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    total: vi.fn().mockReturnValue(0),
  })),
}));

vi.mock('~/sales/lib/services/product-offline-service', () => ({
  ProductOfflineService: vi.fn().mockImplementation(() => ({
    getAll: vi.fn().mockReturnValue([]),
    getById: vi.fn().mockReturnValue(undefined),
  })),
}));

vi.mock('~/sales/lib/services/product-category-offline-service', () => ({
  ProductCategoryOfflineService: vi.fn().mockImplementation(() => ({
    getAll: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: vi.fn().mockImplementation(() => ({
    getAll: vi.fn().mockReturnValue([]),
    getActiveOrdersInDay: vi.fn().mockReturnValue([]),
    getByDateRange: vi.fn().mockReturnValue([]),
    deactivate: vi.fn(),
    update: vi.fn(),
  })),
}));

vi.mock('~/sales/lib/services/sale-credit-offline-service', () => ({
  SaleCreditOfflineService: vi.fn().mockImplementation(() => ({
    getAll: vi.fn().mockReturnValue([]),
    getActiveToday: vi.fn().mockReturnValue([]),
    getByDateRange: vi.fn().mockReturnValue([]),
    pay: vi.fn(),
    update: vi.fn(),
  })),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    orderItems: [],
    total: 100,
    itemsCount: 2,
    date: new Date('2025-01-01T10:00:00Z'),
    type: OrderType.Normal,
    paymentType: PaymentType.Efectivo,
    isCredit: false,
    description: '',
    isActive: true,
    createdDate: new Date(),
    createdByName: 'test',
    ...overrides,
  };
}

// --- SalePage ---
import { SalePage } from '../sale';

describe('SalePage — smoke render', () => {
  it('renders without crashing', () => {
    render(
      <Wrapper>
        <SalePage />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });
});

// --- TodayOrdersPage ---
import { TodayOrdersPage } from '../today-orders';

describe('TodayOrdersPage — smoke render', () => {
  it('renders without crashing', () => {
    render(
      <Wrapper>
        <TodayOrdersPage />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });

  it('shows the Angular header (Ventas del día) and empty state (reuses TODAY_STATS.NO_ORDER_FOUND)', () => {
    render(
      <Wrapper>
        <TodayOrdersPage />
      </Wrapper>,
    );
    expect(screen.getByText('Ventas del día')).toBeInTheDocument();
    expect(
      screen.getByText('No se ha realizado ninguna venta en el día de hoy.'),
    ).toBeInTheDocument();
  });

  it('renders payment-type and isCredit radio filters', () => {
    render(
      <Wrapper>
        <TodayOrdersPage />
      </Wrapper>,
    );
    expect(screen.getByText('Pagadas')).toBeInTheDocument();
    expect(screen.getByText('Créditos')).toBeInTheDocument();
  });
});

// --- OrdersPage ---
import { OrdersPage } from '../orders';

describe('OrdersPage — smoke render', () => {
  it('renders without crashing', () => {
    render(
      <Wrapper>
        <OrdersPage />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });

  it('shows the Angular header (Historial de Ventas) and empty state', () => {
    render(
      <Wrapper>
        <OrdersPage />
      </Wrapper>,
    );
    expect(screen.getByText('Historial de Ventas')).toBeInTheDocument();
    expect(screen.getByText('No se encontró ninguna venta')).toBeInTheDocument();
  });
});

// --- TodayStatsPage ---
import { TodayStatsPage } from '../today-stats';

describe('TodayStatsPage — smoke render', () => {
  it('renders without crashing', () => {
    render(
      <Wrapper>
        <TodayStatsPage />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });
});

// --- TodaySaleCreditsPage ---
import { TodaySaleCreditsPage } from '../today-credits';

describe('TodaySaleCreditsPage — smoke render', () => {
  it('renders without crashing', () => {
    render(
      <Wrapper>
        <TodaySaleCreditsPage />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });

  it('shows empty credits state', () => {
    render(
      <Wrapper>
        <TodaySaleCreditsPage />
      </Wrapper>,
    );
    expect(screen.getByText(/No hay créditos/i)).toBeInTheDocument();
  });
});

// --- SaleCreditsPage ---
import { SaleCreditsPage } from '../credits';

describe('SaleCreditsPage — smoke render', () => {
  it('renders without crashing', () => {
    render(
      <Wrapper>
        <SaleCreditsPage />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });
});
