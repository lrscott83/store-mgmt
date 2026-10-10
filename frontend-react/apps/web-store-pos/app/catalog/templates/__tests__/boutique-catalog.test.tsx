import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { CatalogTemplateProps } from '~/catalog/templates/catalog-template';
import { BoutiqueCatalogTemplate } from '~/catalog/templates/boutique-catalog';
import type {
  PublicCatalog,
  PublicCatalogProduct,
  PublicOrderingConfig,
} from '~/sales/lib/services/catalog-http-service';

const CATALOG: PublicCatalog = {
  storeId: 's1',
  storeName: 'Moda Cubana',
  storeSlug: 'moda-cubana',
  categories: [
    { id: 'c1', name: 'Ropa', slug: 'ropa', productsCount: 2 },
    { id: 'c2', name: 'Calzado', slug: 'calzado', productsCount: 1 },
  ],
};

const PRODUCT: PublicCatalogProduct = {
  id: 'cp1',
  name: 'Camisa azul',
  description: 'Una camisa',
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
  imageUrl: null,
  imageUrls: [],
};

const CONFIG: PublicOrderingConfig = {
  enabled: true,
  pickupEnabled: true,
  deliveryEnabled: true,
  deliveryFee: 0,
  minimumOrderAmount: 0,
  businessHours: 'Lun-Vie 8:00-18:00',
  deliveryZones: null,
  paletteId: 'default',
  templateId: 'boutique',
  logoUrl: null,
  bannerUrl: null,
  carouselImages: [],
  dailyImages: [],
};

function makeProps(overrides: Partial<CatalogTemplateProps> = {}): CatalogTemplateProps {
  return {
    storeSlug: 'moda-cubana',
    catalog: CATALOG,
    page: { items: [PRODUCT], total: 1, page: 1, pageSize: 12 },
    total: 1,
    totalPages: 1,
    currentPage: 1,
    searchInput: '',
    categorySlug: '',
    listFailed: false,
    orderingConfig: CONFIG,
    orderingEnabled: true,
    logoUrl: null,
    carouselImages: [],
    dailyImages: [],
    cartCount: 0,
    onSearchInputChange: vi.fn(),
    onSearchSubmit: vi.fn(),
    onCategoryChange: vi.fn(),
    onPageChange: vi.fn(),
    onOpenDetail: vi.fn(),
    onAddToCart: vi.fn(),
    onOpenCart: vi.fn(),
    ...overrides,
  };
}

function renderTemplate(props: CatalogTemplateProps) {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <BoutiqueCatalogTemplate {...props} />
    </IntlProvider>,
  );
}

