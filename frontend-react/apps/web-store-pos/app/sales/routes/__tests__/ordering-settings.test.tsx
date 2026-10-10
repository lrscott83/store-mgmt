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

import { OrderingSettingsPage, clientLoader, formatSyncedAt } from '../ordering-settings';

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

/**
 * F1-R9 — localizadores por ACCESIBILIDAD, no por `data-testid`.
 *
 * Un `data-testid` solo ve que existe un atributo: si el `<label>` se desalinea de su `id`, o el
 * `Switch` pierde su `aria-label`, los lectores de pantalla se quedan sin nombre y la vista sigue
 * "verde" en los tests. Con rol + nombre accesible, el mismo defecto rompe el test.
 *
 *   * `Switch` expone `role="switch"` con `aria-label` = su texto visible (`ORDERING_SETTINGS.*`).
 *   * Los campos de texto son `<label htmlFor>` + `<input id>` → `getByLabelText`.
 *   * El botón Sincronizar es un `<button>` con el texto del mensaje como nombre accesible.
 *   * `InfoBox` expone `role="status"`, así que el error fatal y el aviso de recarga se localizan
 *     por rol en vez de por el testid que los envuelve.
 *
 * Los `data-testid` SIGUEN en producción: no se tocan (esta tarea no cambia la vista más de lo
 * necesario). Los que quedan en los tests son los que no tienen nombre accesible propio —el panel,
 * el sello de sincronización y los switches sin `aria-label` propio fuera del maestro— y están
 * señalados donde aparecen.
 */
const ENABLED_SWITCH = { name: 'Pedidos online' };
const PICKUP_SWITCH = { name: 'Recogida en la tienda' };
const DELIVERY_SWITCH = { name: 'Envío a domicilio' };

/** El interruptor maestro, por su rol y su nombre accesible. */
function enabledSwitch() {
  return screen.findByRole('switch', ENABLED_SWITCH);
}

/** El interruptor de recogida, por rol y nombre. */
function pickupSwitch() {
  return screen.findByRole('switch', PICKUP_SWITCH);
}

/** El interruptor de envío, por rol y nombre. */
function deliverySwitch() {
  return screen.findByRole('switch', DELIVERY_SWITCH);
}

/**
 * El botón Sincronizar, por rol y nombre. Es `find` a propósito, no `get`: mientras guarda, el
 * botón se renombra a "Sincronizando..." (mismo `<button>`, otro nombre accesible), así que un
 * `getByRole` sin reintentos fallaría justo en el segundo guardado de una misma prueba.
 */
function syncButton() {
  return screen.findByRole('button', { name: 'Sincronizar' });
}

/**
 * El aviso de "guardado, pero no se pudo recargar".
 *
 * Se busca el `role="status"` DENTRO de su región y no a secas a propósito: la caja de error
 * fatal es el MISMO `InfoBox` con el mismo rol, y con un fallo de red pinta exactamente el mismo
 * texto. Un `getByRole('status')` a secas daría verde tanto con el aviso correcto como con el
 * error fatal que el aviso sustituye — es decir, no probaría nada.
 */
