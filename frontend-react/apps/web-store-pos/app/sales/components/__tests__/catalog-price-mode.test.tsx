import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import type { UserModel } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';

/**
 * Modo de precio del catálogo web (S1/S7) en la tarjeta de configuración.
 *
 * Lo que se fija aquí:
 *   1. El control existe, muestra el modo GUARDADO y ofrece las dos opciones.
 *   2. Guardar un cambio de modo lo manda en el MISMO PUT parcial de la marca, y solo el campo que
 *      cambió (reenviar el resto reescribiría la fila sin motivo).
 *   3. Con el modo mayorista y sin productos con precio mayorista, la tarjeta AVISA de que el
 *      catálogo no publica nada — texto de solo lectura, no un diálogo.
 *   4. Un rechazo del servidor muestra SU motivo: el dueño necesita saber qué le falta, no un
 *      "no se pudo guardar" genérico.
 */

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

const catalogMock = vi.hoisted(() => ({
  getStatus: vi.fn(),
  getProducts: vi.fn(),
  getBranding: vi.fn(),
  updateBranding: vi.fn(),
  getShowcaseImages: vi.fn(),
}));

vi.mock('~/sales/lib/services/catalog-http-service', async () => {
  const actual = await vi.importActual<typeof import('~/sales/lib/services/catalog-http-service')>(
    '~/sales/lib/services/catalog-http-service',
  );
  return {
    ...actual,
    catalogHttpService: { ...actual.catalogHttpService, ...catalogMock },
  };
});

const showBlockingErrorMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: (...args: unknown[]) => showBlockingErrorMock(...args),
  confirmDialog: vi.fn(async () => true),
}));

const showToastSuccessMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/toast', () => ({
  showToastSuccess: (...args: unknown[]) => showToastSuccessMock(...args),
}));

import { WebCatalogSettingsView } from '~/sales/components/web-catalog-settings-view';

const envelope = <T,>(data: T) => ({
  data,
  succeeded: true as const,
  message: null,
  actionCode: 200,
  errors: [],
});

const STATUS = {
  storeSlug: 'mi-tienda',
  catalogUrl: '/catalog/mi-tienda',
  catalogSyncedAt: null,
  sourceCategoriesCount: 0,
  sourceProductsCount: 0,
  publishedProductsCount: 0,
  productsWithoutMainImageCount: 0,
};

/** Marca + modo de precio tal como los devuelve el backend. */
function branding(overrides: Record<string, unknown> = {}) {
  return {
    logoKey: null,
    bannerKey: null,
    paletteId: 'default',
    mobileColumns: 2,
    priceMode: 'Unit',
    hasWholesalePricedProducts: false,
    ...overrides,
  };
}

function renderView() {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <WebCatalogSettingsView />
    </IntlProvider>,
  );
}

const WARNING_TEXT = esMessages['WEB_CATALOG.PRICE_MODE_EMPTY_WARNING'];

