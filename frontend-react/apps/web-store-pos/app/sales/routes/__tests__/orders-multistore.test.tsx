import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { EModules, OrderType, PaymentType } from '@store-mgmt/domain';
import type { Order } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import { OrdersPage } from '../orders';

// --- Mutable auth state: single-store by default, MultiStores OwnerAdmin in
// the multistore describe (REAL useMultiStore gate decides the mode). ---
const { authStoreState } = vi.hoisted(() => ({
  authStoreState: {
    user: { selectedStoreId: 's1' },
    isAuthenticated: true,
  } as {
    user: {
      selectedStoreId: string;
      isOwnerAdmin?: boolean;
      storeModuleIds?: number[];
      storeList?: Array<{ id: string; name: string; isActive?: boolean }>;
    };
    isAuthenticated: boolean;
  },
}));

// Orders read from one mutable fixture map keyed by store id — shared by both
// read paths: the offline service (single-store) and readStoreOrders (multi).
const { storeOrdersFixture } = vi.hoisted(() => ({
  storeOrdersFixture: {} as Record<string, Order[]>,
}));

vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = vi.fn((selector?: (s: typeof authStoreState) => unknown) =>
    typeof selector === 'function' ? selector(authStoreState) : authStoreState,
  );
  return { useAuthStore };
});

vi.mock('~/shared/lib/multistore/multi-store-aggregator', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('~/shared/lib/multistore/multi-store-aggregator')>();
  return {
    ...actual,
    unwrapStoreDek: vi.fn().mockResolvedValue(new Uint8Array([1])),
    readStoreOrders: vi.fn((storeId: string) => storeOrdersFixture[storeId] ?? []),
  };
});

