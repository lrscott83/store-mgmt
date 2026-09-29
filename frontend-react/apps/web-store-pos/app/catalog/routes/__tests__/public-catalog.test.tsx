import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type {
  PublicCatalog,
  PublicCatalogProduct,
} from '~/sales/lib/services/catalog-http-service';

vi.mock('react-router', () => ({
  useParams: () => ({ storeSlug: 'mi-tienda' }),
}));

const catalogMock = vi.hoisted(() => ({
  getPublicCatalog: vi.fn(),
  getPublicProducts: vi.fn(),
  getPublicProduct: vi.fn(),
}));

vi.mock('~/sales/lib/services/catalog-http-service', () => ({
  catalogHttpService: catalogMock,
}));

import { PublicCatalogPage } from '../public-catalog';

const envelope = <T,>(data: T) => ({ data, succeeded: true, message: '', actionCode: 200, errors: [] });

const CATALOG: PublicCatalog = {
  storeId: 's1',
  storeName: 'Moda Cubana',
  storeSlug: 'mi-tienda',
  categories: [
    { id: 'c1', name: 'Ropa', slug: 'ropa', productsCount: 2 },
    { id: 'c2', name: 'Calzado', slug: 'calzado', productsCount: 0 },
  ],
};

function makeProduct(overrides: Partial<PublicCatalogProduct> = {}): PublicCatalogProduct {
  return {
    id: 'cp1',
    name: 'Camisa azul',
    description: 'Primera línea\nSegunda línea',
    price: 100,
    finalPrice: 82.5,
    hasDiscount: true,
    percentDiscountPrice: 1250,
    percentDiscount: 12.5,
    discountPrice: 500,
    discountAmount: 5,
    isNew: true,
    currency: 'CUP',
    categoryId: 'c1',
    categoryName: 'Ropa',
    categorySlug: 'ropa',
    imageUrl: '/api/v1/public/catalog/mi-tienda/media/t/s/p/a.jpg',
    imageUrls: [
      '/api/v1/public/catalog/mi-tienda/media/t/s/p/a.jpg',
      '/api/v1/public/catalog/mi-tienda/media/t/s/p/b.jpg',
    ],
    ...overrides,
  };
}

const page = (items: PublicCatalogProduct[], total = items.length) => ({
  items,
  total,
  page: 1,
  pageSize: 12,
});

function renderPage() {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <PublicCatalogPage />
    </IntlProvider>,
  );
}