describe('BoutiqueCatalogTemplate', () => {
  it('pinta la marca como hero y la nota de entrega/horario', () => {
    renderTemplate(makeProps());

    expect(screen.getByTestId('catalog-store-name')).toHaveTextContent('Moda Cubana');
    const info = screen.getByTestId('boutique-store-info');
    expect(info).toHaveTextContent('Recogida en tienda');
    expect(info).toHaveTextContent('Envío a domicilio');
    expect(info).toHaveTextContent('Lun-Vie 8:00-18:00');
  });

  it('muestra las categorías como chips y no como un desplegable', () => {
    renderTemplate(makeProps());

    expect(screen.getByTestId('boutique-categories')).toBeInTheDocument();
    expect(screen.getByTestId('boutique-category-ropa')).toHaveTextContent('Ropa');
    expect(screen.queryByTestId('catalog-category-select')).not.toBeInTheDocument();
  });

  it('marca la categoría seleccionada con aria-pressed', () => {
    renderTemplate(makeProps({ categorySlug: 'ropa' }));

    expect(screen.getByTestId('boutique-category-ropa')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('boutique-category-all')).toHaveAttribute('aria-pressed', 'false');
  });

  it('al tocar un chip avisa al contenedor', () => {
    const props = makeProps();
    renderTemplate(props);

    fireEvent.click(screen.getByTestId('boutique-category-calzado'));

    expect(props.onCategoryChange).toHaveBeenCalledWith('calzado');
  });

  it('muestra el buscador y avisa al teclear', () => {
    const props = makeProps();
    renderTemplate(props);

    fireEvent.change(screen.getByTestId('catalog-search-input'), {
      target: { value: 'camisa' },
    });

    expect(props.onSearchInputChange).toHaveBeenCalledWith('camisa');
  });

  it('pinta el producto en la rejilla, abre el detalle y añade al carrito', () => {
    const props = makeProps();
    renderTemplate(props);

    expect(screen.getByTestId('boutique-grid')).toBeInTheDocument();
    expect(screen.getByTestId('boutique-card-cp1')).toHaveTextContent('Camisa azul');
    expect(screen.getByTestId('boutique-card-cp1')).toHaveTextContent(/82\.50\s*CUP/);

    fireEvent.click(screen.getByTestId('boutique-card-cp1').querySelector('button')!);
    expect(props.onOpenDetail).toHaveBeenCalledWith(PRODUCT);

    fireEvent.click(screen.getByTestId('catalog-add-cp1'));
    expect(props.onAddToCart).toHaveBeenCalledWith(PRODUCT);
  });

  it('no ofrece añadir ni carrito con la tienda cerrada', () => {
    renderTemplate(makeProps({ orderingConfig: { ...CONFIG, enabled: false }, orderingEnabled: false }));

    expect(screen.queryByTestId('catalog-add-cp1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('catalog-cart-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('catalog-orders-disabled')).toBeInTheDocument();
  });

  it('abre el carrito desde el botón de la esquina', () => {
    const props = makeProps();
    renderTemplate(props);

    fireEvent.click(screen.getByTestId('catalog-cart-button'));

    expect(props.onOpenCart).toHaveBeenCalledTimes(1);
  });

  it('muestra el conteo de resultados en singular y plural', () => {
    const { unmount } = renderTemplate(makeProps({ total: 1 }));
    expect(screen.getByTestId('catalog-results-count')).toHaveTextContent('1 producto');
    unmount();

    renderTemplate(makeProps({ total: 5 }));
    expect(screen.getByTestId('catalog-results-count')).toHaveTextContent('5 productos');
  });

  it('avisa de la lista fallida sin tumbar la vista', () => {
    renderTemplate(makeProps({ listFailed: true }));

    expect(screen.getByText(esMessages['GENERAL.OFFLINE'] as string)).toBeInTheDocument();
  });

  it('distingue catálogo vacío de búsqueda sin resultados', () => {
    const { unmount } = renderTemplate(
      makeProps({
        catalog: { ...CATALOG, categories: [] },
        page: { items: [], total: 0, page: 1, pageSize: 12 },
        total: 0,
      }),
    );
    // Sin categorías: la tienda todavía no publicó nada.
    expect(screen.getByText(esMessages['CATALOG_PUBLIC.EMPTY_CATALOG'] as string)).toBeInTheDocument();
    unmount();

    renderTemplate(makeProps({ page: { items: [], total: 0, page: 1, pageSize: 12 }, total: 0 }));
    // Con categorías pero sin coincidencias: es la búsqueda/filtro.
    expect(screen.getByText(esMessages['CATALOG_PUBLIC.EMPTY'] as string)).toBeInTheDocument();
  });

  it('pagina: anterior deshabilitado en la primera página y siguiente avisa', () => {
    const props = makeProps({
      page: { items: [PRODUCT], total: 25, page: 1, pageSize: 12 },
      total: 25,
      totalPages: 3,
      currentPage: 1,
    });
    renderTemplate(props);

    expect(screen.getByTestId('catalog-previous-page')).toBeDisabled();
    expect(screen.getByTestId('catalog-next-page')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('catalog-next-page'));

    expect(props.onPageChange).toHaveBeenCalledWith(2);
  });

  it('pagina: siguiente deshabilitado en la última página y anterior avisa', () => {
    const props = makeProps({
      page: { items: [PRODUCT], total: 25, page: 3, pageSize: 12 },
      total: 25,
      totalPages: 3,
      currentPage: 3,
    });
    renderTemplate(props);

    expect(screen.getByTestId('catalog-next-page')).toBeDisabled();

    fireEvent.click(screen.getByTestId('catalog-previous-page'));

    expect(props.onPageChange).toHaveBeenCalledWith(2);
  });

  it('no pinta paginación con una sola página', () => {
    renderTemplate(makeProps({ total: 1, totalPages: 1 }));

    expect(screen.queryByTestId('catalog-previous-page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('catalog-next-page')).not.toBeInTheDocument();
  });
});
