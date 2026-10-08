import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import type { UserModel } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import {
  OnlineOrderDeliveryType,
  OnlineOrderPaymentStatus,
  OnlineOrderStatus,
  type OnlineOrderListItem,
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
  updateStatus: vi.fn(),
  updatePayment: vi.fn(),
  assignDriver: vi.fn(),
  listActiveDrivers: vi.fn(),
}));

// `importOriginal` conserva `ORDER_STATUS_TRANSITIONS`: la tabla de transiciones es parte del
// CONTRATO y la prueba quiere que la vista use la real, no una copia suya.
vi.mock('~/sales/lib/services/ordering-http-service', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('~/sales/lib/services/ordering-http-service')
  >()),
  orderingHttpService: orderingMock,
}));

const showBlockingErrorMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: (...args: unknown[]) => showBlockingErrorMock(...args),
  confirmDialog: vi.fn(async () => true),
}));

const showToastSuccessMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/toast', () => ({
  showToastSuccess: (...args: unknown[]) => showToastSuccessMock(...args),
}));

import { OrderingOrdersPage, clientLoader } from '../ordering-orders';

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
    currency: 1,
    status: OnlineOrderStatus.New,
    paymentStatus: OnlineOrderPaymentStatus.Pending,
    driverId: null,
    driverName: null,
    date: '2026-10-07T10:00:00Z',
    ...overrides,
  };
}

const NEW_ORDER = makeOrder();
const PREPARING_ORDER = makeOrder({
  id: 'o2',
  code: 'PED-002',
  status: OnlineOrderStatus.Preparing,
  paymentStatus: OnlineOrderPaymentStatus.Paid,
  driverId: 'd1',
  driverName: 'Juan',
});
const DELIVERED_ORDER = makeOrder({
  id: 'o3',
  code: 'PED-003',
  status: OnlineOrderStatus.Delivered,
});

const DRIVERS = [
  { id: 'd1', name: 'Juan', phone: '5351111111', isActive: true },
  { id: 'd2', name: 'Ana', phone: '5352222222', isActive: true },
];

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
 * Usuario de TIENDA. Sus features NO salen de `user.featureIds` (eso es del owner/reseller): salen
 * de la fila de `roles` cuya tienda es la seleccionada (`isUserAuthorized`, authorization-service.ts:36).
 * Es justo lo que distingue esta vista de la de configuración (F1, solo OwnerAdmin).
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
      <OrderingOrdersPage />
    </IntlProvider>,
  );
}

