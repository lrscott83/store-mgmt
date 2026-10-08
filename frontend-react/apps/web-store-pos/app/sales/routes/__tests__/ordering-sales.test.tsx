import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { Currency, EFeatures } from '@store-mgmt/domain';
import type { UserModel } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import {
  OnlineOrderDeliveryType,
  OnlineOrderPaymentStatus,
  OnlineOrderStatus,
  type OnlineOrderListItem,
  type OnlineOrderStats,
} from '~/sales/lib/services/ordering-http-service';

/** Sesión mutable: el loader y los tests de gate la reescriben por prueba. */
const session = vi.hoisted(() => ({
  user: null as UserModel | null,
  logout: vi.fn(),
}));

vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: Object.assign(
    vi.fn((selector?: (state: { user: UserModel | null }) => unknown) =>
      selector ? selector({ user: session.user }) : session.user,
    ),
    {
      getState: () => ({
        user: session.user,
        isAuthenticated: session.user !== null,
        logout: session.logout,
      }),
    },
  ),
}));

const orderingMock = vi.hoisted(() => ({
  listOrders: vi.fn(),
  getSalesStats: vi.fn(),
}));

vi.mock('~/sales/lib/services/ordering-http-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/sales/lib/services/ordering-http-service')>()),
  orderingHttpService: orderingMock,
}));

import { OrderingSalesPage, clientLoader } from '../ordering-sales';

const envelope = <T,>(data: T) => ({
  data,
  succeeded: true as const,
  message: '',
  actionCode: 200,
  errors: [],
});

const page = (items: OnlineOrderListItem[], total = items.length) =>
  envelope({ items, total, page: 1, pageSize: 20 });

const failure = (description: string) => ({
  data: null,
  succeeded: false as const,
  message: '',
  actionCode: 400,
  errors: [{ code: 'Orders.Failed', description }],
});

function makeOrder(overrides: Partial<OnlineOrderListItem> = {}): OnlineOrderListItem {
  return {
    id: 'o1',
    code: 'PED-001',
    customerName: 'Marta',
    customerPhone: '5351234567',
    deliveryType: OnlineOrderDeliveryType.Delivery,
    total: 1500,
    currency: Currency.USD,
    status: OnlineOrderStatus.Delivered,
    paymentStatus: OnlineOrderPaymentStatus.Paid,
    driverId: 'd1',
    driverName: 'Juan',
    date: '2026-10-07T10:00:00Z',
    ...overrides,
  };
}

const FIRST_ORDER = makeOrder();
const SECOND_ORDER = makeOrder({
  id: 'o2',
  code: 'PED-002',
  customerName: 'Luis',
  customerPhone: '5357654321',
  deliveryType: OnlineOrderDeliveryType.Pickup,
  total: 800,
  status: OnlineOrderStatus.Cancelled,
  paymentStatus: OnlineOrderPaymentStatus.Pending,
  driverId: null,
  driverName: null,
});

/**
 * Métricas de un rango sembrado. `currency` es USD a propósito: como el enum viaja por VALOR, el
 * 1 es `Currency.USD` y la tarjeta tiene que pintar ESA moneda, no la de por defecto (CUP).
 */
const STATS: OnlineOrderStats = {
  ordersCount: 12,
  nonCancelledCount: 10,
  totalSales: 4200,
  averageTicket: 420,
  paidCount: 7,
  paidAmount: 2900,
  pendingCount: 3,
  pendingAmount: 1300,
  // Los seis estados en el orden del enum, con ceros incluidos (eje FIJO de la tarjeta).
  byStatus: [
    { status: OnlineOrderStatus.New, count: 1 },
    { status: OnlineOrderStatus.Accepted, count: 2 },
    { status: OnlineOrderStatus.Preparing, count: 3 },
    { status: OnlineOrderStatus.Ready, count: 4 },
    { status: OnlineOrderStatus.Delivered, count: 1 },
    { status: OnlineOrderStatus.Cancelled, count: 1 },
  ],
  byDeliveryType: [
    { deliveryType: OnlineOrderDeliveryType.Pickup, count: 5 },
    { deliveryType: OnlineOrderDeliveryType.Delivery, count: 7 },
  ],
  currency: Currency.USD,
};

