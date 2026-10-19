import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import type { Store } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import { makeStore } from './store-fixture';

const storeMock = vi.hoisted(() => ({
  getStore: vi.fn(),
  updateStore: vi.fn(),
}));

vi.mock('~/management/stores/lib/services/store-http-service', () => ({
  storeHttpService: {
    getStore: (...args: unknown[]) => storeMock.getStore(...args),
    updateStore: (...args: unknown[]) => storeMock.updateStore(...args),
  },
}));

const toastMock = vi.hoisted(() => vi.fn());

vi.mock('~/shared/lib/toast', () => ({
  showToastSuccess: (...args: unknown[]) => toastMock(...args),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

/** El botón de guardado se consulta por su etiqueta visible, no por un testid. */
const SAVE_BUTTON = { name: /guardar ubicación/i };

describe('CatalogLocationCard — ubicación pública del catálogo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeMock.getStore.mockResolvedValue({ succeeded: true, data: makeStore() });
    storeMock.updateStore.mockResolvedValue({ succeeded: true, data: true });
  });

  it('hidrata los campos desde el GET, nace expandido y sin cambios pendientes', async () => {
    const { CatalogLocationCard } = await import('../catalog-location-card');
    render(
      <Wrapper>
        <CatalogLocationCard storeId="s1" />
      </Wrapper>,
    );

    const toggle = screen.getByTestId('location-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    expect(await screen.findByLabelText(/teléfono público/i)).toHaveValue('+53 5555 1234');
    expect(screen.getByLabelText(/^ciudad$/i)).toHaveValue('La Habana');
    expect(screen.getByLabelText(/^provincia$/i)).toHaveValue('Playa');
    expect(screen.getByLabelText(/^latitud$/i)).toHaveValue(23.13);
    expect(screen.getByLabelText(/^longitud$/i)).toHaveValue(-82.38);
    expect(screen.getByLabelText('Apertura Lunes')).toHaveValue('09:00');
    expect(screen.getByLabelText('Cierre Lunes')).toHaveValue('17:00');
    expect(storeMock.getStore).toHaveBeenCalledWith('s1');
    // Sin cambios respecto a lo cargado, el botón no está disponible.
    expect(screen.getByRole('button', SAVE_BUTTON)).toBeDisabled();
  });

  it('se pliega y despliega con el toggle de la cabecera', async () => {
    const { CatalogLocationCard } = await import('../catalog-location-card');
    render(
      <Wrapper>
        <CatalogLocationCard storeId="s1" />
      </Wrapper>,
    );

    const toggle = screen.getByTestId('location-toggle');
    await screen.findByLabelText(/teléfono público/i);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText(/teléfono público/i)).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText(/teléfono público/i)).toBeInTheDocument();
  });

  it('guarda el bloque editado y deja pasar el resto del GET fresco; toast y recarga', async () => {
    const { CatalogLocationCard } = await import('../catalog-location-card');
    render(
      <Wrapper>
        <CatalogLocationCard storeId="s1" />
      </Wrapper>,
    );

    const phone = await screen.findByLabelText(/teléfono público/i);
    fireEvent.change(phone, { target: { value: '+53 5555 9999' } });
    fireEvent.change(screen.getByLabelText(/^latitud$/i), { target: { value: '23.5' } });

    const save = screen.getByRole('button', SAVE_BUTTON);
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => {
      expect(storeMock.updateStore).toHaveBeenCalledTimes(1);
    });
    const payload = storeMock.updateStore.mock.calls[0][1];
    expect(payload.updateLocation).toBe(true);
    expect(payload.publicPhone).toBe('+53 5555 9999');
    expect(payload.addressCity).toBe('La Habana');
    expect(payload.addressProvince).toBe('Playa');
    // Las coordenadas viajan como números de la forma en que se cargaron.
    expect(payload.latitude).toBe(23.5);
    expect(payload.longitude).toBe(-82.38);
    expect(payload.openingHours).toEqual([{ day: 'Monday', opens: '09:00', closes: '17:00' }]);
    // El resto de los datos pasa sin tocar (los aplica bajo updateLocation).
    expect(payload.name).toBe('Store One');
    expect(payload.address).toBe('123 Main St');
    expect(payload.description).toBe('A store');
    expect(payload.approved).toBe(true);
    expect(payload.isActive).toBe(true);
    expect(payload).not.toHaveProperty('paymentStartDate');

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledTimes(1);
    });
    // GET inicial + GET previo al guardado + recarga posterior.
    await waitFor(() => {
      expect(storeMock.getStore).toHaveBeenCalledTimes(3);
    });
  });

  it('relee la tienda justo antes de guardar y reenvía el resto desde ese GET', async () => {
    storeMock.getStore
      .mockResolvedValueOnce({ succeeded: true, data: makeStore({ name: 'Nombre viejo' }) })
      .mockResolvedValueOnce({
        succeeded: true,
        data: makeStore({ name: 'Nombre fresco', address: 'Calle 2' }),
      });
    const { CatalogLocationCard } = await import('../catalog-location-card');
    render(
      <Wrapper>
        <CatalogLocationCard storeId="s1" />
      </Wrapper>,
    );

    fireEvent.change(await screen.findByLabelText(/teléfono público/i), {
      target: { value: '+53 5555 0000' },
    });
    fireEvent.click(screen.getByRole('button', SAVE_BUTTON));

    await waitFor(() => {
      expect(storeMock.updateStore).toHaveBeenCalledTimes(1);
    });
    const payload = storeMock.updateStore.mock.calls[0][1];
    expect(payload.name).toBe('Nombre fresco');
    expect(payload.address).toBe('Calle 2');
    expect(payload.publicPhone).toBe('+53 5555 0000');
  });

  it('no guarda si el GET previo al guardado falla', async () => {
    storeMock.getStore
      .mockResolvedValueOnce({ succeeded: true, data: makeStore() })
      .mockResolvedValueOnce({ succeeded: false });
    const { CatalogLocationCard } = await import('../catalog-location-card');
    render(
      <Wrapper>
        <CatalogLocationCard storeId="s1" />
      </Wrapper>,
    );

    fireEvent.change(await screen.findByLabelText(/teléfono público/i), {
      target: { value: '+53 5555 0000' },
    });
    fireEvent.click(screen.getByRole('button', SAVE_BUTTON));

    expect(await screen.findByText('No se pudo guardar la ubicación')).toBeInTheDocument();
    expect(storeMock.updateStore).not.toHaveBeenCalled();
    expect(storeMock.getStore).toHaveBeenCalledTimes(2);
  });

  it('muestra el error de guardado cuando el endpoint responde fallido y conserva lo editado', async () => {
    storeMock.updateStore.mockResolvedValue({ succeeded: false, data: false });
    const { CatalogLocationCard } = await import('../catalog-location-card');
    render(
      <Wrapper>
        <CatalogLocationCard storeId="s1" />
      </Wrapper>,
    );

    fireEvent.change(await screen.findByLabelText(/teléfono público/i), {
      target: { value: '+53 5555 9999' },
    });
    fireEvent.click(screen.getByRole('button', SAVE_BUTTON));

    expect(await screen.findByText('No se pudo guardar la ubicación')).toBeInTheDocument();
    expect(toastMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/teléfono público/i)).toHaveValue('+53 5555 9999');
    // Sin recarga tras el fallo: GET inicial + GET previo al guardado.
    expect(storeMock.getStore).toHaveBeenCalledTimes(2);
  });

  it('muestra el error de guardado cuando la petición lanza', async () => {
    storeMock.updateStore.mockRejectedValue(new Error('boom'));
    const { CatalogLocationCard } = await import('../catalog-location-card');
    render(
      <Wrapper>
        <CatalogLocationCard storeId="s1" />
      </Wrapper>,
    );

    fireEvent.change(await screen.findByLabelText(/teléfono público/i), {
      target: { value: '+53 5555 9999' },
    });
    fireEvent.click(screen.getByRole('button', SAVE_BUTTON));

    expect(await screen.findByText('No se pudo guardar la ubicación')).toBeInTheDocument();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('un campo vacío limpia el dato guardado (undefined en el payload)', async () => {
    const { CatalogLocationCard } = await import('../catalog-location-card');
    render(
      <Wrapper>
        <CatalogLocationCard storeId="s1" />
      </Wrapper>,
    );

    const phone = await screen.findByLabelText(/teléfono público/i);
    fireEvent.change(phone, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', SAVE_BUTTON));

    await waitFor(() => {
      expect(storeMock.updateStore).toHaveBeenCalledTimes(1);
    });
    const payload = storeMock.updateStore.mock.calls[0][1];
    expect(payload.publicPhone).toBeUndefined();
  });

  it('bloquea el guardado cuando solo hay una coordenada', async () => {
    const { CatalogLocationCard } = await import('../catalog-location-card');
    render(
      <Wrapper>
        <CatalogLocationCard storeId="s1" />
      </Wrapper>,
    );

    await screen.findByLabelText(/^longitud$/i);
    fireEvent.change(screen.getByLabelText(/^longitud$/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', SAVE_BUTTON));

    expect(
      await screen.findByText('La latitud y la longitud deben venir juntas.'),
    ).toBeInTheDocument();
    expect(storeMock.updateStore).not.toHaveBeenCalled();
  });

  it('bloquea el guardado cuando un día queda a medio llenar', async () => {
    const { CatalogLocationCard } = await import('../catalog-location-card');
    render(
      <Wrapper>
        <CatalogLocationCard storeId="s1" />
      </Wrapper>,
    );

    await screen.findByLabelText(/teléfono público/i);
    fireEvent.change(screen.getByLabelText('Apertura Martes'), { target: { value: '09:00' } });
    fireEvent.click(screen.getByRole('button', SAVE_BUTTON));

    expect(
      await screen.findByText('Cada día con horario necesita apertura y cierre.'),
    ).toBeInTheDocument();
    expect(storeMock.updateStore).not.toHaveBeenCalled();
  });

  it('hidrata vacío cuando la tienda no trae coordenadas (ni el literal "undefined")', async () => {
    const storeWithoutCoordinates = {
      ...makeStore(),
      latitude: undefined,
      longitude: undefined,
    } as unknown as Store;
    storeMock.getStore.mockResolvedValue({ succeeded: true, data: storeWithoutCoordinates });
    const { CatalogLocationCard } = await import('../catalog-location-card');
    render(
      <Wrapper>
        <CatalogLocationCard storeId="s1" />
      </Wrapper>,
    );

    expect(await screen.findByLabelText(/^latitud$/i)).toHaveValue(null);
    expect(screen.getByLabelText(/^longitud$/i)).toHaveValue(null);
  });

  it('muestra el error de carga en la tarjeta', async () => {
    storeMock.getStore.mockRejectedValue(new Error('boom'));
    const { CatalogLocationCard } = await import('../catalog-location-card');
    render(
      <Wrapper>
        <CatalogLocationCard storeId="s1" />
      </Wrapper>,
    );

    expect(await screen.findByText('No se pudo cargar la ubicación')).toBeInTheDocument();
    expect(screen.queryByLabelText(/teléfono público/i)).not.toBeInTheDocument();
  });
});
