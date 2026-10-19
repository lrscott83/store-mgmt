import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import type { Store } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';

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

function makeStore(overrides: Partial<Store> = {}): Store {
  return {
    id: 's1',
    name: 'Store One',
    displayName: 'Store One',
    ownerId: 'o1',
    ownerName: 'Owner One',
    address: 'Calle 1',
    description: 'Desc',
    approved: true,
    paymentStartDate: '2024-01-01',
    nextPaymentDate: null,
    ownerPhone: null,
    planType: 'Pago',
    planPrice: 10,
    planCurrentPrice: 10,
    modules: [],
    publicPhone: '+53 5555 1234',
    addressCity: 'La Habana',
    addressProvince: 'Playa',
    latitude: 23.13,
    longitude: -82.38,
    openingHours: [{ day: 'Monday', opens: '09:00', closes: '17:00' }],
    isActive: true,
    ...overrides,
  };
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

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

    expect(await screen.findByTestId('location-public-phone')).toHaveValue('+53 5555 1234');
    expect(screen.getByTestId('location-address-city')).toHaveValue('La Habana');
    expect(screen.getByTestId('location-address-province')).toHaveValue('Playa');
    expect(screen.getByTestId('location-latitude')).toHaveValue(23.13);
    expect(screen.getByTestId('location-longitude')).toHaveValue(-82.38);
    expect(screen.getByLabelText('Apertura Lunes')).toHaveValue('09:00');
    expect(screen.getByLabelText('Cierre Lunes')).toHaveValue('17:00');
    expect(storeMock.getStore).toHaveBeenCalledWith('s1');
    // Sin cambios respecto a lo cargado, el botón no está disponible.
    expect(screen.getByTestId('location-save')).toBeDisabled();
  });

  it('se pliega y despliega con el toggle de la cabecera', async () => {
    const { CatalogLocationCard } = await import('../catalog-location-card');
    render(
      <Wrapper>
        <CatalogLocationCard storeId="s1" />
      </Wrapper>,
    );

    const toggle = screen.getByTestId('location-toggle');
    await screen.findByTestId('location-public-phone');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('location-public-phone')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('location-public-phone')).toBeInTheDocument();
  });

  it('guarda el bloque editado y deja pasar el resto del GET tal cual; toast y recarga', async () => {
    const { CatalogLocationCard } = await import('../catalog-location-card');
    render(
      <Wrapper>
        <CatalogLocationCard storeId="s1" />
      </Wrapper>,
    );

    const phone = await screen.findByTestId('location-public-phone');
    fireEvent.change(phone, { target: { value: '+53 5555 9999' } });
    fireEvent.change(screen.getByTestId('location-latitude'), { target: { value: '23.5' } });

    const save = screen.getByTestId('location-save');
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
    expect(payload.address).toBe('Calle 1');
    expect(payload.description).toBe('Desc');
    expect(payload.approved).toBe(true);
    expect(payload.isActive).toBe(true);
    expect(payload).not.toHaveProperty('paymentStartDate');

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledTimes(1);
    });
    // Tras guardar, recarga desde el servidor (el GET inicial + el de la recarga).
    await waitFor(() => {
      expect(storeMock.getStore).toHaveBeenCalledTimes(2);
    });
  });

  it('un campo vacío limpia el dato guardado (undefined en el payload)', async () => {
    const { CatalogLocationCard } = await import('../catalog-location-card');
    render(
      <Wrapper>
        <CatalogLocationCard storeId="s1" />
      </Wrapper>,
    );

    const phone = await screen.findByTestId('location-public-phone');
    fireEvent.change(phone, { target: { value: '' } });
    fireEvent.click(screen.getByTestId('location-save'));

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

    const longitude = await screen.findByTestId('location-longitude');
    fireEvent.change(longitude, { target: { value: '' } });
    fireEvent.click(screen.getByTestId('location-save'));

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

    await screen.findByTestId('location-public-phone');
    fireEvent.change(screen.getByLabelText('Apertura Martes'), { target: { value: '09:00' } });
    fireEvent.click(screen.getByTestId('location-save'));

    expect(
      await screen.findByText('Cada día con horario necesita apertura y cierre.'),
    ).toBeInTheDocument();
    expect(storeMock.updateStore).not.toHaveBeenCalled();
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
    expect(screen.queryByTestId('location-public-phone')).not.toBeInTheDocument();
  });
});
