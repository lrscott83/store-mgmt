import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router';
import { EFeatures } from '@store-mgmt/domain';
import type { UserModel } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import {
  OnlineOrderDeliveryType,
  OnlineOrderPaymentStatus,
  OnlineOrderStatus,
  type OnlineOrderDetail,
  type OnlineOrderListItem,
} from '~/sales/lib/services/ordering-http-service';

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
  getOrder: vi.fn(),
  updateStatus: vi.fn(),
  listActiveDrivers: vi.fn(),
}));

vi.mock('~/sales/lib/services/ordering-http-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/sales/lib/services/ordering-http-service')>()),
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

const pageOf = (items: OnlineOrderListItem[], total = items.length, page = 1) =>
  envelope({ items, total, page, pageSize: 20 });

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
    status: OnlineOrderStatus.Creado,
    paymentStatus: OnlineOrderPaymentStatus.Pending,
    driverId: null,
    driverName: null,
    date: '2026-10-07T10:00:00Z',
    ...overrides,
  };
}

const CREATED_ORDER = makeOrder();
const PREPARED_DELIVERY_ORDER = makeOrder({
  id: 'o2',
  code: 'PED-002',
  status: OnlineOrderStatus.Preparado,
});
const DELIVERED_ORDER = makeOrder({ id: 'o3', code: 'PED-003', status: OnlineOrderStatus.Entregado });

const DRIVERS = [
  { id: 'd1', name: 'Juan', phone: '5351111111', isActive: true },
  { id: 'd2', name: 'Ana', phone: '5352222222', isActive: true },
];

const DETAIL: OnlineOrderDetail = {
  ...DELIVERED_ORDER,
  deliveryAddress: 'Calle 1',
  notes: 'Tocar el timbre',
  lines: [
    { productId: 'p1', name: 'Cafetera', quantity: 1, price: 1500, currency: 1, lineTotal: 1500 },
  ],
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
      <MemoryRouter>
        <OrderingOrdersPage />
      </MemoryRouter>
    </IntlProvider>,
  );
}

interface CapturedFilters {
  status?: OnlineOrderStatus;
  exactRange?: boolean;
  from?: string;
  to?: string;
  page?: number;
}

function callForStatus(status: OnlineOrderStatus): CapturedFilters {
  const calls = orderingMock.listOrders.mock.calls.filter(
    ([filters]) => (filters as CapturedFilters).status === status,
  );
  return (calls.at(-1)?.[0] ?? {}) as CapturedFilters;
}

beforeEach(() => {
  vi.clearAllMocks();

  orderingMock.listActiveDrivers.mockResolvedValue(DRIVERS);
  orderingMock.listOrders.mockImplementation(async (filters: CapturedFilters) => {
    switch (filters.status) {
      case OnlineOrderStatus.Creado:
        return pageOf([CREATED_ORDER]);
      case OnlineOrderStatus.Preparado:
        return pageOf([PREPARED_DELIVERY_ORDER]);
      case OnlineOrderStatus.Entregado:
        return pageOf([DELIVERED_ORDER]);
      default:
        return pageOf([]);
    }
  });
  orderingMock.getOrder.mockResolvedValue(envelope(DETAIL));
  orderingMock.updateStatus.mockResolvedValue(envelope(true));
});