/** La primera llamada al listado: los filtros de la prueba se comparan contra ella. */
function lastListCall() {
  return orderingMock.listOrders.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

async function waitForList() {
  return screen.findByTestId('order-row-o1');
}

/**
 * Opciones REALES del selector de estado: descarta la de invite ("Cambiar estado", valor vacío) y
 * devuelve valor + etiqueta de cada transición. Comparar por valor y por texto a la vez es lo que
 * demuestra que la vista ofrece el estado correcto y lo escribe en el idioma del usuario.
 */
function transitionValues(selector: HTMLElement): { value: string; label: string }[] {
  return within(selector)
    .getAllByRole('option')
    .filter((option) => option.getAttribute('value') !== '')
    .map((option) => ({
      value: option.getAttribute('value') as string,
      label: option.textContent as string,
    }));
}

describe('OrderingOrdersPage (Pedidos)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.user = makeUser();
    orderingMock.listOrders.mockResolvedValue(page([NEW_ORDER, PREPARING_ORDER, DELIVERED_ORDER]));
    orderingMock.updateStatus.mockResolvedValue(envelope(true));
    orderingMock.updatePayment.mockResolvedValue(envelope(true));
    orderingMock.assignDriver.mockResolvedValue(envelope(true));
    orderingMock.listActiveDrivers.mockResolvedValue(DRIVERS);
  });

  it('lista los pedidos leídos del servidor con sus columnas', async () => {
    renderPage();

    expect(await waitForList()).toBeInTheDocument();
    const row = screen.getByTestId('order-row-o1');
    expect(within(row).getByText('PED-001')).toBeInTheDocument();
    expect(within(row).getByText('Marta')).toBeInTheDocument();
    expect(within(row).getByText('5351234567')).toBeInTheDocument();
    expect(within(row).getByText('Envío a domicilio')).toBeInTheDocument();
    expect(within(row).getByText('1500')).toBeInTheDocument();
    expect(within(row).getByText('Nuevo')).toBeInTheDocument();
    expect(within(row).getByText('Pendiente')).toBeInTheDocument();
    // Sin repartidor asignado se dice explícitamente, no se deja en blanco.
    expect(screen.getByTestId('order-driver-name-o1')).toHaveTextContent('Sin asignar');
    // El repartidor YA resuelto por el servidor se pinta sin pedir los repartidores otra vez.
    expect(screen.getByTestId('order-driver-name-o2')).toHaveTextContent('Juan');
  });

  it('no manda ningún filtro sin usar y la lectura es siempre contra el servidor', async () => {
    renderPage();
    await waitForList();

    expect(orderingMock.listOrders).toHaveBeenCalledTimes(1);
    expect(lastListCall()).toEqual({ page: 1, pageSize: 20 });
  });

  it('filtrar por estado vuelve a leer del servidor con ese filtro', async () => {
    renderPage();
    await waitForList();

    fireEvent.change(screen.getByTestId('order-filter-status'), {
      target: { value: String(OnlineOrderStatus.Preparing) },
    });

    await waitFor(() =>
      expect(lastListCall()).toEqual({ status: OnlineOrderStatus.Preparing, page: 1, pageSize: 20 }),
    );
    // Filtrar vuelve a la primera página: la 3 con filtro no es la 3 sin filtro.
    expect(orderingMock.listOrders.mock.calls.at(-1)?.[0]).not.toHaveProperty('page', 3);
  });

  it('los filtros de pago, modalidad, repartidor y fechas viajan con el estado', async () => {
    renderPage();
    await waitForList();

    fireEvent.change(screen.getByTestId('order-filter-payment'), {
      target: { value: String(OnlineOrderPaymentStatus.Paid) },
    });
    fireEvent.change(screen.getByTestId('order-filter-delivery'), {
      target: { value: String(OnlineOrderDeliveryType.Pickup) },
    });
    fireEvent.change(screen.getByTestId('order-filter-driver'), { target: { value: 'd2' } });
    fireEvent.change(screen.getByTestId('order-filter-from'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByTestId('order-filter-to'), { target: { value: '2026-10-07' } });

    await waitFor(() =>
      expect(lastListCall()).toEqual({
        paymentStatus: OnlineOrderPaymentStatus.Paid,
        deliveryType: OnlineOrderDeliveryType.Pickup,
        driverId: 'd2',
        from: '2026-10-01',
        to: '2026-10-07',
        page: 1,
        pageSize: 20,
      }),
    );
  });

  it('la búsqueda por código o teléfono se aplica al pulsar Buscar', async () => {
    renderPage();
    await waitForList();

    fireEvent.change(screen.getByTestId('order-search'), { target: { value: 'PED-002' } });
    // Escribir NO dispara peticiones: se busca al pulsar.
    expect(lastListCall()).not.toHaveProperty('search');

    fireEvent.click(screen.getByTestId('order-search-submit'));

    await waitFor(() =>
      expect(lastListCall()).toEqual({ search: 'PED-002', page: 1, pageSize: 20 }),
    );
  });

  it('cambiar el estado ofrece SOLO las transiciones válidas', async () => {
    renderPage();
    await waitForList();

    const selector = within(screen.getByTestId('order-row-o1')).getByTestId('order-status-o1');
    const options = transitionValues(selector);

    // New → Accepted / Cancelled. Nada de Preparing (inválida) ni de "En camino" (no existe).
    expect(options).toEqual([
      { value: String(OnlineOrderStatus.Accepted), label: 'Aceptado' },
      { value: String(OnlineOrderStatus.Cancelled), label: 'Cancelado' },
    ]);
    expect(within(selector).queryByText('En camino')).not.toBeInTheDocument();

    const ready = within(screen.getByTestId('order-row-o2')).getByTestId('order-status-o2');
    expect(transitionValues(ready)).toEqual([
      { value: String(OnlineOrderStatus.Ready), label: 'Listo' },
      { value: String(OnlineOrderStatus.Cancelled), label: 'Cancelado' },
    ]);

    // Un estado terminal no ofrece ninguna transición: no hay selector que abrir.
    expect(
      within(screen.getByTestId('order-row-o3')).queryByTestId('order-status-o3'),
    ).not.toBeInTheDocument();
  });

  it('cambiar el estado lo manda al servidor y recarga la lista', async () => {
    renderPage();
    await waitForList();

    fireEvent.change(within(screen.getByTestId('order-row-o1')).getByTestId('order-status-o1'), {
      target: { value: String(OnlineOrderStatus.Accepted) },
    });

    await waitFor(() => expect(orderingMock.updateStatus).toHaveBeenCalledTimes(1));
    expect(orderingMock.updateStatus).toHaveBeenCalledWith('o1', OnlineOrderStatus.Accepted);
    // El servidor manda: tras mover el pedido se vuelve a leer para que la pantalla diga la verdad.
    await waitFor(() => expect(orderingMock.listOrders.mock.calls.length).toBeGreaterThan(1));
  });

  it('marcar el pago alterna Paid/Pending y es independiente del estado', async () => {
    renderPage();
    await waitForList();

    fireEvent.click(screen.getByTestId('order-payment-o1'));

    await waitFor(() => expect(orderingMock.updatePayment).toHaveBeenCalledTimes(1));
    expect(orderingMock.updatePayment).toHaveBeenCalledWith('o1', OnlineOrderPaymentStatus.Paid);
    // Marcar el pago NO toca el estado.
    expect(orderingMock.updateStatus).not.toHaveBeenCalled();

    // El que ya está pagado vuelve a Pendiente: el botón es un interruptor, no una ida sin vuelta.
    fireEvent.click(screen.getByTestId('order-payment-o2'));

    await waitFor(() => expect(orderingMock.updatePayment).toHaveBeenCalledTimes(2));
    expect(orderingMock.updatePayment).toHaveBeenLastCalledWith(
      'o2',
      OnlineOrderPaymentStatus.Pending,
    );
  });

  it('asignar un repartidor lo manda al servidor y ofrece el catálogo de repartidores', async () => {
    renderPage();
    await waitForList();
    await waitFor(() => expect(orderingMock.listActiveDrivers).toHaveBeenCalled());

    const selector = within(screen.getByTestId('order-row-o1')).getByTestId('order-driver-o1');
    expect(within(selector).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Sin asignar',
      'Juan',
      'Ana',
    ]);

    fireEvent.change(selector, { target: { value: 'd2' } });

    await waitFor(() => expect(orderingMock.assignDriver).toHaveBeenCalledTimes(1));
    expect(orderingMock.assignDriver).toHaveBeenCalledWith('o1', 'd2');
  });

  it('desasignar un repartidor manda null, no una cadena vacía', async () => {
    renderPage();
    await waitForList();

    fireEvent.change(
      within(screen.getByTestId('order-row-o2')).getByTestId('order-driver-o2'),
      { target: { value: '' } },
    );

    await waitFor(() => expect(orderingMock.assignDriver).toHaveBeenCalledTimes(1));
    expect(orderingMock.assignDriver).toHaveBeenCalledWith('o2', null);
  });

  it('si el endpoint de repartidores falla la página sigue funcionando', async () => {
    // F7 puede no estar desplegado: el selector degrada a "solo Sin asignar", la tabla NO se cae.
    orderingMock.listActiveDrivers.mockRejectedValue(
      Object.assign(new Error('not found'), { response: { status: 404 } }),
    );
    renderPage();

    expect(await waitForList()).toBeInTheDocument();
    const selector = await screen.findByTestId('order-driver-o1');
    await waitFor(() =>
      expect(within(selector).getAllByRole('option').map((o) => o.textContent)).toEqual([
        'Sin asignar',
      ]),
    );
    expect(screen.getByTestId('order-drivers-unavailable')).toBeInTheDocument();
    // Y la lista se puede seguir filtrando por estado sin el catálogo de repartidores.
    fireEvent.change(screen.getByTestId('order-filter-status'), {
      target: { value: String(OnlineOrderStatus.New) },
    });
    await waitFor(() => expect(lastListCall()).toHaveProperty('status', OnlineOrderStatus.New));
  });

  it('un rechazo del servidor al cambiar el estado se muestra con SU mensaje', async () => {
    orderingMock.updateStatus.mockResolvedValue(failure('Transición no permitida.'));
    renderPage();
    await waitForList();

    fireEvent.change(within(screen.getByTestId('order-row-o1')).getByTestId('order-status-o1'), {
      target: { value: String(OnlineOrderStatus.Accepted) },
    });

    await waitFor(() => expect(showBlockingErrorMock).toHaveBeenCalled());
    expect(showBlockingErrorMock).toHaveBeenCalledWith('Error', 'Transición no permitida.');
    expect(showToastSuccessMock).not.toHaveBeenCalled();
  });

  it('un fallo de red al listar avisa en pantalla y no pinta la tabla', async () => {
    orderingMock.listOrders.mockResolvedValue(failure('Tienda no seleccionada.'));
    renderPage();

    expect(await screen.findByTestId('order-error')).toHaveTextContent('No se pudieron cargar');
    expect(screen.queryByTestId('order-row-o1')).not.toBeInTheDocument();
  });

  it('sin pedidos muestra el estado vacío en vez de una tabla vacía', async () => {
    orderingMock.listOrders.mockResolvedValue(page([]));
    renderPage();

    expect(await screen.findByTestId('order-empty')).toHaveTextContent('No hay pedidos');
    expect(screen.queryByTestId('order-row-o1')).not.toBeInTheDocument();
  });

  it('el refresco manual vuelve a leer del servidor', async () => {
    renderPage();
    await waitForList();
    expect(orderingMock.listOrders).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('order-refresh'));

    await waitFor(() => expect(orderingMock.listOrders).toHaveBeenCalledTimes(2));
  });

  it('la paginación avanza y retrocede sobre el listado del servidor', async () => {
    orderingMock.listOrders.mockResolvedValue(page([NEW_ORDER], 45));
    renderPage();
    await waitForList();

    fireEvent.click(screen.getByTestId('order-next-page'));
    await waitFor(() => expect(lastListCall()).toHaveProperty('page', 2));

    fireEvent.click(screen.getByTestId('order-prev-page'));
    await waitFor(() => expect(lastListCall()).toHaveProperty('page', 1));
  });
});

describe('clientLoader de Pedidos (feature 123)', () => {
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
    // La feature 122 es la de CONFIGURAR la tienda (solo dueño); no da acceso a gestionar pedidos.
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