function staleWarning() {
  return within(screen.getByTestId('ordering-stale-warning')).getByRole('status');
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
    // F1-R9: por ETIQUETA y por ROL, no por testid. El panel sigue por testid (no tiene nombre
    // accesible propio), pero lo que hay dentro se localiza como lo localizeía un lector de
    // pantalla.
    expect(within(panel).getByLabelText('Número de WhatsApp')).toBeInTheDocument();
    expect(within(panel).getByRole('switch', PICKUP_SWITCH)).toBeInTheDocument();
    expect(within(panel).getByRole('switch', DELIVERY_SWITCH)).toBeInTheDocument();
    expect(within(panel).getByLabelText('Horario de atención')).toBeInTheDocument();
    expect(within(panel).getByLabelText('Zonas de reparto')).toBeInTheDocument();
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

    // F1-R9: se apaga por el MISMO interruptor, no por el `querySelector('button')` que colgaba
    // del testid: así el test usa el control que el dueño usa.
    fireEvent.click(await enabledSwitch());

    expect(screen.queryByTestId('ordering-panel')).not.toBeInTheDocument();
    expect(orderingMock.updateSettings).not.toHaveBeenCalled();
  });

  it('Sincronizar guarda la fila completa con lo que el dueño escribió', async () => {
    renderPage();

    fireEvent.click(await enabledSwitch());
    await screen.findByTestId('ordering-panel');

    fireEvent.change(screen.getByLabelText('Número de WhatsApp'), { target: { value: '5351234567' } });
    fireEvent.click(await pickupSwitch());
    fireEvent.click(await deliverySwitch());
    fireEvent.change(screen.getByLabelText('Horario de atención'), {
      target: { value: 'Lunes a sábado de 8:00 a 18:00' },
    });
    fireEvent.change(screen.getByLabelText('Zonas de reparto'), {
      target: { value: 'Vedado y Centro Habana' },
    });

    fireEvent.click(await syncButton());

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
    fireEvent.click(await syncButton());

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
    fireEvent.click(await syncButton());

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
    fireEvent.click(await syncButton());

    await waitFor(() => expect(showBlockingErrorMock).toHaveBeenCalled());
    expect(showBlockingErrorMock).toHaveBeenCalledWith('Error', 'Sin conexión. Se requiere conexión a internet.');
    expect(showToastSuccessMock).not.toHaveBeenCalled();
  });

  it('si la carga falla se avisa en pantalla y no se pinta el formulario', async () => {
    orderingMock.getSettings.mockResolvedValue(failure('Tienda no seleccionada.'));
    renderPage();

    // F1-R9 (límite): aquí NO se puede usar `role="status"`. `Spinner` y `InfoBox` comparten ese
    // rol y no hay ningún nombre accesible que los distinga, así que un `findByRole('status')`
    // resuelve contra el Spinner —con texto vacío— mientras carga. La caja de error fatal solo
    // tiene un asidero propio: su `data-testid`. Queda anotado como hueco de markup (el aviso de
    // recarga sí se localiza por rol, porque va dentro de una región propia).
    expect(await screen.findByTestId('ordering-error')).toHaveTextContent(
      'No se pudo cargar la configuración de pedidos',
    );
    expect(screen.queryByRole('switch', ENABLED_SWITCH)).not.toBeInTheDocument();
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
    expect(screen.getByLabelText('Número de WhatsApp')).toHaveValue('5351234567');
    expect(screen.getByLabelText('Horario de atención')).toHaveValue('Lunes a sábado');
    expect(screen.getByLabelText('Zonas de reparto')).toHaveValue('Vedado');
    // Ningún selector de moneda: el precio y la moneda son del catálogo.
    expect(screen.queryByText('Moneda')).not.toBeInTheDocument();
    expect(screen.getByTestId('ordering-last-sync')).not.toHaveTextContent('Nunca');
  });

  // F1-R9 — el caso que un `getByTestId` NO puede fijar. Si el `<label>` de un campo se
  // desalineara de su `id` (o se borrara), el `getByTestId('ordering-whatsapp')` seguiría
  // verde, pero el lector de pantalla se quedaría sin nombre: el campo se anunciaría como "caja
  // de texto" a secas. Estos localizadores por ETIQUETA son los que se rompen con ese defecto, y
  // por eso valen más que el testid que convive con ellos.
  it('los campos se localizan por su etiqueta, no por un testid', async () => {
    orderingMock.getSettings.mockResolvedValue(
      envelope({ ...DISABLED_SETTINGS, enabled: true, whatsappNumber: '5351234567' }),
    );
    renderPage();

    // El interruptor ya viene encendido de la fila guardada: NO se pulsa (eso lo apagaría y
    // escondería justo el panel que se quiere localizar).
    expect(await enabledSwitch()).toHaveAttribute('aria-checked', 'true');
    await screen.findByTestId('ordering-panel');

    expect(screen.getByLabelText('Número de WhatsApp')).toHaveValue('5351234567');
    expect(screen.getByLabelText('Horario de atención')).toBeInTheDocument();
    expect(screen.getByLabelText('Zonas de reparto')).toBeInTheDocument();
  });

  // F1-R6 — el guardado OK con recarga fallida. Antes el `catch` de `loadData` caía en el mismo
  // `error` FATAL que la carga inicial, así que la vista pintaba a la vez el toast de éxito y una
  // caja roja, y además escondía el formulario (`!error`): el dueño veía desaparecer lo que
  // acababa de escribir sin ninguna explicación útil.
  it('si el guardado funciona pero la recarga falla, avisa sin error fatal y conserva los valores', async () => {
    orderingMock.getSettings.mockResolvedValue(
      envelope({ ...DISABLED_SETTINGS, enabled: true, pickupEnabled: true }),
    );
    renderPage();

    // La fila guardada ya tiene el interruptor encendido: pulsarlo lo apagaría.
    expect(await enabledSwitch()).toHaveAttribute('aria-checked', 'true');
    await screen.findByTestId('ordering-panel');
    fireEvent.change(screen.getByLabelText('Número de WhatsApp'), { target: { value: '5351234567' } });

    // La recarga posterior al guardado falla por red: el PUT ya está hecho.
    orderingMock.getSettings.mockRejectedValue(
      Object.assign(new Error('offline'), { isNetworkError: true }),
    );
    fireEvent.click(await syncButton());

    await waitFor(() => expect(orderingMock.updateSettings).toHaveBeenCalledTimes(1));
    // El aviso NO es fatal: no hay caja roja y el formulario sigue en pantalla.
    //
    // OJO con el localizador: la caja de ERROR FATAL también es `role="status"` (mismo
    // `InfoBox`) y pinta el MISMO texto cuando el fallo es de red. Un `getByRole('status')` a
    // secas, en esta prueba, daría verde también con el comportamiento roto. Por eso el aviso se
    // busca DENTRO de su propia región, y se afirma además que la región de error no existe.
    await waitFor(() =>
      expect(staleWarning()).toHaveTextContent('Sin conexión. Se requiere conexión a internet.'),
    );
    expect(screen.queryByTestId('ordering-error')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Número de WhatsApp')).toHaveValue('5351234567');
    expect(screen.getByRole('switch', ENABLED_SWITCH)).toBeInTheDocument();
    // El éxito del guardado sigue siendo un éxito: el PUT sí se hizo.
    expect(showToastSuccessMock).toHaveBeenCalledWith('Configuración de pedidos guardada');
    expect(showBlockingErrorMock).not.toHaveBeenCalled();
  });

  // El caso contiguo del anterior: una recarga que devuelve `succeeded: false` (no una excepción)
  // es el MISMO fallo y no puede volver a caer en el error fatal.
  it('si la recarga devuelve un fallo de negocio, tampoco tapa el formulario', async () => {
    orderingMock.getSettings.mockResolvedValue(
      envelope({ ...DISABLED_SETTINGS, enabled: true, pickupEnabled: true }),
    );
    renderPage();

    // Sin pulsar el interruptor: la fila guardada ya lo tiene encendido.
    await screen.findByTestId('ordering-panel');

    orderingMock.getSettings.mockResolvedValue(failure('Tienda no seleccionada.'));
    fireEvent.click(await syncButton());

    await waitFor(() =>
      expect(staleWarning()).toHaveTextContent('No se pudo cargar la configuración de pedidos'),
    );
    expect(screen.queryByTestId('ordering-error')).not.toBeInTheDocument();
    expect(screen.getByRole('switch', ENABLED_SWITCH)).toBeInTheDocument();
  });

  // El aviso anterior se limpia al guardar de nuevo: si no, un aviso viejo sobrevive a un
  // guardado que sí recargó bien.
  it('un guardado que sí recarga limpia el aviso de la recarga anterior', async () => {
    orderingMock.getSettings.mockResolvedValue(
      envelope({ ...DISABLED_SETTINGS, enabled: true, pickupEnabled: true }),
    );
    renderPage();

    await screen.findByTestId('ordering-panel');

    orderingMock.getSettings.mockRejectedValueOnce(new Error('boom'));
    fireEvent.click(await syncButton());
    await waitFor(() => expect(staleWarning()).toBeInTheDocument());
    // Se espera a que el guardado termine de verdad (el botón vuelve a habilitarse) antes del
    // segundo clic: sin esta barrera, el `setIsSyncing(false)` del primer guardado se resuelve
    // entre dos `act` y React avisa de una actualización fuera de `act`.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Sincronizar' })).toBeEnabled(),
    );

    // La segunda recarga va bien: el aviso viejo no puede quedar ahí diciendo lo contrario.
    orderingMock.getSettings.mockResolvedValue(
      envelope({ ...DISABLED_SETTINGS, enabled: true, pickupEnabled: true }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sincronizar' }));

    await waitFor(() =>
      expect(screen.queryByTestId('ordering-stale-warning')).not.toBeInTheDocument(),
    );
  });

  // F1-R7 — la rama de EXCEPCIÓN de la carga inicial. Los tests fijaban el caso `succeeded: false`
  // (que es un rechazo controlado del servicio), no el `throw`, que es lo que de verdad ocurre con
  // una caída de red o un fallo de deserialización. Aquí el `catch` debe absorberlo y pintar el
  // error sin reventar el render.
  it('un fallo lanzado al cargar se muestra como error y no rompe la vista', async () => {
    orderingMock.getSettings.mockRejectedValue(
      Object.assign(new Error('offline'), { isNetworkError: true }),
    );
    renderPage();

    expect(await screen.findByTestId('ordering-error')).toHaveTextContent(
      'Sin conexión. Se requiere conexión a internet.',
    );
    expect(screen.queryByRole('switch', ENABLED_SWITCH)).not.toBeInTheDocument();
    // El botón Sincronizar sigue disponible pero sin formulario que enviar: no es un crash.
    expect(await syncButton()).toBeDisabled();
    expect(screen.queryByTestId('ordering-last-sync')).toHaveTextContent('Nunca');
  });

  // F1-R7 (contiguo) — una excepción en la carga NO pinta aviso de "guardado pero no recargó":
  // ese aviso solo tiene sentido después de un PUT que sí funcionó.
  it('un fallo lanzado al cargar no muestra el aviso de recarga fallida', async () => {
    orderingMock.getSettings.mockRejectedValue(new Error('boom'));
    renderPage();

    expect(await screen.findByTestId('ordering-error')).toBeInTheDocument();
    expect(screen.queryByTestId('ordering-stale-warning')).not.toBeInTheDocument();
    expect(showBlockingErrorMock).not.toHaveBeenCalled();
  });
});