describe('OrderingOrdersPage (gestión de pedidos)', () => {
  it('pinta un panel por estado con su cantidad', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId('order-panel-count-Creado')).toHaveTextContent('1'));

    for (const status of ['Creado', 'Preparado', 'Transportando', 'Entregado', 'Cancelado']) {
      expect(screen.getByTestId(`order-panel-${status}`)).toBeInTheDocument();
    }

    expect(screen.getByTestId('order-panel-count-Preparado')).toHaveTextContent('1');
    expect(screen.getByTestId('order-panel-count-Entregado')).toHaveTextContent('1');
    expect(screen.getByTestId('order-panel-count-Cancelado')).toHaveTextContent('0');
  });

  it('los paneles activos no filtran por fecha', async () => {
    renderPage();

    await waitFor(() => expect(orderingMock.listOrders).toHaveBeenCalledTimes(5));

    expect(callForStatus(OnlineOrderStatus.Creado).from).toBeUndefined();
    expect(callForStatus(OnlineOrderStatus.Creado).exactRange).toBeUndefined();
    expect(callForStatus(OnlineOrderStatus.Preparado).from).toBeUndefined();
    expect(callForStatus(OnlineOrderStatus.Transportando).from).toBeUndefined();
  });

  it('los paneles Entregado y Cancelado piden sólo el día del dispositivo como instantes exactos', async () => {
    renderPage();

    await waitFor(() => expect(orderingMock.listOrders).toHaveBeenCalledTimes(5));

    for (const status of [OnlineOrderStatus.Entregado, OnlineOrderStatus.Cancelado]) {
      const filters = callForStatus(status);
      expect(filters.exactRange).toBe(true);
      expect(typeof filters.from).toBe('string');
      expect(typeof filters.to).toBe('string');
      expect(new Date(filters.from as string).getTime()).toBeLessThan(
        new Date(filters.to as string).getTime(),
      );
    }
  });

  it('un panel se colapsa y se vuelve a abrir', async () => {
    renderPage();

    const panel = await screen.findByTestId('order-panel-Creado');
    const toggle = within(panel).getByRole('button', { expanded: true });

    fireEvent.click(toggle);
    expect(within(panel).getByRole('button', { expanded: false })).toBeInTheDocument();
    expect(screen.queryByTestId('order-card-o1')).not.toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('button', { expanded: false }));
    expect(await screen.findByTestId('order-card-o1')).toBeInTheDocument();
  });

  it('cada card ofrece ver los detalles y el modal los pide al servidor', async () => {
    renderPage();

    fireEvent.click(await screen.findByTestId('order-details-o1'));

    await waitFor(() => expect(orderingMock.getOrder).toHaveBeenCalledWith('o1'));
    expect(await screen.findByTestId('order-detail-modal')).toBeInTheDocument();
    expect(await screen.findByText(/Cafetera/)).toBeInTheDocument();
  });

  it('enviar a reparto exige repartidor y lo manda en la transición', async () => {
    renderPage();

    const send = await screen.findByTestId(`order-to-${OnlineOrderStatus.Transportando}-o2`);
    expect(send).toBeDisabled();

    fireEvent.change(screen.getByTestId('order-driver-o2'), { target: { value: 'd2' } });
    expect(send).not.toBeDisabled();

    fireEvent.click(send);

    await waitFor(() =>
      expect(orderingMock.updateStatus).toHaveBeenCalledWith('o2', OnlineOrderStatus.Transportando, {
        driverId: 'd2',
      }),
    );
  });

  it('cancelar exige razón y la manda al servidor', async () => {
    renderPage();

    const card = await screen.findByTestId('order-card-o1');
    fireEvent.click(within(card).getByRole('button', { name: 'Cancelar pedido' }));

    const confirm = screen.getByTestId('order-cancel-confirm');
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByTestId('order-cancel-reason'), {
      target: { value: '  El cliente desistió  ' },
    });
    expect(confirm).not.toBeDisabled();

    fireEvent.click(confirm);

    await waitFor(() =>
      expect(orderingMock.updateStatus).toHaveBeenCalledWith('o1', OnlineOrderStatus.Cancelado, {
        cancellationReason: 'El cliente desistió',
      }),
    );
  });

  it('un rechazo del servidor al cambiar el estado se muestra con SU mensaje', async () => {
    orderingMock.updateStatus.mockResolvedValue(failure('Transición no permitida'));

    renderPage();

    fireEvent.change(await screen.findByTestId('order-driver-o2'), { target: { value: 'd2' } });
    fireEvent.click(screen.getByTestId(`order-to-${OnlineOrderStatus.Transportando}-o2`));

    await waitFor(() =>
      expect(showBlockingErrorMock).toHaveBeenCalledWith('Error', 'Transición no permitida'),
    );
  });

  it('si el endpoint de repartidores falla la página sigue funcionando', async () => {
    orderingMock.listActiveDrivers.mockRejectedValue(new Error('404'));

    renderPage();

    expect(await screen.findByTestId('order-card-o1')).toBeInTheDocument();
    expect(screen.getByTestId(`order-to-${OnlineOrderStatus.Transportando}-o2`)).toBeDisabled();
  });

  it('sin pedidos muestra el estado vacío en cada panel', async () => {
    orderingMock.listOrders.mockResolvedValue(pageOf([]));

    renderPage();

    await waitFor(() => expect(screen.getAllByText(esMessages['ORDERING_ORDERS.EMPTY']).length).toBeGreaterThan(0));
  });

  it('la paginación del panel pide la página anterior y la siguiente', async () => {
    orderingMock.listOrders.mockResolvedValue(pageOf([CREATED_ORDER], 60, 1));

    renderPage();

    const panel = await screen.findByTestId('order-panel-Creado');
    await waitFor(() => expect(within(panel).getByText('Página 1 de 3')).toBeInTheDocument());

    fireEvent.click(within(panel).getByRole('button', { name: 'Siguiente' }));

    await waitFor(() =>
      expect(callForStatus(OnlineOrderStatus.Creado).page).toBe(2),
    );
  });
});

describe('clientLoader de Pedidos (feature 123)', () => {
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
