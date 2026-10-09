import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type {
  PublicCatalog,
  PublicCatalogProduct,
  PublicOrderingConfig,
} from '~/sales/lib/services/catalog-http-service';

const useParamsMock = vi.hoisted(() => vi.fn(() => ({ storeSlug: 'mi-tienda' })));

vi.mock('react-router', () => ({
  useParams: () => useParamsMock(),
}));

vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { user: null; isAuthenticated: boolean }) => unknown) =>
    selector({ user: null, isAuthenticated: false }),
}));

const catalogMock = vi.hoisted(() => ({
  getPublicCatalog: vi.fn(),
  getPublicProducts: vi.fn(),
  getPublicProduct: vi.fn(),
  getPublicOrderingConfig: vi.fn(),
  createPublicOrder: vi.fn(),
  getPublicOrderStatus: vi.fn(),
}));

vi.mock('~/sales/lib/services/catalog-http-service', async () => {
  const actual = await vi.importActual<
    typeof import('~/sales/lib/services/catalog-http-service')
  >('~/sales/lib/services/catalog-http-service');
  return { ...actual, catalogHttpService: { ...actual.catalogHttpService, ...catalogMock } };
});

vi.mock('~/shared/lib/toast', () => ({ showToastSuccess: vi.fn() }));

/**
 * jsdom no implementa `IntersectionObserver` y la plantilla `default` lo usa para el botón
 * "Ver Productos". Se sustituye por un doble inerte: a esta suite solo le importa QUÉ plantilla
 * se eligió, no el scroll.
 */
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

import { PublicCatalogPage } from '../public-catalog';

const envelope = <T,>(data: T) => ({ data, succeeded: true, message: '', actionCode: 200, errors: [] });

const CATALOG: PublicCatalog = {
  storeId: 's1',
  storeName: 'Moda Cubana',
  storeSlug: 'mi-tienda',
  categories: [{ id: 'c1', name: 'Ropa', slug: 'ropa', productsCount: 1 }],
};

const PRODUCT: PublicCatalogProduct = {
  id: 'cp1',
  name: 'Camisa azul',
  description: '',
  price: 100,
  finalPrice: 100,
  hasDiscount: false,
  percentDiscountPrice: 0,
  percentDiscount: 0,
  discountPrice: 0,
  discountAmount: 0,
  isNew: false,
  currency: 'CUP',
  categoryId: 'c1',
  categoryName: 'Ropa',
  categorySlug: 'ropa',
  imageUrl: null,
  imageUrls: [],
};

function config(templateId: string): PublicOrderingConfig {
  return {
    enabled: true,
    pickupEnabled: true,
    deliveryEnabled: false,
    deliveryFee: 0,
    minimumOrderAmount: 0,
    businessHours: null,
    deliveryZones: null,
    paletteId: 'default',
    templateId,
    logoUrl: null,
    bannerUrl: null,
    carouselImages: [],
    dailyImages: [],
  };
}

function renderPage() {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <PublicCatalogPage />
    </IntlProvider>,
  );
}

describe('PublicCatalogPage — selección de plantilla', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.IntersectionObserver =
      NoopIntersectionObserver as unknown as typeof IntersectionObserver;
    useParamsMock.mockReturnValue({ storeSlug: 'mi-tienda' });
    catalogMock.getPublicCatalog.mockResolvedValue(envelope(CATALOG));
    catalogMock.getPublicProducts.mockResolvedValue(
      envelope({ items: [PRODUCT], total: 1, page: 1, pageSize: 12 }),
    );
    catalogMock.getPublicProduct.mockResolvedValue(envelope(PRODUCT));
  });

  it('pinta la vista boutique cuando la tienda la eligió', async () => {
    catalogMock.getPublicOrderingConfig.mockResolvedValue(envelope(config('boutique')));
    renderPage();

    expect(await screen.findByTestId('boutique-grid')).toBeInTheDocument();
    expect(screen.getByTestId('boutique-categories')).toBeInTheDocument();
    expect(screen.queryByTestId('catalog-grid')).not.toBeInTheDocument();
    expect(screen.queryByTestId('catalog-nav')).not.toBeInTheDocument();
  });

  it('pinta la vista por defecto cuando la tienda la eligió', async () => {
    catalogMock.getPublicOrderingConfig.mockResolvedValue(envelope(config('default')));
    renderPage();

    expect(await screen.findByTestId('catalog-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('boutique-grid')).not.toBeInTheDocument();
  });

  it('cae a la vista por defecto con un id desconocido', async () => {
    catalogMock.getPublicOrderingConfig.mockResolvedValue(envelope(config('no-existe')));
    renderPage();

    expect(await screen.findByTestId('catalog-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('boutique-grid')).not.toBeInTheDocument();
  });
});