describe('PublicCatalogPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    catalogMock.getPublicCatalog.mockResolvedValue(envelope(CATALOG));
    catalogMock.getPublicProducts.mockResolvedValue(envelope(page([makeProduct()])));
    catalogMock.getPublicProduct.mockResolvedValue(envelope(makeProduct()));
  });

  it('muestra la tienda, los filtros y el conteo de resultados', async () => {
    renderPage();

    expect(await screen.findByTestId('catalog-store-name')).toHaveTextContent('Moda Cubana');
    // El conteo llega con la lista, un viaje después de la cabecera.
    await waitFor(() =>
      expect(screen.getByTestId('catalog-results-count')).toHaveTextContent('1 producto'),
    );
    expect(catalogMock.getPublicProducts).toHaveBeenCalledWith('mi-tienda', {
      categorySlug: undefined,
      search: undefined,
      page: 1,
      pageSize: 12,
    });

    const select = screen.getByTestId('catalog-category-select');
    expect(within(select).getByText('Todas las categorías')).toBeInTheDocument();
    expect(within(select).getByText('Ropa (2)')).toBeInTheDocument();
  });

  it('pinta la tarjeta con el precio final combinado, el original tachado y los badges', async () => {
    renderPage();

    const card = await screen.findByTestId('catalog-card-cp1');
    expect(within(card).getByText('Camisa azul')).toBeInTheDocument();
    // Moneda como CÓDIGO (CUP), nunca el símbolo $ (el NBSP del formato se matchea con \s).
    expect(within(card).getByText(/82\.50\s*CUP/)).toBeInTheDocument();
    expect(within(card).getByText(/100\s*CUP/)).toBeInTheDocument();
    expect(screen.getByTestId('catalog-badge-new-cp1')).toHaveTextContent('Nuevo');
    expect(screen.getByTestId('catalog-badge-discount-cp1')).toHaveTextContent('-12.5%');
  });

  it('abre el detalle con la descripción en texto plano y la galería', async () => {
    const product = makeProduct({
      description: 'Camisa con <b>etiquetas</b>\nSegunda línea',
    });
    catalogMock.getPublicProducts.mockResolvedValue(envelope(page([product])));
    catalogMock.getPublicProduct.mockResolvedValue(envelope(product));
    renderPage();

    fireEvent.click(await screen.findByTestId('catalog-card-cp1'));

    const modal = await screen.findByTestId('catalog-detail-modal');
    expect(within(modal).getByTestId('catalog-detail-description')).toHaveTextContent(
      'Camisa con <b>etiquetas</b>',
    );
    // Texto plano: nada se interpreta como HTML (decisión D9).
    expect(within(modal).queryByRole('strong')).not.toBeInTheDocument();
    expect(catalogMock.getPublicProduct).toHaveBeenCalledWith('mi-tienda', 'cp1');

    // La galería cambia la imagen mostrada al pulsar una miniatura.
    fireEvent.click(within(modal).getByTestId('catalog-detail-thumb-1'));
    // Las rutas del backend se resuelven contra el origen de la API (mismo origen aquí).
    expect(screen.getByTestId('catalog-detail-image')).toHaveAttribute(
      'src',
      `${window.location.origin}/api/v1/public/catalog/mi-tienda/media/t/s/p/b.jpg`,
    );
  });

  it('filtra por categoría y vuelve a la primera página', async () => {
    renderPage();
    await screen.findByTestId('catalog-card-cp1');

    fireEvent.change(screen.getByTestId('catalog-category-select'), {
      target: { value: 'ropa' },
    });

    await waitFor(() =>
      expect(catalogMock.getPublicProducts).toHaveBeenLastCalledWith('mi-tienda', {
        categorySlug: 'ropa',
        search: undefined,
        page: 1,
        pageSize: 12,
      }),
    );
  });

  it('busca por nombre al enviar el formulario', async () => {
    renderPage();
    await screen.findByTestId('catalog-card-cp1');

    fireEvent.change(screen.getByTestId('catalog-search-input'), {
      target: { value: '  camisa  ' },
    });
    fireEvent.submit(screen.getByTestId('catalog-search-button').closest('form')!);

    await waitFor(() =>
      expect(catalogMock.getPublicProducts).toHaveBeenLastCalledWith('mi-tienda', {
        categorySlug: undefined,
        search: 'camisa',
        page: 1,
        pageSize: 12,
      }),
    );
  });

  it('muestra el aviso cuando no hay resultados', async () => {
    catalogMock.getPublicProducts.mockResolvedValue(envelope(page([], 0)));
    renderPage();

    expect(
      await screen.findByText('No hay productos que coincidan con tu búsqueda.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('catalog-card-cp1')).not.toBeInTheDocument();
  });

  it('pagina cuando hay más resultados que el tamaño de página', async () => {
    catalogMock.getPublicProducts.mockResolvedValue(envelope({ ...page([makeProduct()], 25) }));
    renderPage();

    expect(await screen.findByTestId('catalog-page-indicator')).toHaveTextContent(
      'Página 1 de 3',
    );
    fireEvent.click(screen.getByTestId('catalog-next-page'));

    await waitFor(() =>
      expect(catalogMock.getPublicProducts).toHaveBeenLastCalledWith('mi-tienda', {
        categorySlug: undefined,
        search: undefined,
        page: 2,
        pageSize: 12,
      }),
    );
  });

  it('un slug inexistente muestra el estado de catálogo no disponible', async () => {
    catalogMock.getPublicCatalog.mockRejectedValue({ response: { status: 404 } });
    renderPage();

    expect(await screen.findByTestId('catalog-public-unavailable')).toHaveTextContent(
      'Catálogo no disponible',
    );
    expect(screen.queryByTestId('catalog-card-cp1')).not.toBeInTheDocument();
  });

  it('sin conexión lo dice, sin culpar al catálogo', async () => {
    catalogMock.getPublicCatalog.mockRejectedValue({ isNetworkError: true });
    renderPage();

    expect(await screen.findByTestId('catalog-public-unavailable')).toHaveTextContent(
      'Sin conexión. Se requiere conexión a internet.',
    );
  });
});
