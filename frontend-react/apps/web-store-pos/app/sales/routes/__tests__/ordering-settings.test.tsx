import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { EModules } from '@store-mgmt/domain';
import type { UserModel } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import type { OrderingSettings } from '~/sales/lib/services/ordering-http-service';

/** Sesión mutable: el loader y los tests de gate la reescriben por prueba. */
const session = vi.hoisted(() => ({
  user: null as UserModel | null,
  logout: vi.fn(),
}));

vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: Object.assign(
    // La vista pide la tienda seleccionada con un selector; el resto del código usa `getState()`.
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

import { OrderingSettingsPage, clientLoader } from '../ordering-settings';

const envelope = <T,>(data: T) => ({ data, succeeded: true, message: '', actionCode: 200, errors: [] });

const failure = (description: string) => ({
  data: null,
  succeeded: false,
  message: '',
  actionCode: 400,
  errors: [{ code: 'Ordering.WhatsappNumberRequired', description }],
});

/** Tienda sin configurar: el backend devuelve los defaults con `enabled = false`. */
const DISABLED_SETTINGS: OrderingSettings = {
  enabled: false,
  whatsappNumber: null,
  pickupEnabled: false,
  deliveryEnabled: false,
  businessHours: null,
  deliveryZones: null,
  syncedAt: null,
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
    featureIds: [122],
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

function renderPage() {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <OrderingSettingsPage />
    </IntlProvider>,
  );
}

/** El switch maestro: el `data-testid` envuelve al control `role="switch"`. */
async function enabledSwitch() {
  return within(await screen.findByTestId('ordering-enabled')).getByRole('switch');
}

describe('OrderingSettingsPage (vista Pedidos WhatsApp)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.user = makeUser();
    orderingMock.getSettings.mockResolvedValue(envelope(DISABLED_SETTINGS));
    orderingMock.updateSettings.mockResolvedValue(envelope(DISABLED_SETTINGS));
  });

  it('sin configuración el interruptor nace apagado y el panel no se muestra', async () => {
    renderPage();

    expect(await enabledSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByTestId('ordering-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ordering-whatsapp')).not.toBeInTheDocument();
    expect(screen.getByTestId('ordering-last-sync')).toHaveTextContent('Nunca');
  });

  it('encender el interruptor muestra el panel de configuración', async () => {
    renderPage();

    fireEvent.click(await enabledSwitch());

    const panel = await screen.findByTestId('ordering-panel');
    expect(within(panel).getByTestId('ordering-whatsapp')).toBeInTheDocument();
    expect(screen.getByTestId('ordering-pickup')).toBeInTheDocument();
    expect(screen.getByTestId('ordering-delivery')).toBeInTheDocument();
    expect(screen.getByTestId('ordering-business-hours')).toBeInTheDocument();
    expect(screen.getByTestId('ordering-delivery-zones')).toBeInTheDocument();
    // Sin costo de envío ni importe mínimo: no hay nada que configurar de eso (el precio y la
    // moneda salen del catálogo, A3 eliminada).
    expect(screen.queryByTestId('ordering-delivery-fee')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ordering-minimum-amount')).not.toBeInTheDocument();
    // Sin selector de moneda: el precio y la moneda salen del catálogo (A3 eliminada).
    expect(screen.getByText('El precio y la moneda salen del catálogo, no se configuran aquí.'))
      .toBeInTheDocument();
  });

  it('apagar el interruptor vuelve a ocultar el panel sin tocar la red', async () => {
    renderPage();

    fireEvent.click(await enabledSwitch());
    await screen.findByTestId('ordering-panel');
    orderingMock.updateSettings.mockClear();

    fireEvent.click(screen.getByTestId('ordering-enabled').querySelector('button') as HTMLElement);

    expect(screen.queryByTestId('ordering-panel')).not.toBeInTheDocument();
    expect(orderingMock.updateSettings).not.toHaveBeenCalled();
  });

  it('Sincronizar guarda la fila completa con lo que el dueño escribió', async () => {
    renderPage();

    fireEvent.click(await enabledSwitch());
    await screen.findByTestId('ordering-panel');

    fireEvent.change(screen.getByTestId('ordering-whatsapp'), { target: { value: '5351234567' } });
    fireEvent.click(screen.getByTestId('ordering-pickup').querySelector('button') as HTMLElement);
    fireEvent.click(screen.getByTestId('ordering-delivery').querySelector('button') as HTMLElement);
    fireEvent.change(screen.getByTestId('ordering-business-hours'), {
      target: { value: 'Lunes a sábado de 8:00 a 18:00' },
    });
    fireEvent.change(screen.getByTestId('ordering-delivery-zones'), {
      target: { value: 'Vedado y Centro Habana' },
    });

    fireEvent.click(screen.getByTestId('ordering-sync'));

    await waitFor(() => expect(orderingMock.updateSettings).toHaveBeenCalledTimes(1));
    expect(orderingMock.updateSettings).toHaveBeenCalledWith({
      enabled: true,
      whatsappNumber: '5351234567',
      pickupEnabled: true,
      deliveryEnabled: true,
      businessHours: 'Lunes a sábado de 8:00 a 18:00',
      deliveryZones: 'Vedado y Centro Habana',
    });
    await waitFor(() =>
      expect(showToastSuccessMock).toHaveBeenCalledWith('Configuración de pedidos guardada'),
    );
    // El servidor manda: tras guardar se recarga para decir la verdad.
    expect(orderingMock.getSettings).toHaveBeenCalledTimes(2);
  });

  it('un texto vacío viaja como null, no como cadena en blanco', async () => {
    orderingMock.getSettings.mockResolvedValue(
      envelope({ ...DISABLED_SETTINGS, enabled: true, pickupEnabled: true }),
    );
    renderPage();

    fireEvent.click(await enabledSwitch());
    fireEvent.click(screen.getByTestId('ordering-sync'));

    await waitFor(() => expect(orderingMock.updateSettings).toHaveBeenCalledTimes(1));
    expect(orderingMock.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ whatsappNumber: null, businessHours: null, deliveryZones: null }),
    );
  });

  it('un rechazo del servidor se muestra con SU mensaje de validación', async () => {
    orderingMock.updateSettings.mockResolvedValue(
      failure('El campo WhatsappNumber es obligatorio.'),
    );
    renderPage();

    fireEvent.click(await enabledSwitch());
    await screen.findByTestId('ordering-panel');
    fireEvent.click(screen.getByTestId('ordering-sync'));

    await waitFor(() => expect(showBlockingErrorMock).toHaveBeenCalled());
    expect(showBlockingErrorMock).toHaveBeenCalledWith('Error', 'El campo WhatsappNumber es obligatorio.');
    expect(showToastSuccessMock).not.toHaveBeenCalled();
  });

  it('un fallo de red al guardar avisa sin toast de éxito', async () => {
    orderingMock.updateSettings.mockRejectedValue(
      Object.assign(new Error('offline'), { isNetworkError: true }),
    );
    renderPage();

    fireEvent.click(await enabledSwitch());
    await screen.findByTestId('ordering-panel');
    fireEvent.click(screen.getByTestId('ordering-sync'));

    await waitFor(() => expect(showBlockingErrorMock).toHaveBeenCalled());
    expect(showBlockingErrorMock).toHaveBeenCalledWith('Error', 'Sin conexión. Se requiere conexión a internet.');
    expect(showToastSuccessMock).not.toHaveBeenCalled();
  });

  it('si la carga falla se avisa en pantalla y no se pinta el formulario', async () => {
    orderingMock.getSettings.mockResolvedValue(failure('Tienda no seleccionada.'));
    renderPage();

    expect(await screen.findByTestId('ordering-error')).toHaveTextContent(
      'No se pudo cargar la configuración de pedidos',
    );
    expect(screen.queryByTestId('ordering-enabled')).not.toBeInTheDocument();
  });

  it('una configuración ya guardada se pinta con sus valores y su sello de sincronización', async () => {
    orderingMock.getSettings.mockResolvedValue(
      envelope({
        ...DISABLED_SETTINGS,
        enabled: true,
        whatsappNumber: '5351234567',
        pickupEnabled: true,
        businessHours: 'Lunes a sábado',
        deliveryZones: 'Vedado',
        syncedAt: '2026-10-07T10:00:00Z',
      }),
    );
    renderPage();

    expect(await enabledSwitch()).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('ordering-whatsapp')).toHaveValue('5351234567');
    expect(screen.getByTestId('ordering-business-hours')).toHaveValue('Lunes a sábado');
    expect(screen.getByTestId('ordering-delivery-zones')).toHaveValue('Vedado');
    // Ningún selector de moneda: el precio y la moneda son del catálogo.
    expect(screen.queryByText('Moneda')).not.toBeInTheDocument();
    expect(screen.getByTestId('ordering-last-sync')).not.toHaveTextContent('Nunca');
  });
});

describe('clientLoader de Pedidos WhatsApp (módulo 18 + Owner)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deja pasar al Owner con el módulo activo', async () => {
    session.user = makeUser();
    await expect(clientLoader()).resolves.toBeNull();
  });

  it('desloguea al Owner sin el módulo contratado', async () => {
    session.user = makeUser({ storeModuleIds: [] });

    const result = await clientLoader();

    expect(session.logout).toHaveBeenCalled();
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
  });

  it('desloguea a un usuario de tienda aunque tenga la feature 122', async () => {
    session.user = makeUser({ isOwnerAdmin: false, featureIds: [122] });

    const result = await clientLoader();

    expect(session.logout).toHaveBeenCalled();
    expect(result).toBeInstanceOf(Response);
  });

  it('desloguea a una sesión sin autenticar', async () => {
    session.user = null;

    const result = await clientLoader();

    expect(session.logout).toHaveBeenCalled();
    expect(result).toBeInstanceOf(Response);
  });
});