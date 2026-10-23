import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { Currency } from '@store-mgmt/domain';

const importMock = vi.hoisted(() => vi.fn());

vi.mock('~/sales/lib/services/catalog-http-service', async () => {
  const actual = await vi.importActual<typeof import('~/sales/lib/services/catalog-http-service')>(
    '~/sales/lib/services/catalog-http-service',
  );
  return { ...actual, importCatalogCsv: importMock };
});

vi.mock('~/shared/lib/toast', () => ({ showToastSuccess: vi.fn() }));
vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: vi.fn(),
  confirmDialog: vi.fn(async () => true),
}));

import { CatalogCsvImportCard } from '../catalog-csv-import-card';

const CSV = [
  'categoria,producto,precio_venta,moneda_venta',
  'Bebidas,Café,2.50,USD',
  'Postres,Flan,3,CUP',
].join('\n');

/** Elige un archivo en el input oculto del `FileInput`, como haría el diálogo del sistema. */
function selectCsv(text: string) {
  const file = new File([text], 'productos.csv', { type: 'text/csv' });
  const input = screen.getByTestId('catalog-csv-import-file');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

function renderCard(onImported = vi.fn()) {
  render(
    <IntlProvider locale="es" messages={esMessages}>
      <CatalogCsvImportCard storeId="store-1" onImported={onImported} />
    </IntlProvider>,
  );
  return onImported;
}

describe('CatalogCsvImportCard — import CSV del catálogo (SuperAdmin)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    importMock.mockResolvedValue({
      succeeded: true,
      data: { categoriesCreated: 2, productsCreated: 2, productsUpdated: 0, rowsProcessed: 2 },
    });
  });

  it('parsea el CSV y envía las filas normalizadas a la tienda de la ruta', async () => {
    const onImported = renderCard();

    selectCsv(CSV);
    await waitFor(() =>
      expect(screen.getByTestId('catalog-csv-import-valid-rows')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId('catalog-csv-import-button'));

    await waitFor(() => expect(importMock).toHaveBeenCalledTimes(1));
    expect(importMock).toHaveBeenCalledWith('store-1', [
      { categoryName: 'Bebidas', productName: 'Café', price: 2.5, currency: Currency.USD },
      { categoryName: 'Postres', productName: 'Flan', price: 3, currency: Currency.CUP },
    ]);
    await waitFor(() => expect(onImported).toHaveBeenCalled());
    expect(await screen.findByTestId('catalog-csv-import-summary')).toBeInTheDocument();
  });

  it('muestra los errores de fila del parser y no deja importar', async () => {
    renderCard();

    selectCsv(['categoria,producto,precio_venta', 'Bebidas,,2.50'].join('\n'));

    await waitFor(() =>
      expect(
        screen.getByText(esMessages['PRODUCTS.CSV.ERROR_ROWS'].replace('{count}', '1')),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId('catalog-csv-import-button')).toBeDisabled();
  });

  it('un fallo del backend se muestra y no recarga', async () => {
    importMock.mockResolvedValue({ succeeded: false, data: null, errors: [] });
    const onImported = renderCard();

    selectCsv(CSV);
    await waitFor(() =>
      expect(screen.getByTestId('catalog-csv-import-valid-rows')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('catalog-csv-import-button'));

    await waitFor(() => expect(screen.getByTestId('catalog-csv-import-error')).toBeInTheDocument());
    expect(onImported).not.toHaveBeenCalled();
  });
});
