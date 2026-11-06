import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type {
  PublicCatalog,
  PublicCatalogProduct,
  PublicOrderingConfig,
} from '~/sales/lib/services/catalog-http-service';

/**
 * DETALLE de un producto en modo MAYORISTA (R3-DETAIL-MODAL-UNPROVED, S1/S4).
 *
 * La ficha es donde el cliente decide, y en modo mayorista el número que compra es el del PAQUETE
 * ("la caja a $X"), no el precio por unidad que el servidor usa por dentro. Por eso el modal:
 *   - publica el precio del paquete,
 *   - NO anuncia el descuento minorista ni tacha el precio de lista (no son alternativas a ese
 *     precio: el descuento no se aplica encima del mayorista),
 *   - y dice la unidad, el tamaño del bulto y el mínimo vendible, que es lo que hace falta para
 *     pedir.
 *
 * Se consulta por ROL y nombre accesible: el modal es un diálogo con el nombre del producto y su
 * contenido es lo que el cliente lee, no una etiqueta `data-testid`.
 */

vi.mock('react-router', () => ({
  useParams: () => ({ storeSlug: 'mi-tienda' }),
}));

vi.mock('~/shared/lib/stores/auth-store', () => ({
  // La ruta es pública: el visitante anónimo es el caso normal de esta vista.
  useAuthStore: (selector: (state: { user: null; isAuthenticated: boolean }) => unknown) =>
    selector({ user: null, isAuthenticated: false }),
}));

const catalogMock = vi.hoisted(() => ({
  getPublicCatalog: vi.fn(),
  getPublicProducts: vi.fn(),
  getPublicProduct: vi.fn(),
  getPublicOrderingConfig: vi.fn(),
}));

vi.mock('~/sales/lib/services/catalog-http-service', async () => {
  const actual = await vi.importActual<
    typeof import('~/sales/lib/services/catalog-http-service')
  >('~/sales/lib/services/catalog-http-service');
  return { ...actual, catalogHttpService: { ...actual.catalogHttpService, ...catalogMock } };
});

vi.mock('~/catalog/lib/catalog-telemetry', () => ({
  trackCatalogEvent: vi.fn(),
}));

vi.mock('~/shared/lib/toast', () => ({
  showToastSuccess: vi.fn(),
}));

/** jsdom no implementa `IntersectionObserver` y la plantilla `default` lo usa. */
class NoopIntersectionObserver implements IntersectionObserver {
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

import { PublicCatalogPage } from '~/catalog/routes/public-catalog';

const envelope = <T,>(data: T) => ({
  data,
  succeeded: true,
  message: '',
  actionCode: 200,
  errors: [],
});

const CATALOG: PublicCatalog = {
  storeId: 's1',
  storeName: 'Bodega Ana',
  storeSlug: 'mi-tienda',
  priceMode: 'Wholesale',
  categories: [{ id: 'c1', name: 'Bebidas', slug: 'bebidas', productsCount: 1 }],
};

const CONFIG: PublicOrderingConfig = {
  enabled: true,
  pickupEnabled: true,
  deliveryEnabled: false,
  businessHours: null,
  deliveryZones: null,
  paletteId: 'default',
  templateId: 'default',
  mobileColumns: 2,
  logoUrl: null,
  bannerUrl: null,
  pedidosWhatsAppEnabled: true,
  gestionPedidosEnabled: true,
  carouselImages: [],
  dailyImages: [],
};

/** Caja de 12 a 32 por unidad desde 3 cajas: 100 de lista, 82.50 final con el 17.5 % de descuento. */
function makeProduct(overrides: Partial<PublicCatalogProduct> = {}): PublicCatalogProduct {
  return {
    id: 'cerveza',
    name: 'Cerveza',
    description: 'Caja de 12 botellas',
    price: 100,
    finalPrice: 82.5,
    hasDiscount: true,
    percentDiscountPrice: 1750,
    percentDiscount: 17.5,
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
    wholesaleMinPacks: 3,
    wholesaleUnitPrice: 32,
    wholesalePackPrice: 384,
    wholesaleTiers: [{ minPacks: 3, pricePerUnit: 32, packPrice: 384 }],
    ...overrides,
  };
}

function renderPage() {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <PublicCatalogPage />
    </IntlProvider>,
  );
}

