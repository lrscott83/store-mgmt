import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { EFeatures, EModules } from '@store-mgmt/domain';
import type { UserModel } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import type { DeliveryDriver } from '~/sales/lib/services/ordering-http-service';

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
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  getDeliveryDrivers: vi.fn(),
  createDeliveryDriver: vi.fn(),
  updateDeliveryDriver: vi.fn(),
}));

vi.mock('~/sales/lib/services/ordering-http-service', () => ({
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

import { OrderingDriversPage, clientLoader } from '../ordering-drivers';

const envelope = <T,>(data: T) => ({ data, succeeded: true, message: '', actionCode: 200, errors: [] });

const failure = (description: string) => ({
  data: null,
  succeeded: false,
  message: '',
  actionCode: 400,
  errors: [{ code: 'Delivery.Driver.NameRequired', description }],
});

const ACTIVE_DRIVER: DeliveryDriver = {
  id: 'd1',
  storeId: 's1',
  name: 'Ana',
  phone: '+5351111111',
  isActive: true,
};

const INACTIVE_DRIVER: DeliveryDriver = {
  id: 'd2',
  storeId: 's1',
  name: 'Beto',
  phone: '+5352222222',
  isActive: false,
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
    storeModuleIds: [EModules.WebCatalog],
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
 * Usuario de TIENDA (D15): el gate de esta vista NO es owner-only, y este es el caso que lo
 * demuestra — el `StoreUser` de la tienda tiene la feature 123 en su ROL, no en `featureIds`.
 */
function makeStoreUser(): UserModel {
  return makeUser({
    isOwnerAdmin: false,
    featureIds: [],
    roles: [
      {
        storeId: 's1',
        storeName: 'Tienda 1',
        moduleId: EModules.WebCatalog,
        featureIds: [EFeatures.OnlineOrders],
      },
    ],
  });
}

function renderPage() {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <OrderingDriversPage />
    </IntlProvider>,
  );
}

describe('OrderingDriversPage (vista Repartidores)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.user = makeUser();
    orderingMock.getDeliveryDrivers.mockResolvedValue(envelope([ACTIVE_DRIVER]));
    orderingMock.createDeliveryDriver.mockResolvedValue(envelope(ACTIVE_DRIVER));
    orderingMock.updateDeliveryDriver.mockResolvedValue(envelope(ACTIVE_DRIVER));
  });

  it('lista los repartidores con nombre, teléfono y estado', async () => {
    renderPage();

    const row = await screen.findByTestId('drivers-row');
    expect(within(row).getByTestId('drivers-row-name')).toHaveTextContent('Ana');
    expect(within(row).getByTestId('drivers-row-phone')).toHaveTextContent('+5351111111');
    expect(within(row).getByTestId('drivers-row-status')).toHaveTextContent('Activo');
  });

  it('una tienda sin repartidores lo dice, y no es un error', async () => {
    orderingMock.getDeliveryDrivers.mockResolvedValue(envelope([]));
    renderPage();

    expect(await screen.findByTestId('drivers-empty')).toHaveTextContent(
      'Esta tienda todavía no tiene repartidores dados de alta.',
    );
    expect(screen.queryByTestId('drivers-error')).not.toBeInTheDocument();
  });

  it('el formulario no se muestra hasta que se pide uno nuevo', async () => {
    renderPage();

    await screen.findByTestId('drivers-table');
    expect(screen.queryByTestId('drivers-form')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('drivers-new'));

    expect(await screen.findByTestId('drivers-form')).toBeInTheDocument();
    expect(screen.getByTestId('drivers-name')).toHaveValue('');
    expect(screen.getByTestId('drivers-phone')).toHaveValue('');
  });

  it('en el alta no hay interruptor de activo: un repartidor nuevo nace activo', async () => {
    renderPage();
    await screen.findByTestId('drivers-table');

    fireEvent.click(screen.getByTestId('drivers-new'));
    await screen.findByTestId('drivers-form');

    expect(screen.queryByTestId('drivers-active')).not.toBeInTheDocument();
  });

  it('crear manda solo nombre y teléfono, sin storeId ni isActive', async () => {
    renderPage();
    await screen.findByTestId('drivers-table');

    fireEvent.click(screen.getByTestId('drivers-new'));
    await screen.findByTestId('drivers-form');
    fireEvent.change(screen.getByTestId('drivers-name'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByTestId('drivers-phone'), { target: { value: '5351111111' } });

    fireEvent.click(screen.getByTestId('drivers-save'));

    await waitFor(() => expect(orderingMock.createDeliveryDriver).toHaveBeenCalledTimes(1));
    expect(orderingMock.createDeliveryDriver).toHaveBeenCalledWith({
      name: 'Ana',
      phone: '5351111111',
    });
    // La tienda es la del contexto: mandarla en el cuerpo abriría la puerta a crear repartidores
    // en la tienda de otro.
    expect(orderingMock.createDeliveryDriver.mock.calls[0]?.[0]).not.toHaveProperty('storeId');
    await waitFor(() =>
      expect(showToastSuccessMock).toHaveBeenCalledWith('Repartidor creado'),
    );
  });

  it('editar rellena el formulario con lo que ya estaba y ofrece el interruptor', async () => {
    renderPage();
    await screen.findByTestId('drivers-table');

    fireEvent.click(screen.getByTestId('drivers-edit'));

    await screen.findByTestId('drivers-form');
    expect(screen.getByTestId('drivers-name')).toHaveValue('Ana');
    expect(screen.getByTestId('drivers-phone')).toHaveValue('+5351111111');
    expect(screen.getByTestId('drivers-active')).toBeInTheDocument();
  });

  it('desactivar viaja como isActive=false en el PATCH de edición, con su id', async () => {
    renderPage();
    await screen.findByTestId('drivers-table');

    fireEvent.click(screen.getByTestId('drivers-edit'));
    await screen.findByTestId('drivers-form');
    fireEvent.click(within(screen.getByTestId('drivers-active')).getByRole('switch'));
    fireEvent.change(screen.getByTestId('drivers-name'), { target: { value: 'Ana María' } });

    fireEvent.click(screen.getByTestId('drivers-save'));

    await waitFor(() => expect(orderingMock.updateDeliveryDriver).toHaveBeenCalledTimes(1));
    expect(orderingMock.updateDeliveryDriver).toHaveBeenCalledWith('d1', {
      name: 'Ana María',
      phone: '+5351111111',
      isActive: false,
    });
    await waitFor(() =>
      expect(showToastSuccessMock).toHaveBeenCalledWith('Repartidor actualizado'),
    );
  });

  it('cancelar cierra el formulario sin tocar la red', async () => {
    renderPage();
    await screen.findByTestId('drivers-table');

    fireEvent.click(screen.getByTestId('drivers-new'));
    await screen.findByTestId('drivers-form');
    orderingMock.createDeliveryDriver.mockClear();

    fireEvent.click(screen.getByTestId('drivers-cancel'));

    expect(screen.queryByTestId('drivers-form')).not.toBeInTheDocument();
    expect(orderingMock.createDeliveryDriver).not.toHaveBeenCalled();
  });

  it('un repartidor inactivo sale en la lista marcado como tal, para poder reactivarlo', async () => {
    orderingMock.getDeliveryDrivers.mockResolvedValue(envelope([ACTIVE_DRIVER, INACTIVE_DRIVER]));
    renderPage();

    const rows = await screen.findAllByTestId('drivers-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]!).getByTestId('drivers-row-status')).toHaveTextContent('Inactivo');
  });

  it('un rechazo del servidor se muestra con SU mensaje de validación', async () => {
    orderingMock.createDeliveryDriver.mockResolvedValue(failure('El campo Name es requerido.'));
    renderPage();
    await screen.findByTestId('drivers-table');

    fireEvent.click(screen.getByTestId('drivers-new'));
    await screen.findByTestId('drivers-form');
    fireEvent.click(screen.getByTestId('drivers-save'));

    await waitFor(() => expect(showBlockingErrorMock).toHaveBeenCalled());
    expect(showBlockingErrorMock).toHaveBeenCalledWith('Error', 'El campo Name es requerido.');
    expect(showToastSuccessMock).not.toHaveBeenCalled();
  });

  it('un fallo de red al guardar avisa sin toast de éxito', async () => {
    orderingMock.createDeliveryDriver.mockRejectedValue(
      Object.assign(new Error('offline'), { isNetworkError: true }),
    );
    renderPage();
    await screen.findByTestId('drivers-table');

    fireEvent.click(screen.getByTestId('drivers-new'));
    await screen.findByTestId('drivers-form');
    fireEvent.click(screen.getByTestId('drivers-save'));

    await waitFor(() => expect(showBlockingErrorMock).toHaveBeenCalled());
    expect(showBlockingErrorMock).toHaveBeenCalledWith(
      'Error',
      'Sin conexión. Se requiere conexión a internet.',
    );
    expect(showToastSuccessMock).not.toHaveBeenCalled();
  });

  it('si la carga falla se avisa en pantalla y no se pinta la lista', async () => {
    orderingMock.getDeliveryDrivers.mockResolvedValue(failure('Tienda no seleccionada.'));
    renderPage();

    expect(await screen.findByTestId('drivers-error')).toHaveTextContent(
      'No se pudieron cargar los repartidores',
    );
    expect(screen.queryByTestId('drivers-table')).not.toBeInTheDocument();
  });

  /**
   * Esta vista NO asigna repartidores a pedidos ni cuenta pedidos: son actos sobre el PEDIDO, y
   * pertenecen a F5 (D8). Lo observable es que la lista no lleva contador de pedidos y que no
   * hay ninguna acción de asignación — el texto que explica el alcance sí menciona "pedido", que
   * es justo lo que aclara que de eso NO se ocupa aquí.
   */
  it('no ofrece nada que toque pedidos: ni contador ni asignación', async () => {
    renderPage();
    await screen.findByTestId('drivers-table');

    expect(screen.queryByTestId('drivers-order-count')).not.toBeInTheDocument();
    expect(screen.queryByTestId('drivers-assign')).not.toBeInTheDocument();
    expect(screen.queryByTestId('drivers-row-actions')).not.toBeInTheDocument();
  });
});

describe('clientLoader de Repartidores (módulo 18 + feature 123)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deja pasar al Owner con la feature 123', async () => {
    session.user = makeUser();
    await expect(clientLoader({ params: {} } as never)).resolves.toBeNull();
  });

  /**
   * D15: el StoreUser también gestiona repartidores. Un `ownerModuleLoader` como el de F1 lo
   * desloguearía; por eso esta vista usa `featureLoader`.
   */
  it('deja pasar al StoreUser con la feature 123 en su rol', async () => {
    session.user = makeStoreUser();
    await expect(clientLoader({ params: {} } as never)).resolves.toBeNull();
  });

  /**
   * `featureLoader` tiene un bypass LEGACY para OwnerAdmin/SuperAdmin: pasa antes de mirar
   * features. Es el comportamiento de todo el panel y esta vista lo hereda a cambio de admitir al
   * StoreUser. Se fija aquí para que sea una decisión documentada y no un descuido: quien llame
   * a `/sales/online-orders/drivers` sin feature 123 ve la pantalla con su aviso de error, y el
   * 403 real llega del backend. Quien no debe ver el ENLACE no lo ve: el `featureIds` del ítem de
   * menú (123) sí pasa por `isUserAuthorized`, sin bypass.
   */
  it('deja pasar a un Owner aunque no tenga la 123: es el bypass legacy de featureLoader', async () => {
    session.user = makeUser({ featureIds: [EFeatures.WebCatalog] });

    await expect(clientLoader({ params: {} } as never)).resolves.toBeNull();
    expect(session.logout).not.toHaveBeenCalled();
  });

  it('desloguea a un StoreUser sin la feature 123 en su rol', async () => {
    session.user = makeUser({
      isOwnerAdmin: false,
      roles: [
        { storeId: 's1', storeName: 'Tienda 1', moduleId: EModules.WebCatalog, featureIds: [] },
      ],
    });

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