describe('WebCatalogSettingsView — modo de precio del catálogo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.user = null;
    catalogMock.getStatus.mockResolvedValue(envelope(STATUS));
    catalogMock.getProducts.mockResolvedValue(envelope([]));
    catalogMock.getShowcaseImages.mockResolvedValue(envelope({ carousel: [], daily: [] }));
    catalogMock.getBranding.mockResolvedValue(envelope(branding()));
    catalogMock.updateBranding.mockResolvedValue(envelope(branding()));
  });

  it('muestra el modo guardado y ofrece precio por unidad o mayorista', async () => {
    catalogMock.getBranding.mockResolvedValue(
      envelope(branding({ priceMode: 'Wholesale', hasWholesalePricedProducts: true })),
    );

    renderView();

    const select = (await screen.findByTestId('brand-price-mode-select')) as HTMLSelectElement;
    expect(select.value).toBe('Wholesale');
    expect(screen.getByRole('option', { name: 'Precio por unidad' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Precio mayorista' })).toBeInTheDocument();
  });

  it('guarda el cambio de modo en el mismo PUT parcial y solo con el campo que cambió', async () => {
    renderView();

    const select = await screen.findByTestId('brand-price-mode-select');
    fireEvent.change(select, { target: { value: 'Wholesale' } });

    const save = screen.getByTestId('brand-save');
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() => expect(catalogMock.updateBranding).toHaveBeenCalledTimes(1));
    expect(catalogMock.updateBranding.mock.calls[0][0]).toEqual({ priceMode: 'Wholesale' });
    await waitFor(() => expect(showToastSuccessMock).toHaveBeenCalledTimes(1));
    // El servidor manda: la vista relee lo guardado.
    await waitFor(() => expect(catalogMock.getBranding).toHaveBeenCalledTimes(2));
  });

  it('no reenvía el modo cuando solo cambian las columnas en móvil', async () => {
    renderView();

    const columns = (await screen.findByTestId('brand-mobile-columns-select')) as HTMLSelectElement;
    fireEvent.change(columns, { target: { value: '1' } });
    fireEvent.click(screen.getByTestId('brand-save'));

    await waitFor(() => expect(catalogMock.updateBranding).toHaveBeenCalledTimes(1));
    const payload = catalogMock.updateBranding.mock.calls[0][0];
    expect(payload.mobileColumns).toBe(1);
    expect(payload).not.toHaveProperty('priceMode');
  });

  it('avisa que el catálogo no publica nada cuando el modo es mayorista y no hay productos con precio mayorista', async () => {
    catalogMock.getBranding.mockResolvedValue(
      envelope(branding({ priceMode: 'Wholesale', hasWholesalePricedProducts: false })),
    );

    renderView();

    expect(await screen.findByTestId('catalog-wholesale-warning')).toHaveTextContent(WARNING_TEXT);
    // Aviso de solo lectura: no hay ningún diálogo ni botón que "arregle" la configuración.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('no avisa cuando hay productos con precio mayorista', async () => {
    catalogMock.getBranding.mockResolvedValue(
      envelope(branding({ priceMode: 'Wholesale', hasWholesalePricedProducts: true })),
    );

    renderView();

    await screen.findByTestId('brand-price-mode-select');
    expect(screen.queryByTestId('catalog-wholesale-warning')).not.toBeInTheDocument();
  });

  it('no avisa en modo precio por unidad', async () => {
    renderView();

    await screen.findByTestId('brand-price-mode-select');
    expect(screen.queryByTestId('catalog-wholesale-warning')).not.toBeInTheDocument();
  });

  it('muestra el motivo que da el servidor cuando rechaza el modo mayorista', async () => {
    // El gate vive en el servidor: sin productos con precio mayorista el PUT responde 400, y ese
    // mensaje es el único que explica qué falta.
    const rejection = 'No se puede publicar el catálogo con precios mayoristas.';
    catalogMock.updateBranding.mockResolvedValue({
      data: null,
      succeeded: false as const,
      message: rejection,
      actionCode: 400,
      errors: [],
    });

    renderView();

    const select = await screen.findByTestId('brand-price-mode-select');
    fireEvent.change(select, { target: { value: 'Wholesale' } });
    fireEvent.click(screen.getByTestId('brand-save'));

    await waitFor(() =>
      expect(showBlockingErrorMock).toHaveBeenCalledWith(expect.anything(), rejection),
    );
    expect(showToastSuccessMock).not.toHaveBeenCalled();
  });

  it('muestra el motivo del backend cuando el rechazo llega como error HTTP (errors[0].description)', async () => {
    // Camino real: `apiClient` rechaza el 400, así que el texto NO viene en `result.message` sino en
    // `error.response.data.errors[0].description`. Sin este manejo la vista caía al genérico.
    const rejection =
      'Para cambiar el catálogo a precios mayoristas, primero sincronice los precios mayoristas.';
    catalogMock.updateBranding.mockRejectedValue({
      response: {
        status: 400,
        data: { errors: [{ code: 'App.Unexpected', description: rejection }] },
      },
    });

    renderView();

    const select = await screen.findByTestId('brand-price-mode-select');
    fireEvent.change(select, { target: { value: 'Wholesale' } });
    fireEvent.click(screen.getByTestId('brand-save'));

    await waitFor(() =>
      expect(showBlockingErrorMock).toHaveBeenCalledWith(expect.anything(), rejection),
    );
    expect(showToastSuccessMock).not.toHaveBeenCalled();
  });
});
