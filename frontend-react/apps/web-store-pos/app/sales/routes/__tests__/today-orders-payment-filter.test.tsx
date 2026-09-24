import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { Currency, OrderType, PaymentType, SalePaymentMethod } from '@store-mgmt/domain';
import type { Order } from '@store-mgmt/domain';
import { TodayOrdersPage } from '../today-orders';

// --- Mocks (same seam as orders.test.tsx) ---

const fixtures = vi.hoisted(() => ({
  todayOrders: [] as Order[],
}));

vi.mock('~/shared/lib/stores/auth-store', () => {
  const state = {
    user: { selectedStoreId: 's1', storeModuleIds: [] as number[] },
    isAuthenticated: true,
  };
  const useAuthStore = vi.fn((selector?: (s: typeof state) => unknown) =>
    typeof selector === 'function' ? selector(state) : state,
  );
  return { useAuthStore };
});

vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: vi.fn().mockImplementation(() => ({
    getActiveOrdersInDay: vi.fn(() => fixtures.todayOrders),
    updateTodayOrder: vi.fn().mockReturnValue({ succeeded: true, errors: [] }),
    deactivateOrder: vi.fn().mockReturnValue({ succeeded: true, errors: [] }),
  })),
}));

vi.mock('../components/order-list', () => ({
  OrderList: vi.fn(() => null),
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

beforeEach(() => {
  fixtures.todayOrders = [];
});

describe('TodayOrdersPage — filtro dinámico de métodos de pago', () => {
  it('sin ventas muestra solo Todas', () => {
    render(
      <Wrapper>
        <TodayOrdersPage />
      </Wrapper>,
    );
    // «Todas» existe en ambos fieldsets (pago y crédito) — lo que importa es
    // que NO aparece ninguna opción de método.
    expect(screen.getAllByText('Todas').length).toBe(2);
    expect(screen.queryByText('Efectivo')).not.toBeInTheDocument();
    expect(screen.queryByText('Zelle')).not.toBeInTheDocument();
  });

  it('T9: Efectivo + Zelle → Zelle se presenta como Transferencia (CUP)', () => {
    fixtures.todayOrders = [
      makeOrder({ id: 'o1', paymentType: PaymentType.Efectivo }),
      makeOrder({ id: 'o2', paymentType: PaymentType.Zelle }),
    ];
    render(
      <Wrapper>
        <TodayOrdersPage />
      </Wrapper>,
    );
    expect(screen.getAllByText('Todas').length).toBe(2);
    expect(screen.getByText('Efectivo')).toBeInTheDocument();
    expect(screen.getByText('Transferencia (CUP)')).toBeInTheDocument();
    expect(screen.queryByText('Zelle')).not.toBeInTheDocument();
  });

  it('legacy Tarjeta se ofrece y filtra como Transferencia (CUP)', () => {
    fixtures.todayOrders = [
      makeOrder({ id: 'o1', paymentType: PaymentType.Efectivo }),
      makeOrder({ id: 'o2', paymentType: PaymentType.Tarjeta }),
    ];
    render(
      <Wrapper>
        <TodayOrdersPage />
      </Wrapper>,
    );
    fireEvent.click(screen.getByText('Transferencia (CUP)'));
    // Solo la orden Tarjeta cae bajo el filtro — el header queda en 1 item.
    expect(screen.getByText('(1)')).toBeInTheDocument();
  });

  it('T9: filtrar por Transferencia (CUP) oculta las ventas en Efectivo (header (1))', () => {
    fixtures.todayOrders = [
      makeOrder({ id: 'o1', paymentType: PaymentType.Efectivo, total: 100 }),
      makeOrder({ id: 'o2', paymentType: PaymentType.Zelle, total: 50 }),
    ];
    render(
      <Wrapper>
        <TodayOrdersPage />
      </Wrapper>,
    );
    fireEvent.click(screen.getByText('Transferencia (CUP)'));
    expect(screen.getByText('(1)')).toBeInTheDocument();
  });

  it('T9: salePaymentMethod Transferencia-USD se presenta como Transferencia (CUP)', () => {
    fixtures.todayOrders = [
      makeOrder({
        id: 'o1',
        salePaymentMethod: SalePaymentMethod.Transferencia,
        currency: Currency.USD,
      }),
    ];
    render(
      <Wrapper>
        <TodayOrdersPage />
      </Wrapper>,
    );
    expect(screen.getByText('Transferencia (CUP)')).toBeInTheDocument();
    expect(screen.queryByText('Transferencia (USD)')).not.toBeInTheDocument();
  });

  it('resetea el filtro a Todas cuando los datos cambian y el método ya no existe', () => {
    fixtures.todayOrders = [makeOrder({ id: 'o1', paymentType: PaymentType.Zelle })];
    const { rerender } = render(
      <Wrapper>
        <TodayOrdersPage />
      </Wrapper>,
    );
    fireEvent.click(screen.getByText('Transferencia (CUP)'));
    expect(screen.getByText('(1)')).toBeInTheDocument();

    // Los datos cambian: ya no hay ventas Zelle/Transferencia — el filtro activo deja de existir.
    fixtures.todayOrders = [makeOrder({ id: 'o2', paymentType: PaymentType.Efectivo })];
    rerender(
      <Wrapper>
        <TodayOrdersPage />
      </Wrapper>,
    );
    // El filtro fantasma se resetea: se ven las ventas en Efectivo (1 item).
    expect(screen.getByText('(1)')).toBeInTheDocument();
  });
});