// F1-R8 — `formatSyncedAt` se exporta para fijarla aquí: por la pantalla solo se alcanza con un
// `syncedAt` válido, y lo interesante es justo el borde (sin sufijo de zona, con offset, inválido).
describe('formatSyncedAt (marca de la última sincronización)', () => {
  /** La misma referencia que usa la vista, para no atar el test al `Intl` de otra máquina. */
  const inEs = (iso: string) => new Date(iso).toLocaleString('es-ES');

  it('un valor UTC con sufijo Z se formatea tal cual', () => {
    expect(formatSyncedAt('2026-10-07T10:00:00Z')).toBe(inEs('2026-10-07T10:00:00Z'));
  });

  it('un valor con offset se respeta, sin añadirle otra zona', () => {
    // `+02:00` ya dice la zona: el `Z` solo se añade cuando NO hay ninguna.
    expect(formatSyncedAt('2026-10-07T12:00:00+02:00')).toBe(
      inEs(new Date('2026-10-07T12:00:00+02:00').toISOString()),
    );
  });

  it('sin sufijo de zona se interpreta como UTC, no como hora local', () => {
    // Es la razón del `Z` condicional: sin él el navegador lo leería en la zona de la máquina y la
    // marca cambiaría según quién mire la pantalla.
    expect(formatSyncedAt('2026-10-07T10:00:00')).toBe(inEs('2026-10-07T10:00:00Z'));
  });

  it('un offset en minúsculas también cuenta como zona', () => {
    expect(formatSyncedAt('2026-10-07T10:00:00z')).toBe(inEs('2026-10-07T10:00:00Z'));
  });

  it('un valor inválido no lanza: devuelve lo que el navegador da para una fecha inválida', () => {
    // El backend sella con `IDateTimeProvider` (siempre válido), así que esto no se da en la
    // práctica: lo que se fija aquí es que un valor raro NO rompe el render de la vista.
    expect(() => formatSyncedAt('no-es-una-fecha')).not.toThrow();
    expect(formatSyncedAt('no-es-una-fecha')).toBe('Invalid Date');
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