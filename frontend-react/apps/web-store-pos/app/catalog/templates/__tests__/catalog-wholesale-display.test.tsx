import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { CatalogTemplateProps } from '~/catalog/templates/catalog-template';
import { DefaultCatalogTemplate } from '~/catalog/templates/default-catalog';
import { BoutiqueCatalogTemplate } from '~/catalog/templates/boutique-catalog';
import type {
  PublicCatalog,
  PublicCatalogProduct,
  PublicOrderingConfig,
} from '~/sales/lib/services/catalog-http-service';

/**
 * Presentación en modo MAYORISTA (S1/S4) de las dos plantillas.
 *
 * Lo que se publica es el precio de UN PAQUETE —"la caja a $96"— y la unidad configurada, no el
 * precio por unidad que el servidor usa por dentro. Y el modo lo decide `priceMode` del producto:
 * los precios mayoristas viajan SIEMPRE (S3), así que un catálogo por unidad que los traiga no
 * puede empezar a pintar cajas.
 */

/** jsdom no trae `IntersectionObserver` y la plantilla `default` lo usa para el botón flotante. */
class NoopIntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: readonly number[] = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

const CATALOG: PublicCatalog = {
  storeId: 's1',
  storeName: 'Bodega Ana',
  storeSlug: 'bodega-ana',
  priceMode: 'Wholesale',
  categories: [{ id: 'c1', name: 'Bebidas', slug: 'bebidas', productsCount: 1 }],
};

/** Caja de 12: 8 por unidad desde 1 caja, o sea 96 por caja. */
const WHOLESALE_PRODUCT: PublicCatalogProduct = {
  id: 'cerveza',
  name: 'Cerveza',
  description: 'Caja de 12',
  price: 100,
  finalPrice: 82.5,
  hasDiscount: true,
  percentDiscountPrice: 12,
  percentDiscount: 12,
  discountPrice: 500,
  discountAmount: 5,
  isNew: false,
  currency: 'CUP',
  categoryId: 'c1',
  categoryName: 'Bebidas',
  categorySlug: 'bebidas',
  imageUrl: null,
  imageUrls: [],
  priceMode: 'Wholesale',
  wholesaleEnabled: true,
  wholesalePackSize: 12,
  wholesaleUnitLabel: 'caja',
  wholesaleMinPacks: 1,
  wholesaleUnitPrice: 8,
  wholesalePackPrice: 96,
  wholesaleTiers: [{ minPacks: 1, pricePerUnit: 8, packPrice: 96 }],
};

/**
 * Mismo producto con precios mayoristas pero PUBLICADO POR UNIDAD: es lo que llega en un catálogo
 * en modo `Unit`, porque el sync lleva los dos precios siempre.
 */
const UNIT_PRODUCT: PublicCatalogProduct = { ...WHOLESALE_PRODUCT, priceMode: 'Unit' };

const CONFIG: PublicOrderingConfig = {
  enabled: true,
  pickupEnabled: true,
  deliveryEnabled: false,
  pedidosWhatsAppEnabled: true,
  gestionPedidosEnabled: true,
  businessHours: null,
  deliveryZones: null,
  paletteId: 'default',
  templateId: 'default',
  mobileColumns: 2,
  logoUrl: null,
  bannerUrl: null,
  carouselImages: [],
  dailyImages: [],
};

function makeProps(product: PublicCatalogProduct): CatalogTemplateProps {
  return {
    storeSlug: 'bodega-ana',
    catalog: CATALOG,
    page: { items: [product], total: 1, page: 1, pageSize: 12 },
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
  };
}

function renderDefault(product: PublicCatalogProduct) {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <DefaultCatalogTemplate {...makeProps(product)} />
    </IntlProvider>,
  );
}

function renderBoutique(product: PublicCatalogProduct) {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <BoutiqueCatalogTemplate {...makeProps(product)} />
    </IntlProvider>,
  );
}

describe('Carta en modo mayorista — plantilla default', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', NoopIntersectionObserver);
  });

  it('publica el precio del PAQUETE y la unidad configurada, no el precio por unidad', () => {
    renderDefault(WHOLESALE_PRODUCT);

    const price = screen.getByTestId('catalog-card-price-cerveza');
    expect(price).toHaveTextContent(/96\s*CUP/);
    // El precio minorista (82.50) no es el número de esta tarjeta.
    expect(price).not.toHaveTextContent(/82\.50/);

    const note = screen.getByTestId('catalog-card-wholesale-cerveza');
    expect(note).toHaveTextContent('caja (12 x 8 CUP)');
    expect(note).toHaveTextContent('desde 1 cajas');
  });

  it('no anuncia el descuento minorista, que no se aplica sobre el precio mayorista', () => {
    renderDefault(WHOLESALE_PRODUCT);

    expect(screen.queryByTestId('catalog-badge-discount-cerveza')).not.toBeInTheDocument();
  });

  it('en modo unitario los precios mayoristas NO cambian la tarjeta', () => {
    renderDefault(UNIT_PRODUCT);

    const price = screen.getByTestId('catalog-card-price-cerveza');
    expect(price).toHaveTextContent(/82\.50\s*CUP/);
    expect(screen.queryByTestId('catalog-card-wholesale-cerveza')).not.toBeInTheDocument();
    expect(screen.getByTestId('catalog-badge-discount-cerveza')).toBeInTheDocument();
  });
});

describe('Carta en modo mayorista — plantilla boutique', () => {
  it('también publica el precio del paquete con su unidad y mínimo', () => {
    renderBoutique(WHOLESALE_PRODUCT);

    const card = screen.getByTestId('boutique-card-cerveza');
    expect(card).toHaveTextContent(/96\s*CUP/);
    expect(card).not.toHaveTextContent(/82\.50/);

    const note = screen.getByTestId('catalog-card-wholesale-cerveza');
    expect(note).toHaveTextContent('caja (12 x 8 CUP)');
    expect(note).toHaveTextContent('desde 1 cajas');
  });
});