/**
 * Abre la ficha desde la tarjeta y devuelve el diálogo ya montado.
 *
 * `cardName` se pasa cuando la tarjeta no EMPIEZA por el nombre: con descuento, el primer trozo del
 * nombre accesible es el badge ("-17,5 %"), así que buscar `^Cerveza` no la encuentra. Se sigue
 * consultando por ROL y nombre accesible; lo único que cambia es qué parte del nombre se ancla.
 */
async function openDetail(name: string, cardName: RegExp = new RegExp(`^${name}`)) {
  // La carta carga catálogo, config y lista en viajes encadenados: se espera a la cabecera antes de
  // buscar la tarjeta, y se da margen porque la rejilla llega un viaje después.
  renderPage();
  await screen.findByText('Bodega Ana');
  fireEvent.click(await screen.findByRole('button', { name: cardName }, { timeout: 5000 }));
  return within(await screen.findByRole('dialog', { name }, { timeout: 5000 }));
}

describe('detalle de producto en modo mayorista', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.IntersectionObserver =
      NoopIntersectionObserver as unknown as typeof IntersectionObserver;
    const product = makeProduct();
    catalogMock.getPublicCatalog.mockResolvedValue(envelope(CATALOG));
    catalogMock.getPublicProducts.mockResolvedValue(
      envelope({ items: [product], total: 1, page: 1, pageSize: 12 }),
    );
    catalogMock.getPublicProduct.mockResolvedValue(envelope(product));
    catalogMock.getPublicOrderingConfig.mockResolvedValue(envelope(CONFIG));
  });

  it('publica el precio del PAQUETE, no el precio final por unidad', async () => {
    const dialog = await openDetail('Cerveza');

    expect(dialog.getByText(/^384\sCUP$/)).toBeInTheDocument();
    // 82.50 es el precio por unidad con descuento: no es el número de la ficha en este modo.
    expect(dialog.queryByText(/^82\.50\sCUP$/)).not.toBeInTheDocument();
  });

  it('no anuncia el descuento minorista ni tacha el precio de lista', async () => {
    const dialog = await openDetail('Cerveza');

    // El descuento NO se aplica encima del precio mayorista, así que el badge sería una promesa
    // falsa; y el precio de lista tachado invitaría a comparar dos precios que no son alternativas.
    expect(dialog.queryByText(/^-17\.5%$/)).not.toBeInTheDocument();
    expect(dialog.queryByText(/^100\sCUP$/)).not.toBeInTheDocument();
  });

  it('dice la unidad, el tamaño del bulto y el mínimo vendible', async () => {
    const dialog = await openDetail('Cerveza');

    expect(dialog.getByText(/caja \(12\)/)).toBeInTheDocument();
    expect(dialog.getByText(/desde 3 cajas/)).toBeInTheDocument();
  });

  it('PRESERVE: en modo unitario la ficha sigue con el precio final, el tachado y el descuento', async () => {
    // Lo que el modo mayorista apaga tiene que seguir encendido fuera de él: si se apagara siempre,
    // el catálogo normal perdería su descuento.
    const product = makeProduct({ priceMode: 'Unit' });
    catalogMock.getPublicProducts.mockResolvedValue(
      envelope({ items: [product], total: 1, page: 1, pageSize: 12 }),
    );
    catalogMock.getPublicProduct.mockResolvedValue(envelope(product));

    const dialog = await openDetail('Cerveza', /Caja de 12 botellas/);
    expect(dialog.getByText(/^82\.50\sCUP$/)).toBeInTheDocument();
    expect(dialog.getByText(/^100\sCUP$/)).toBeInTheDocument();
    expect(dialog.getByText(/^-17\.5%$/)).toBeInTheDocument();
    expect(dialog.queryByText(/caja \(12\)/)).not.toBeInTheDocument();
  });
});