// Single-store mode reads through the offline service (auto-init writes to the
// selected store) — point it at the same fixture map.
vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: vi.fn().mockImplementation(() => ({
    getStorageOrders: vi.fn(() => storeOrdersFixture[authStoreState.user.selectedStoreId] ?? []),
    getOrdersInDay: vi.fn(() => []),
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
    date: new Date(2026, 0, 1, 12, 0, 0),
    type: OrderType.Normal,
    paymentType: PaymentType.Efectivo,
    isCredit: false,
    description: '',
    isActive: true,
    createdDate: new Date(2026, 0, 1, 12, 0, 0),
    createdByName: 'test',
    ...overrides,
  };
}

function enableMultiStores() {
  authStoreState.user = {
    selectedStoreId: 's1',
    isOwnerAdmin: true,
    storeModuleIds: [EModules.MultiStores],
    storeList: [
      { id: 's1', name: 'Tienda Uno', isActive: true },
      { id: 's2', name: 'Tienda Dos', isActive: true },
    ],
  };
}

beforeEach(() => {
  authStoreState.user = { selectedStoreId: 's1' };
  for (const key of Object.keys(storeOrdersFixture)) delete storeOrdersFixture[key];
});

describe('OrdersPage — header «Ventas (n)» + total, línea de totales eliminada', () => {
  it('OS-1: SIN MultiStores — header «Ventas» con (n) y el total a la derecha', () => {
    storeOrdersFixture.s1 = [
      makeOrder({ id: 'o1', total: 100, date: new Date(2026, 0, 1, 12, 0, 0) }),
      makeOrder({ id: 'o2', total: 150, date: new Date(2026, 0, 2, 12, 0, 0) }),
    ];

    render(
      <Wrapper>
        <OrdersPage />
      </Wrapper>,
    );

    expect(screen.getByText('Ventas')).toBeInTheDocument();
    expect(screen.getByText('(2)')).toBeInTheDocument();
    expect(screen.getByText('250 CUP')).toBeInTheDocument();
    // The old totals row under the store filter does not exist in this mode.
    expect(screen.queryByTestId('multistore-totals')).not.toBeInTheDocument();
  });

  it('OS-2: CON MultiStores — header «Ventas (n)» + total de TODAS las tiendas y SIN línea de totales', async () => {
    enableMultiStores();
    storeOrdersFixture.s1 = [
      makeOrder({ id: 'o1', total: 100 }),
      makeOrder({ id: 'o2', total: 200 }),
    ];
    storeOrdersFixture.s2 = [makeOrder({ id: 'o3', total: 50 })];

    render(
      <Wrapper>
        <OrdersPage />
      </Wrapper>,
    );
    await screen.findByTestId('multistore-panel-toggle-s1');

    // Header shows the aggregate of every active store (3 orders, 350\u00A0CUP).
    expect(screen.getAllByText('(3)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('350 CUP').length).toBeGreaterThan(0);
    // The totals row under the store filter is REMOVED.
    expect(screen.queryByTestId('multistore-totals')).not.toBeInTheDocument();
  });

  it('OS-3: CON MultiStores — el header sigue el filtro de tienda: (n) y total solo de esa tienda', async () => {
    enableMultiStores();
    storeOrdersFixture.s1 = [
      makeOrder({ id: 'o1', total: 100 }),
      makeOrder({ id: 'o2', total: 200 }),
    ];
    storeOrdersFixture.s2 = [makeOrder({ id: 'o3', total: 50 })];

    render(
      <Wrapper>
        <OrdersPage />
      </Wrapper>,
    );
    await screen.findByTestId('multistore-panel-toggle-s1');

    fireEvent.change(screen.getByTestId('multistore-select'), { target: { value: 's2' } });

    // Only store 2 is counted now: 1 order, 50\u00A0CUP.
    expect(screen.getAllByText('(1)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('50 CUP').length).toBeGreaterThan(0);
  });

  it('OS-4: CON MultiStores — cada panel mantiene (n) + total de esa tienda en su cabecera', async () => {
    enableMultiStores();
    storeOrdersFixture.s1 = [makeOrder({ id: 'o1', total: 100 })];
    storeOrdersFixture.s2 = [];

    render(
      <Wrapper>
        <OrdersPage />
      </Wrapper>,
    );
    await screen.findByTestId('multistore-panel-toggle-s1');

    // Store panel headers keep their per-store counts/totals (s1: 1/100,\u00A0CUP s2: 0/0\u00A0CUP).
    const panel1 = screen.getByTestId('multistore-panel-toggle-s1');
    expect(panel1.textContent).toContain('(1)');
    expect(panel1.textContent).toContain('100\u00A0CUP');
    const panel2 = screen.getByTestId('multistore-panel-toggle-s2');
    expect(panel2.textContent).toContain('(0)');
    expect(panel2.textContent).toContain('0\u00A0CUP');
  });

  it('OS-5: CON MultiStores — opciones de pago = métodos presentes en el conjunto visible del filtro de tienda', async () => {
    enableMultiStores();
    storeOrdersFixture.s1 = [makeOrder({ id: 'o1', paymentType: PaymentType.Efectivo })];
    storeOrdersFixture.s2 = [makeOrder({ id: 'o2', paymentType: PaymentType.Zelle })];

    render(
      <Wrapper>
        <OrdersPage />
      </Wrapper>,
    );
    await screen.findByTestId('multistore-panel-toggle-s1');

    // T9: Efectivo (s1) y Transferencia (CUP) (s2, Zelle normalizado) están presentes.
    expect(screen.getByText('Efectivo')).toBeInTheDocument();
    expect(screen.getByText('Transferencia (CUP)')).toBeInTheDocument();
    expect(screen.queryByText('Zelle')).not.toBeInTheDocument();

    // Filtrar s2 (solo Transferencia (CUP)): Efectivo desaparece de las opciones.
    fireEvent.change(screen.getByTestId('multistore-select'), { target: { value: 's2' } });
    expect(screen.getByText('Transferencia (CUP)')).toBeInTheDocument();
    expect(screen.queryByText('Efectivo')).not.toBeInTheDocument();
  });

  it('OS-6: CON MultiStores — tres filas de filtros: tienda + rango (derecha), métodos de pago, y pagadas/créditos', async () => {
    enableMultiStores();
    storeOrdersFixture.s1 = [makeOrder({ id: 'o1' })];

    render(
      <Wrapper>
        <OrdersPage />
      </Wrapper>,
    );
    await screen.findByTestId('multistore-panel-toggle-s1');

    // Fila 1: el rango de fechas comparte la fila con el select de tiendas
    // (ambos son hijos directos del mismo contenedor flex-wrap) y el
    // contenedor del rango queda empujado a la derecha (justify-end).
    const rangeInput = screen.getByTestId('date-range-filter-input');
    const rangeRow = rangeInput.closest('.justify-end');
    expect(rangeRow).not.toBeNull();
    const select = screen.getByTestId('multistore-select');
    expect(select.parentElement).not.toBeNull();
    // El select NO está dentro de la fila del rango: fila aparte del layout.
    expect(rangeRow!.contains(select)).toBe(false);

    // Las filas 2 (métodos de pago) y 3 (pagadas/créditos) son de ancho
    // completo (w-full), cada una con sus radios.
    const paymentRadio = screen.getByRole('radio', { name: 'Efectivo' });
    const paymentRow = paymentRadio.closest('.w-full');
    expect(paymentRow).not.toBeNull();
    const creditRadio = screen.getByRole('radio', { name: 'Créditos' });
    const creditRow = creditRadio.closest('.w-full');
    expect(creditRow).not.toBeNull();
    // Pagadas y Créditos comparten fila entre sí.
    expect(creditRow!.contains(screen.getByRole('radio', { name: 'Pagadas' }))).toBe(true);
    // Las tres filas son hermanas distintas (no una columna anidada en otra).
    expect(paymentRow).not.toBe(creditRow);
    expect(paymentRow!.contains(rangeInput)).toBe(false);
  });
});