function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    id: 'u1',
    login: 'owner@test.com',
    fullName: 'Owner',
    cellPhone: '+1234567890',
    email: 'owner@test.com',
    isActive: true,
    password: '',
    authToken: 'tok',
    refreshToken: 'ref',
    expiresIn: Date.now() + 1000000,
    roles: [],
    featureIds: [EFeatures.OnlineOrders],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: true,
    isReSeller: false,
    selectedStoreId: 's1',
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
    ...overrides,
  };
}

/**
 * Usuario de TIENDA. Sus features salen de la fila de `roles` de la tienda seleccionada
 * (`isUserAuthorized`), no de `user.featureIds`: es lo que hace que el StoreUser entre.
 */
function makeStoreUser(featureIds: number[]): UserModel {
  return makeUser({
    login: 'storeuser@test.com',
    email: 'storeuser@test.com',
    isOwnerAdmin: false,
    roles: [{ storeId: 's1', storeName: 'Tienda 1', moduleId: 18, featureIds }],
  });
}

function renderPage() {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <OrderingSalesPage />
    </IntlProvider>,
  );
}

/** Los importes se agrupan con NBSP; jest-dom normaliza los espacios al comparar texto. */
function lastStatsCall() {
  return orderingMock.getSalesStats.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

function lastListCall() {
  return orderingMock.listOrders.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

/** El historial es la parte que NO puede caerse: es la prueba de que la página vive. */
async function waitForList() {
  return screen.findByTestId('sales-row-o1');
}

describe('OrderingSalesPage (Ventas)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.user = makeUser();
    orderingMock.getSalesStats.mockResolvedValue(envelope(STATS));
    orderingMock.listOrders.mockResolvedValue(page([FIRST_ORDER, SECOND_ORDER]));
  });

  it('pinta las métricas del rango con la moneda que manda el servidor', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId('sales-metric-orders')).toHaveTextContent('12'));
    // El denominador del ticket medio viaja explícito: si no fuera el de los NO cancelados,
    // `averageTicket` no cuadraría con `totalSales / ordersCount` y nadie lo vería.
    expect(screen.getByTestId('sales-metric-non-cancelled')).toHaveTextContent('10');
    expect(screen.getByTestId('sales-metric-total')).toHaveTextContent('4 200 USD');
    expect(screen.getByTestId('sales-metric-average')).toHaveTextContent('420 USD');
    expect(screen.getByTestId('sales-metric-paid-count')).toHaveTextContent('7');
    expect(screen.getByTestId('sales-metric-paid-amount')).toHaveTextContent('2 900 USD');
    expect(screen.getByTestId('sales-metric-pending-count')).toHaveTextContent('3');
    expect(screen.getByTestId('sales-metric-pending-amount')).toHaveTextContent('1 300 USD');
  });

  it('el desglose pinta los seis estados y las dos modalidades, con los ceros', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('sales-metric-orders')).toHaveTextContent('12'));

    // Cada fila del desglose son DOS elementos —el rótulo del enum y su conteo— porque la tarjeta
    // los separa con `justify-between`. Se comparan por separado y no como un texto pegado.
    const byStatus = screen.getByTestId('sales-breakdown-status');
    const statusRow = (value: number) => within(byStatus).getByTestId(`sales-status-${value}`);
    expect(within(statusRow(0)).getByText('Nuevo')).toBeInTheDocument();
    expect(within(statusRow(0)).getByText('1')).toBeInTheDocument();
    expect(within(statusRow(3)).getByText('Listo')).toBeInTheDocument();
    expect(within(statusRow(3)).getByText('4')).toBeInTheDocument();
    // El cancelado SÍ se cuenta en el desglose: es el único sitio donde se ve.
    expect(within(statusRow(5)).getByText('Cancelado')).toBeInTheDocument();
    expect(within(statusRow(5)).getByText('1')).toBeInTheDocument();

    const byDelivery = screen.getByTestId('sales-breakdown-delivery');
    const deliveryRow = (value: number) => within(byDelivery).getByTestId(`sales-delivery-${value}`);
    expect(within(deliveryRow(0)).getByText('Recogida en la tienda')).toBeInTheDocument();
    expect(within(deliveryRow(0)).getByText('5')).toBeInTheDocument();
    expect(within(deliveryRow(1)).getByText('Envío a domicilio')).toBeInTheDocument();
    expect(within(deliveryRow(1)).getByText('7')).toBeInTheDocument();
  });

  it('no manda al servidor ningún filtro sin usar y no pagina las métricas', async () => {
    renderPage();
    await waitForList();

    // Las métricas NO aceptan `page`: `GET /stats` pagina el agregado entero, no una página.
    expect(lastStatsCall()).toEqual({});
    expect(lastListCall()).toEqual({ page: 1, pageSize: 20 });
  });

  it('filtrar vuelve a leer métricas e historial contra el servidor con ese filtro', async () => {
    renderPage();
    await waitForList();
    expect(orderingMock.getSalesStats).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByTestId('sales-filter-status'), {
      target: { value: String(OnlineOrderStatus.Preparing) },
    });

    await waitFor(() =>
      expect(lastStatsCall()).toEqual({ status: OnlineOrderStatus.Preparing }),
    );
    await waitFor(() =>
      expect(lastListCall()).toEqual({
        status: OnlineOrderStatus.Preparing,
        page: 1,
        pageSize: 20,
      }),
    );
    // El agregado no se pagina: el filtro no puede colarse como `page`.
    expect(lastStatsCall()).not.toHaveProperty('page');
  });

  it('los filtros de pago, entrega y fechas viajan con el estado', async () => {
    renderPage();
    await waitForList();

    fireEvent.change(screen.getByTestId('sales-filter-payment'), {
      target: { value: String(OnlineOrderPaymentStatus.Paid) },
    });
    fireEvent.change(screen.getByTestId('sales-filter-delivery'), {
      target: { value: String(OnlineOrderDeliveryType.Delivery) },
    });
    fireEvent.change(screen.getByTestId('sales-filter-from'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByTestId('sales-filter-to'), { target: { value: '2026-10-07' } });

    const expected = {
      paymentStatus: OnlineOrderPaymentStatus.Paid,
      deliveryType: OnlineOrderDeliveryType.Delivery,
      from: '2026-10-01',
      to: '2026-10-07',
    };
    await waitFor(() => expect(lastStatsCall()).toEqual(expected));
    await waitFor(() => expect(lastListCall()).toEqual({ ...expected, page: 1, pageSize: 20 }));
  });

  it('el historial se pinta con las columnas del pedido leídas del servidor', async () => {
    renderPage();

    expect(await waitForList()).toBeInTheDocument();
    const row = screen.getByTestId('sales-row-o1');
    expect(within(row).getByText('PED-001')).toBeInTheDocument();
    expect(within(row).getByText('Marta')).toBeInTheDocument();
    expect(within(row).getByText('5351234567')).toBeInTheDocument();
    expect(within(row).getByText('Envío a domicilio')).toBeInTheDocument();
    expect(within(row).getByText('Entregado')).toBeInTheDocument();
    expect(within(row).getByText('Pagado')).toBeInTheDocument();
    expect(within(row).getByTestId('sales-row-driver-o1')).toHaveTextContent('Juan');
    // El repartidor sin asignar se dice explícitamente, no se deja en blanco.
    expect(screen.getByTestId('sales-row-driver-o2')).toHaveTextContent('Sin asignar');
    // Cancelado entra en el histórico: la tabla es el histórico, no la cola de trabajo.
    expect(within(screen.getByTestId('sales-row-o2')).getByText('Cancelado')).toBeInTheDocument();
  });

  it('la paginación avanza y retrocede sobre el historial del servidor', async () => {
    orderingMock.listOrders.mockResolvedValue(page([FIRST_ORDER], 45));
    renderPage();
    await waitForList();
    expect(screen.getByTestId('sales-page')).toHaveTextContent('Página 1 de 3');

    fireEvent.click(screen.getByTestId('sales-next-page'));
    await waitFor(() => expect(lastListCall()).toHaveProperty('page', 2));
    // Paginar el historial NO vuelve a pedir el agregado: el rango no ha cambiado.
    expect(orderingMock.getSalesStats).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('sales-prev-page'));
    await waitFor(() => expect(lastListCall()).toHaveProperty('page', 1));
  });

  it('el refresco vuelve a leer métricas e historial', async () => {
    renderPage();
    await waitForList();
    expect(orderingMock.getSalesStats).toHaveBeenCalledTimes(1);
    expect(orderingMock.listOrders).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('sales-refresh'));

    await waitFor(() => expect(orderingMock.getSalesStats).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(orderingMock.listOrders).toHaveBeenCalledTimes(2));
  });

  it('si el endpoint de métricas falla avisa pero el historial sigue vivo', async () => {
    // Las métricas son un RESUMEN: perderlo degrada la cabecera, nunca la página entera.
    orderingMock.getSalesStats.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500 } }),
    );
    renderPage();

    expect(await waitForList()).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('sales-stats-error')).toBeInTheDocument());
    expect(screen.queryByTestId('sales-metric-orders')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sales-breakdown-status')).not.toBeInTheDocument();
    // Y se puede seguir filtrando el histórico sin las métricas.
    fireEvent.change(screen.getByTestId('sales-filter-status'), {
      target: { value: String(OnlineOrderStatus.Cancelled) },
    });
    await waitFor(() => expect(lastListCall()).toHaveProperty('status', OnlineOrderStatus.Cancelled));
  });

  it('un rechazo del servidor en las métricas también degrada solo la cabecera', async () => {
    orderingMock.getSalesStats.mockResolvedValue(failure('Tienda no seleccionada.'));
    renderPage();

    expect(await waitForList()).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('sales-stats-error')).toHaveTextContent('No se pudieron cargar'),
    );
  });

  it('un fallo del historial avisa en pantalla y no pinta la tabla', async () => {
    orderingMock.listOrders.mockResolvedValue(failure('Tienda no seleccionada.'));
    renderPage();

    expect(await screen.findByTestId('sales-error')).toHaveTextContent('No se pudo cargar');
    expect(screen.queryByTestId('sales-row-o1')).not.toBeInTheDocument();
  });

  it('sin pedidos en el rango muestra el estado vacío en vez de una tabla vacía', async () => {
    orderingMock.listOrders.mockResolvedValue(page([]));
    renderPage();

    expect(await screen.findByTestId('sales-empty')).toHaveTextContent('No hay pedidos');
    expect(screen.queryByTestId('sales-row-o1')).not.toBeInTheDocument();
  });

  it('un rango sin métricas los muestra a cero en vez de esconder las tarjetas', async () => {
    orderingMock.getSalesStats.mockResolvedValue(
      envelope({
        ...STATS,
        ordersCount: 0,
        nonCancelledCount: 0,
        totalSales: 0,
        averageTicket: 0,
        paidCount: 0,
        paidAmount: 0,
        pendingCount: 0,
        pendingAmount: 0,
        byStatus: [],
        byDeliveryType: [],
      }),
    );
    renderPage();

    await waitFor(() => expect(screen.getByTestId('sales-metric-orders')).toHaveTextContent('0'));
    expect(screen.getByTestId('sales-metric-total')).toHaveTextContent('0 USD');
    expect(screen.queryByTestId('sales-stats-error')).not.toBeInTheDocument();
  });
});

describe('clientLoader de Ventas (feature 123)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deja pasar a un OwnerAdmin aunque no lleve la feature (bypass de los owners)', async () => {
    session.user = makeUser({ featureIds: [] });
    await expect(clientLoader({ params: {} } as never)).resolves.toBeNull();
  });

  it('deja pasar a un StoreUser con la feature de pedidos', async () => {
    session.user = makeStoreUser([EFeatures.OnlineOrders]);
    await expect(clientLoader({ params: {} } as never)).resolves.toBeNull();
  });

  it('desloguea a un StoreUser que solo tiene la feature de catálogo', async () => {
    session.user = makeStoreUser([EFeatures.WebCatalog]);

    const result = await clientLoader({ params: {} } as never);

    expect(session.logout).toHaveBeenCalled();
    expect(result).toBeInstanceOf(Response);
  });

  it('desloguea a una sesión sin autenticar', async () => {
    session.user = null;

    const result = await clientLoader({ params: {} } as never);

    expect(session.logout).toHaveBeenCalled();
    expect(result).toBeInstanceOf(Response);
  });
});
