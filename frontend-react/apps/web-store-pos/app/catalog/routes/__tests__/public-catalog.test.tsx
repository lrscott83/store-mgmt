import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { useStorefrontCartStore } from '~/catalog/lib/storefront-cart-store';
import { useCartStore } from '~/shared/lib/stores/cart-store';
import type { UserModel } from '@store-mgmt/domain';
import type {
  PublicCatalog,
  PublicCatalogProduct,
  PublicOrderingConfig,
  PublicShowcaseImage,
} from '~/sales/lib/services/catalog-http-service';

// El slug cambia a mitad de la suite para probar el AISLAMIENTO por tienda del carrito del
// storefront, así que el mock es mutable en vez de fijo.
const useParamsMock = vi.hoisted(() => vi.fn(() => ({ storeSlug: 'mi-tienda' })));

vi.mock('react-router', () => ({
  useParams: () => useParamsMock(),
}));

// La página decide el modo staff leyendo la sesión, así que el store se sustituye por un estado
// MUTABLE: por defecto anónimo —que es lo que ve el resto de esta suite, porque la ruta es
// pública— y `setSession` introduce a un staff concreto para probar el cableado. El store real
// ejecuta `initialize()` al importarse (y con él un `/me` de fondo), así que aquí no se deja
// entrar: lo que se prueba aquí es la página, no la hidratación.
const session = vi.hoisted(() => ({ current: null as UserModel | null }));

vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = vi.fn(
    (selector: (state: { user: UserModel | null; isAuthenticated: boolean }) => unknown) =>
      selector({ user: session.current, isAuthenticated: session.current !== null }),
  );
  return { useAuthStore };
});

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

/**
 * Config anónimo de pedidos: sin marca por defecto (una tienda puede no tener logo/banner) y sin
 * costo de envío ni importe mínimo —no existen— y sin `whatsappNumber` (privacidad, T2).
 */
const CONFIG_WITHOUT_BRAND: PublicOrderingConfig = {
  enabled: true,
  pickupEnabled: true,
  deliveryEnabled: true,
  businessHours: null,
  deliveryZones: null,
  paletteId: 'default',
  logoUrl: null,
  bannerUrl: null,
  // El showcase viaja SIEMPRE, y vacío es lo normal: una tienda recién sincronizada no ha
  // subido ninguna imagen. Los dos conjuntos son independientes (decisión C1).
  carouselImages: [],
  dailyImages: [],
};

function renderPage() {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <PublicCatalogPage />
    </IntlProvider>,
  );
}

/** Sesión de `/me` reducida a lo que la regla de elegibilidad mira. */
function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    login: 'ana@tienda.cu',
    authToken: 'tok',
    refreshToken: 'ref',
    expiresIn: Date.now() + 3_600_000,
    id: 'u1',
    fullName: 'Ana Pérez',
    cellPhone: '5351234567',
    email: 'ana@tienda.cu',
    isActive: true,
    password: '',
    roles: [],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: '',
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'AlDia',
    ...overrides,
  };
}

describe('PublicCatalogPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // La ruta es pública: sin sesión salvo que un test la ponga.
    session.current = null;
    useParamsMock.mockReturnValue({ storeSlug: 'mi-tienda' });
    catalogMock.getPublicCatalog.mockResolvedValue(envelope(CATALOG));
    catalogMock.getPublicProducts.mockResolvedValue(envelope(page([makeProduct()])));
    catalogMock.getPublicProduct.mockResolvedValue(envelope(makeProduct()));
    catalogMock.getPublicOrderingConfig.mockResolvedValue(envelope(CONFIG_WITHOUT_BRAND));
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

  it('la tarjeta recorta la descripción a 3 líneas y la omite si está vacía', async () => {
    const long = 'Línea uno\nLínea dos\nLínea tres\nLínea cuatro\nLínea cinco';
    const withDescription = makeProduct({ description: long });
    const withoutDescription = makeProduct({ id: 'cp2', description: '' });
    catalogMock.getPublicProducts.mockResolvedValue(envelope(page([withDescription, withoutDescription])));
    renderPage();

    // La descripción va DEBAJO, recortada a 3 líneas (con puntos suspensivos al desbordar) para
    // que el precio no quede fuera de la vista rápida.
    const clamped = await screen.findByTestId('catalog-card-description-cp1');
    expect(clamped).toHaveClass('line-clamp-3');
    expect(clamped).toHaveTextContent('Línea uno');
    // Un producto sin descripción no deja un párrafo vacío ocupando espacio.
    expect(screen.queryByTestId('catalog-card-description-cp2')).not.toBeInTheDocument();
  });

  it('dos columnas ya en móvil y nombre y precio apilados a la izquierda, sin solaparse', async () => {
    renderPage();

    // Dos columnas DESDE MÓVIL (no desde sm): con una sola columna la tarjeta era ancha y
    // el problema no se veía; al partir en dos, la tarjeta se estrecha a la mitad.
    // `grid-cols-2` sin prefijo es lo que las da en móvil; `lg:grid-cols-3` las sube a tres
    // en escritorio. No debe haber ninguna clase que las baje a 1 en móvil.
    const grid = await screen.findByTestId('catalog-grid');
    expect(grid).toHaveClass('grid-cols-2');
    expect(grid).toHaveClass('lg:grid-cols-3');
    expect(grid.className).not.toMatch(/(^|\s)grid-cols-1(\s|$)/);

    // Todo se espera con findBy, nunca con getBy: bajo carga de la suite completa el render
    // puede tardar mas que un getBy sincronico, y el fallo era un falso rojo de timing.
    const card = await screen.findByTestId('catalog-card-cp1');
    const stacked = await within(card).findByTestId('catalog-card-pricing-cp1');

    // Apilados (columna) y no repartidos: en una tarjeta estrecha el reparto horizontal
    // hace que el nombre, que puede encogerse por debajo de su contenido, se salga de su
    // caja y PINTE ENCIMA del precio, que es shrink-0 y nunca cede espacio.
    expect(stacked).toHaveClass('flex-col');
    expect(stacked).not.toHaveClass('justify-between');

    // Y el precio se alinea a la izquierda, no a la derecha.
    const price = await within(stacked).findByTestId('catalog-card-price-cp1');
    expect(price).toHaveClass('text-left');

    // El nombre tiene que poder partirse: sin esto, un nombre largo sin espacios vuelve a
    // desbordar su caja aunque el precio ya no compita por el espacio.
    expect(within(card).getByRole('heading', { level: 3 })).toHaveClass('break-words');
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

  it('el popup no cae a la galería cuando el producto no tiene imagen principal', async () => {
    // La imagen tiene UNA sola fuente (imageUrl). Con null, el popup NO puede tomar imageUrls[0]:
    // así salía la foto fantasma de la imagen que la vista ya había borrado.
    const product = makeProduct({
      imageUrl: null,
      imageUrls: [
        '/api/v1/public/catalog/mi-tienda/media/t/s/p/a.jpg',
        '/api/v1/public/catalog/mi-tienda/media/t/s/p/b.jpg',
      ],
    });
    catalogMock.getPublicProducts.mockResolvedValue(envelope(page([product])));
    catalogMock.getPublicProduct.mockResolvedValue(envelope(product));
    renderPage();

    fireEvent.click(await screen.findByTestId('catalog-card-cp1'));

    const modal = await screen.findByTestId('catalog-detail-modal');
    // El detalle del servidor ya llegó (el mock resuelve al vuelo).
    await waitFor(() =>
      expect(within(modal).getByTestId('catalog-detail-description')).toBeInTheDocument(),
    );
    expect(within(modal).queryByTestId('catalog-detail-image')).not.toBeInTheDocument();
    expect(within(modal).getByText('Este producto no tiene imágenes.')).toBeInTheDocument();
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

  // ── MARCA (F8): logo y banner de la carta pública ─────────────────────────────────
  describe('marca del catálogo público', () => {
    it('pinta el logo junto al nombre y el banner sobre la cabecera', async () => {
      catalogMock.getPublicOrderingConfig.mockResolvedValue(
        envelope({
          ...CONFIG_WITHOUT_BRAND,
          logoUrl: '/api/v1/public/catalog/mi-tienda/media/t/s/branding/logo.png',
          bannerUrl: '/api/v1/public/catalog/mi-tienda/media/t/s/branding/banner.png',
        }),
      );
      renderPage();

      // Las rutas del backend se resuelven contra el origen de la API (mismo origen aquí).
      expect(await screen.findByTestId('catalog-logo')).toHaveAttribute(
        'src',
        `${window.location.origin}/api/v1/public/catalog/mi-tienda/media/t/s/branding/logo.png`,
      );
      expect(screen.getByTestId('catalog-banner')).toHaveAttribute(
        'src',
        `${window.location.origin}/api/v1/public/catalog/mi-tienda/media/t/s/branding/banner.png`,
      );
      // El texto alternativo NOMBRA la imagen y la tienda, no repite el rótulo del campo:
      // un lector de pantalla tiene que oír de quién es el logo que no ve.
      expect(screen.getByTestId('catalog-logo')).toHaveAttribute('alt', 'Logo de Moda Cubana');
      expect(screen.getByTestId('catalog-banner')).toHaveAttribute(
        'alt',
        'Banner de Moda Cubana',
      );
      expect(catalogMock.getPublicOrderingConfig).toHaveBeenCalledWith('mi-tienda');
      // El logo acompaña al nombre: sigue siendo el título de la carta.
      expect(screen.getByTestId('catalog-store-name')).toHaveTextContent('Moda Cubana');
    });

    it('sin marca no pinta ni logo ni banner, y la carta es la de siempre', async () => {
      renderPage();

      expect(await screen.findByTestId('catalog-store-name')).toBeInTheDocument();
      expect(screen.queryByTestId('catalog-logo')).not.toBeInTheDocument();
      expect(screen.queryByTestId('catalog-banner')).not.toBeInTheDocument();
      // Y el catálogo sigue entero: la marca es un plus, no su condición.
      expect(screen.getByTestId('catalog-grid')).toBeInTheDocument();
    });

    it('solo logo o solo banner: cada lado es independiente', async () => {
      catalogMock.getPublicOrderingConfig.mockResolvedValue(
        envelope({
          ...CONFIG_WITHOUT_BRAND,
          logoUrl: '/api/v1/public/catalog/mi-tienda/media/t/s/branding/logo.png',
        }),
      );
      renderPage();

      expect(await screen.findByTestId('catalog-logo')).toBeInTheDocument();
      expect(screen.queryByTestId('catalog-banner')).not.toBeInTheDocument();
    });

    it('si el config anónimo falla la carta se publica igual, sin marca', async () => {
      // La marca es opcional: este endpoint puede no existir todavía para una tienda, y eso NO
      // significa que el catálogo no exista. La página no puede caer por esto.
      catalogMock.getPublicOrderingConfig.mockRejectedValue({ response: { status: 500 } });
      renderPage();

      expect(await screen.findByTestId('catalog-store-name')).toHaveTextContent('Moda Cubana');
      expect(await screen.findByTestId('catalog-card-cp1')).toBeInTheDocument();
      expect(screen.queryByTestId('catalog-logo')).not.toBeInTheDocument();
      expect(screen.queryByTestId('catalog-banner')).not.toBeInTheDocument();
      expect(screen.queryByTestId('catalog-public-unavailable')).not.toBeInTheDocument();
    });

    it('si el config falla tampoco hay carrito: la carta se publica sin pedidos', async () => {
      // Sin config no se sabe si la tienda acepta pedidos, y ofrecer un carrito que el backend
      // va a rechazar sería una trampa. El catálogo entero sigue ahí.
      catalogMock.getPublicOrderingConfig.mockRejectedValue({ response: { status: 500 } });
      renderPage();

      expect(await screen.findByTestId('catalog-card-cp1')).toBeInTheDocument();
      expect(screen.queryByTestId('catalog-cart-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('catalog-add-cp1')).not.toBeInTheDocument();
    });
  });

  // ── SHOWCASE DE LA CARTA: carrusel de portada, botón "Ver productos" y destacados ────────
  describe('showcase de la carta pública', () => {
    const MEDIA = '/api/v1/public/catalog/mi-tienda/media/t/s/showcase';

    const CAROUSEL: PublicShowcaseImage[] = [
      { url: `${MEDIA}/a.jpg`, caption: 'Menú de la casa' },
      // Sin pie de foto: la imagen se tiene que ver igual, y su texto alternativo cae al
      // nombre de la tienda.
      { url: `${MEDIA}/b.jpg`, caption: null },
    ];

    const DAILY: PublicShowcaseImage[] = [
      { url: `${MEDIA}/d1.jpg`, caption: 'Plato del día' },
      { url: `${MEDIA}/d2.jpg`, caption: null },
    ];

    const showcaseConfig = (config: {
      carouselImages?: PublicShowcaseImage[];
      dailyImages?: PublicShowcaseImage[];
    }): PublicOrderingConfig => ({
      ...CONFIG_WITHOUT_BRAND,
      ...config,
    });

    let scrolledFrom: Element[] = [];
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const originalMatchMedia = window.matchMedia;

    beforeEach(() => {
      // jsdom NO implementa `scrollIntoView`: sin este sustituto el clic del botón flotante
      // revienta con un TypeError y el test moriría por el motivo equivocado.
      scrolledFrom = [];
      Element.prototype.scrollIntoView = function recordScroll(this: Element) {
        scrolledFrom.push(this);
      };
    });

    afterEach(() => {
      Element.prototype.scrollIntoView = originalScrollIntoView;
      window.matchMedia = originalMatchMedia;
      vi.useRealTimers();
    });

    it('con imágenes de carrusel pinta la portada con pie de foto y controles', async () => {
      catalogMock.getPublicOrderingConfig.mockResolvedValue(
        envelope(showcaseConfig({ carouselImages: CAROUSEL })),
      );
      renderPage();

      const carousel = await screen.findByTestId('catalog-carousel');
      // Las rutas del backend se resuelven contra el origen de la API (mismo origen aquí).
      expect(within(carousel).getByTestId('catalog-carousel-image-0')).toHaveAttribute(
        'src',
        `${window.location.origin}${MEDIA}/a.jpg`,
      );
      expect(within(carousel).getByTestId('catalog-carousel-caption-0')).toHaveTextContent(
        'Menú de la casa',
      );
      // Sin pie de foto no hay párrafo de caption, pero la imagen se sigue viendo.
      expect(within(carousel).queryByTestId('catalog-carousel-caption-1')).not.toBeInTheDocument();
      expect(within(carousel).getByTestId('catalog-carousel-image-1')).toBeInTheDocument();
      // El texto alternativo NO es un adorno: con pie de foto describe la foto; sin él cae al
      // nombre de la tienda, que es lo único que se sabe de ella. Nunca vacío: una imagen sin
      // `alt` es un nombre de archivo leído en voz alta.
      expect(within(carousel).getByTestId('catalog-carousel-image-0')).toHaveAttribute(
        'alt',
        'Menú de la casa',
      );
      expect(within(carousel).getByTestId('catalog-carousel-image-1')).toHaveAttribute(
        'alt',
        'Moda Cubana',
      );

      // Un punto por imagen, y solo el primero marcado como actual.
      expect(within(carousel).getByTestId('catalog-carousel-dot-0')).toHaveAttribute(
        'aria-current',
        'true',
      );
      expect(within(carousel).getByTestId('catalog-carousel-dot-1')).toHaveAttribute(
        'aria-current',
        'false',
      );
      // Las flechas se nombran por IMAGEN, no por página: para un lector de pantalla
      // "Anterior" a secas no dice si cambia de producto o de foto.
      expect(within(carousel).getByTestId('catalog-carousel-previous')).toHaveAttribute(
        'aria-label',
        'Imagen anterior',
      );
      expect(within(carousel).getByTestId('catalog-carousel-next')).toHaveAttribute(
        'aria-label',
        'Imagen siguiente',
      );
    });

    it('el carrusel solo aparece con imágenes: con el conjunto vacío no hay ni un marco', async () => {
      renderPage();

      await screen.findByTestId('catalog-card-cp1');
      expect(screen.queryByTestId('catalog-carousel')).not.toBeInTheDocument();
    });

    it('con imágenes del día pinta el bloque de destacados con sus pies de foto', async () => {
      catalogMock.getPublicOrderingConfig.mockResolvedValue(
        envelope(showcaseConfig({ dailyImages: DAILY })),
      );
      renderPage();

      const daily = await screen.findByTestId('catalog-daily');
      expect(within(daily).getByText('Destacados de hoy')).toBeInTheDocument();
      expect(within(daily).getByTestId('catalog-daily-image-0')).toHaveAttribute(
        'src',
        `${window.location.origin}${MEDIA}/d1.jpg`,
      );
      expect(within(daily).getByTestId('catalog-daily-caption-0')).toHaveTextContent(
        'Plato del día',
      );
      expect(within(daily).queryByTestId('catalog-daily-caption-1')).not.toBeInTheDocument();
      // Misma regla de texto alternativo que el carrusel: el pie describe la foto y, si no hay,
      // se nombra la tienda. Sin esto el bloque de destacados sería un-gallery muda.
      expect(within(daily).getByTestId('catalog-daily-image-0')).toHaveAttribute(
        'alt',
        'Plato del día',
      );
      expect(within(daily).getByTestId('catalog-daily-image-1')).toHaveAttribute(
        'alt',
        'Moda Cubana',
      );
    });

    it('el bloque de destacados solo aparece con imágenes', async () => {
      renderPage();

      await screen.findByTestId('catalog-card-cp1');
      expect(screen.queryByTestId('catalog-daily')).not.toBeInTheDocument();
    });

    it('los dos conjuntos son independientes: el carrusel no implica los destacados', async () => {
      catalogMock.getPublicOrderingConfig.mockResolvedValue(
        envelope(showcaseConfig({ carouselImages: CAROUSEL })),
      );
      renderPage();

      expect(await screen.findByTestId('catalog-carousel')).toBeInTheDocument();
      expect(screen.queryByTestId('catalog-daily')).not.toBeInTheDocument();
    });

    it('sin ninguna imagen del showcase la carta es exactamente la de antes', async () => {
      renderPage();

      // Nada nuevo: ni portada ni vitrina, y el catálogo entero en su sitio.
      expect(await screen.findByTestId('catalog-store-name')).toHaveTextContent('Moda Cubana');
      await screen.findByTestId('catalog-card-cp1');
      expect(screen.queryByTestId('catalog-carousel')).not.toBeInTheDocument();
      expect(screen.queryByTestId('catalog-daily')).not.toBeInTheDocument();
      expect(screen.queryByText('Destacados de hoy')).not.toBeInTheDocument();
      expect(screen.getByTestId('catalog-grid')).toBeInTheDocument();
      expect(screen.getByTestId('catalog-category-select')).toBeInTheDocument();
    });

    it('el botón "Ver productos" baja a la rejilla con scroll suave', async () => {
      renderPage();

      const button = await screen.findByTestId('catalog-see-products');
      expect(button).toHaveTextContent('Ver Productos');
      // Por debajo de los modales (`z-50`): el carrito y el checkout se abren encima, así que
      // este botón nunca queda encima de sus controles.
      expect(button.parentElement?.className).toContain('z-30');

      fireEvent.click(button);

      // Y baja a la REJILLA, no al principio de la página: el `this` del espía lo dice.
      expect(scrolledFrom).toHaveLength(1);
      expect(scrolledFrom[0]).toBe(screen.getByTestId('catalog-grid'));
    });

    it('el halo de atención del botón se apaga con movimiento reducido', async () => {
      // Se comprueba el EFECTO (la animación apagada de verdad), no la clase: un test que solo
      // mira el className no distingue "el componente decidió apagarlo" de "el navegador lo
      // apagaría", y en jsdom la media query no se aplica. `afterEach` restaura `matchMedia`.
      const mockReducedMotion = (matches: boolean) => {
        window.matchMedia = vi.fn().mockReturnValue({
          matches,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as typeof window.matchMedia;
      };
      const halo = async (): Promise<Element> => {
        const button = await screen.findByTestId('catalog-see-products');
        const span = button.querySelector('span[aria-hidden="true"]');
        if (!span) throw new Error('el botón "Ver productos" no tiene halo');
        return span;
      };

      mockReducedMotion(true);
      renderPage();
      expect((await halo()).className).not.toContain('animate-ping');
      // Y el botón dice que lo tiene apagado, para que el estado no viva solo en el CSS.
      expect(await halo()).toHaveAttribute('data-reduced-motion', 'true');

      // Montaje propio para la segunda mitad: la preferencia se lee al montar, así que cambiar el
      // mock después no cambiaría el botón ya pintado.
      cleanup();
      mockReducedMotion(false);
      renderPage();
      // Sin la preferencia del sistema el halo late: el botón sí pide atención.
      expect((await halo()).className).toContain('animate-ping');
      expect(await halo()).not.toHaveAttribute('data-reduced-motion');
    });

    it('el carrusel avanza solo, y con movimiento reducido se queda quieto', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      catalogMock.getPublicOrderingConfig.mockResolvedValue(
        envelope(showcaseConfig({ carouselImages: CAROUSEL })),
      );
      renderPage();

      await screen.findByTestId('catalog-carousel');
      expect(screen.getByTestId('catalog-carousel-dot-0')).toHaveAttribute('aria-current', 'true');

      // Tres segundos no mueven nada; el intervalo del carrusel es de 5 s.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(screen.getByTestId('catalog-carousel-dot-0')).toHaveAttribute('aria-current', 'true');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });
      expect(screen.getByTestId('catalog-carousel-dot-1')).toHaveAttribute('aria-current', 'true');
    });

    it('con prefers-reduced-motion no hay auto-avance, pero las flechas siguen', async () => {
      window.matchMedia = vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as typeof window.matchMedia;
      vi.useFakeTimers({ shouldAdvanceTime: true });
      catalogMock.getPublicOrderingConfig.mockResolvedValue(
        envelope(showcaseConfig({ carouselImages: CAROUSEL })),
      );
      renderPage();

      await screen.findByTestId('catalog-carousel');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20000);
      });
      expect(screen.getByTestId('catalog-carousel-dot-0')).toHaveAttribute('aria-current', 'true');

      // Reducido no significa inaccesible: la navegación manual sigue ahí.
      fireEvent.click(screen.getByTestId('catalog-carousel-next'));
      expect(screen.getByTestId('catalog-carousel-dot-1')).toHaveAttribute('aria-current', 'true');
      fireEvent.click(screen.getByTestId('catalog-carousel-previous'));
      expect(screen.getByTestId('catalog-carousel-dot-0')).toHaveAttribute('aria-current', 'true');
    });

    it('el carrusel se para mientras el puntero está encima y sigue al salir', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      catalogMock.getPublicOrderingConfig.mockResolvedValue(
        envelope(showcaseConfig({ carouselImages: CAROUSEL })),
      );
      renderPage();

      const carousel = await screen.findByTestId('catalog-carousel');
      // Avanza solo: cinco segundos cambian de imagen.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(screen.getByTestId('catalog-carousel-dot-1')).toHaveAttribute('aria-current', 'true');

      // Con el puntero encima, cinco segundos más NO lo mueven: un carrusel que se mueve
      // mientras se está leyendo (o intentando pinchar una flecha) es peor que uno quieto.
      fireEvent.mouseEnter(carousel);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(screen.getByTestId('catalog-carousel-dot-1')).toHaveAttribute('aria-current', 'true');

      // Al salir, vuelve a su ritmo: la pausa era del puntero, no del carrusel.
      fireEvent.mouseLeave(carousel);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(screen.getByTestId('catalog-carousel-dot-0')).toHaveAttribute('aria-current', 'true');
    });

    it('el carrusel se para con el teclado dentro y sigue al salir', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      catalogMock.getPublicOrderingConfig.mockResolvedValue(
        envelope(showcaseConfig({ carouselImages: CAROUSEL })),
      );
      renderPage();

      await screen.findByTestId('catalog-carousel');
      // El foco viaja por CAPTURA (onFocusCapture), no por el elemento que lo recibe: así
      // cualquier control del carrusel —flechas, puntos— lo para, también los que se añadan.
      fireEvent.focus(screen.getByTestId('catalog-carousel-next'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15000);
      });
      expect(screen.getByTestId('catalog-carousel-dot-0')).toHaveAttribute('aria-current', 'true');

      // Al perder el foco el auto-avance vuelve, para que el resto del catálogo no quede congelado
      // solo porque el cliente tocó una flecha hace un rato.
      fireEvent.blur(screen.getByTestId('catalog-carousel-next'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(screen.getByTestId('catalog-carousel-dot-1')).toHaveAttribute('aria-current', 'true');
    });

    it('con una sola imagen no hay flechas ni puntos, y no se auto-avanza', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      catalogMock.getPublicOrderingConfig.mockResolvedValue(
        envelope(showcaseConfig({ carouselImages: [CAROUSEL[0]] })),
      );
      renderPage();

      const carousel = await screen.findByTestId('catalog-carousel');
      expect(within(carousel).getByTestId('catalog-carousel-image-0')).toBeInTheDocument();
      // Controles para pasar de una imagen a la misma imagen: ruido, no ayuda.
      expect(screen.queryByTestId('catalog-carousel-previous')).not.toBeInTheDocument();
      expect(screen.queryByTestId('catalog-carousel-next')).not.toBeInTheDocument();
      expect(within(carousel).queryByTestId('catalog-carousel-dot-0')).not.toBeInTheDocument();

      // Y tampoco auto-avanza: veinte segundos (cuatro intervalos) no la mueven ni a la otra ni
      // fuera del catálogo.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20000);
      });
      expect(within(carousel).getByTestId('catalog-carousel-image-0')).toHaveAttribute(
        'src',
        `${window.location.origin}${MEDIA}/a.jpg`,
      );
    });
  });

  // ── CARRITO Y PEDIDO DEL CLIENTE ANÓNIMO (F3) ────────────────────────────────────────────
  describe('pedido del cliente anónimo (F3)', () => {
    beforeEach(() => {
      useStorefrontCartStore.setState({ itemsByStore: {} });
      localStorage.clear();
    });

    it('añade desde la tarjeta y muestra el badge con la cantidad', async () => {
      renderPage();
      await screen.findByTestId('catalog-add-cp1');

      fireEvent.click(screen.getByTestId('catalog-add-cp1'));

      // El carrito es del STOREFRONT, no el del POS: la línea vive en el store nuevo.
      const lines = useStorefrontCartStore.getState().itemsByStore['mi-tienda'];
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({ productId: 'cp1', quantity: 1, unitPrice: 82.5 });
      // Y el carrito del POS sigue vacío (claves distintas: `lizoft-catalog-cart` vs `lizoft-cart`).
      expect(useCartStore.getState().items).toHaveLength(0);
      expect(await screen.findByTestId('catalog-cart-count')).toHaveTextContent('1');
      expect(await screen.findByTestId('catalog-add-notice')).toHaveTextContent('Camisa azul');
    });

    it('abre el carrito con la línea y el subtotal, sin romper la rejilla', async () => {
      renderPage();
      await screen.findByTestId('catalog-add-cp1');

      fireEvent.click(screen.getByTestId('catalog-add-cp1'));
      fireEvent.click(screen.getByTestId('catalog-cart-button'));

      const modal = await screen.findByTestId('catalog-cart-modal');
      expect(within(modal).getByTestId('catalog-cart-item-cp1')).toHaveTextContent('Camisa azul');
      expect(within(modal).getByTestId('catalog-cart-subtotal')).toHaveTextContent(/82\.50\s*CUP/);
    });

    it('va del carrito al checkout y crea el pedido mostrando el código', async () => {
      catalogMock.createPublicOrder.mockResolvedValue(
        envelope({
          id: 'o1',
          code: 'K7M2QX',
          subtotal: 82.5,
          total: 82.5,
          currency: 0,
          lines: [{ name: 'Camisa azul', quantity: 1, price: 82.5 }],
        }),
      );
      // El código se pinta en el modal de estado, que la página abre tras crear; se comprueba
      // desde aquí porque la página es quien se lo pasa.
      renderPage();
      await screen.findByTestId('catalog-add-cp1');

      fireEvent.click(screen.getByTestId('catalog-add-cp1'));
      fireEvent.click(screen.getByTestId('catalog-cart-button'));
      fireEvent.click(await screen.findByTestId('catalog-cart-checkout'));

      const checkout = await screen.findByTestId('catalog-checkout-modal');
      fireEvent.change(within(checkout).getByTestId('checkout-name'), {
        target: { value: 'Ana' },
      });
      fireEvent.change(within(checkout).getByTestId('checkout-phone'), {
        target: { value: '5351234567' },
      });
      fireEvent.click(within(checkout).getByTestId('checkout-submit'));

      await waitFor(() => expect(catalogMock.createPublicOrder).toHaveBeenCalledTimes(1));
      const [slug, payload] = catalogMock.createPublicOrder.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(slug).toBe('mi-tienda');
      // Solo id y cantidad: ni precio, ni total.
      expect(payload['items']).toEqual([{ productId: 'cp1', quantity: 1 }]);
      expect(payload).not.toHaveProperty('total');

      // El carrito se vacía y se muestra el código del pedido.
      await waitFor(() =>
        expect(useStorefrontCartStore.getState().itemsByStore['mi-tienda']).toEqual([]),
      );
      expect(await screen.findByTestId('order-code')).toHaveTextContent('K7M2QX');
    });

    it('añade desde el detalle del producto', async () => {
      renderPage();
      await screen.findByTestId('catalog-card-cp1');

      fireEvent.click(screen.getByTestId('catalog-card-cp1'));
      await screen.findByTestId('catalog-detail-modal');
      fireEvent.click(screen.getByTestId('catalog-detail-add'));

      const lines = useStorefrontCartStore.getState().itemsByStore['mi-tienda'];
      expect(lines).toHaveLength(1);
      expect(lines[0].productId).toBe('cp1');
      // El detalle se cierra y el carrito se abre: el cliente ve qué acaba de añadir.
      expect(screen.queryByTestId('catalog-detail-modal')).not.toBeInTheDocument();
      expect(await screen.findByTestId('catalog-cart-modal')).toBeInTheDocument();
    });

    it('el carrito de una tienda no aparece en el de otra', async () => {
      const { unmount } = render(
        <IntlProvider locale="es" messages={esMessages}>
          <PublicCatalogPage />
        </IntlProvider>,
      );
      await screen.findByTestId('catalog-add-cp1');
      fireEvent.click(screen.getByTestId('catalog-add-cp1'));
      unmount();

      // El slug cambió: el catálogo se pide para la otra tienda y el contador sigue en cero,
      // porque el store aísla por slug en vez de mezclar carritos.
      useParamsMock.mockReturnValue({ storeSlug: 'otra-tienda' });
      render(
        <IntlProvider locale="es" messages={esMessages}>
          <PublicCatalogPage />
        </IntlProvider>,
      );

      await screen.findByTestId('catalog-store-name');
      await waitFor(() => expect(catalogMock.getPublicCatalog).toHaveBeenLastCalledWith('otra-tienda'));
      expect(screen.queryByTestId('catalog-cart-count')).not.toBeInTheDocument();
      expect(useStorefrontCartStore.getState().itemsByStore['mi-tienda']).toHaveLength(1);
    });

    it('con la tienda cerrada no hay carrito ni botón de añadir', async () => {
      catalogMock.getPublicOrderingConfig.mockResolvedValue(
        envelope({ ...CONFIG_WITHOUT_BRAND, enabled: false }),
      );
      renderPage();

      // Publicar el catálogo y aceptar pedidos son dos interruptores distintos (F1).
      expect(await screen.findByTestId('catalog-card-cp1')).toBeInTheDocument();
      expect(screen.queryByTestId('catalog-cart-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('catalog-add-cp1')).not.toBeInTheDocument();
      expect(screen.getByTestId('catalog-orders-disabled')).toHaveTextContent(
        'Esta tienda no está aceptando pedidos por ahora.',
      );
      // Y el catálogo es el de siempre.
      expect(screen.getByTestId('catalog-grid')).toBeInTheDocument();
    });

    it('consulta el estado de un pedido por código y teléfono', async () => {
      catalogMock.getPublicOrderStatus.mockResolvedValue(
        envelope({
          code: 'K7M2QX',
          status: 0,
          paymentStatus: 0,
          deliveryType: 0,
          total: 82.5,
          currency: 0,
          items: [{ name: 'Camisa azul', quantity: 1, price: 82.5 }],
        }),
      );
      renderPage();

      fireEvent.click(await screen.findByTestId('order-status-button'));
      fireEvent.change(screen.getByTestId('order-status-code'), { target: { value: 'K7M2QX' } });
      fireEvent.change(screen.getByTestId('order-status-phone'), {
        target: { value: '5351234567' },
      });
      fireEvent.click(screen.getByTestId('order-status-submit'));

      await waitFor(() =>
        expect(catalogMock.getPublicOrderStatus).toHaveBeenCalledWith(
          'mi-tienda',
          'K7M2QX',
          '5351234567',
        ),
      );
      expect(await screen.findByTestId('order-status-state')).toHaveTextContent('Recibido');
      expect(screen.getByTestId('order-status-delivery-type')).toHaveTextContent(
        'Recogida en la tienda',
      );
    });
  });

  // ── STAFF DE LA TIENDA REGISTRANDO SIN WHATSAPP (D2) ───────────────────────────────────
  describe('staff de la tienda registrando sin WhatsApp', () => {
    beforeEach(() => {
      useStorefrontCartStore.setState({ itemsByStore: {} });
      localStorage.clear();
      // CON número de WhatsApp a propósito: si la tienda lo tiene, el flujo normal SÍ abre el
      // chat, así que que el modo staff no lo abra es una decisión y no una degradación por
      // falta de número.
      catalogMock.createPublicOrder.mockResolvedValue(
        envelope({
          id: 'o1',
          code: 'K7M2QX',
          subtotal: 82.5,
          total: 82.5,
          currency: 0,
          lines: [{ name: 'Camisa azul', quantity: 1, price: 82.5 }],
          whatsappNumber: '+53 5-987 6543',
        }),
      );
    });

    /** Monta la página CON esa sesión y lleva al checkout, que es donde se ve el modo staff. */
    async function openCheckoutAs(user: UserModel | null) {
      session.current = user;
      renderPage();

      await screen.findByTestId('catalog-add-cp1');
      fireEvent.click(screen.getByTestId('catalog-add-cp1'));
      fireEvent.click(screen.getByTestId('catalog-cart-button'));
      fireEvent.click(await screen.findByTestId('catalog-cart-checkout'));
      return screen.findByTestId('catalog-checkout-modal');
    }

    function fillAndSubmit(checkout: HTMLElement) {
      fireEvent.change(within(checkout).getByTestId('checkout-name'), {
        target: { value: 'Cliente en el local' },
      });
      fireEvent.change(within(checkout).getByTestId('checkout-phone'), {
        target: { value: '5351234567' },
      });
      fireEvent.click(within(checkout).getByTestId('checkout-submit'));
    }

    it('el owner de la tienda registra el pedido: sin wa.me, sin aviso, con el código a la vista', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      // `CATALOG.storeId` es 's1': es ese id real —no el slug— contra el que se decide el modo.
      const checkout = await openCheckoutAs(makeUser({ isOwnerAdmin: true, selectedStoreId: 's1' }));

      // La etiqueta anuncia lo que va a pasar, antes de que pase: no se "envía" nada.
      expect(within(checkout).getByTestId('checkout-submit')).toHaveTextContent('Registrar pedido');

      fillAndSubmit(checkout);

      // El alta es la MISMA que la del cliente anónimo: mismos campos, mismos pasos (D3).
      await waitFor(() => expect(catalogMock.createPublicOrder).toHaveBeenCalledTimes(1));
      const [slug, payload] = catalogMock.createPublicOrder.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(slug).toBe('mi-tienda');
      expect(payload['items']).toEqual([{ productId: 'cp1', quantity: 1 }]);
      expect(payload).not.toHaveProperty('total');

      // Lo único que cambia: nada sale a WhatsApp. El padre abre el estado del pedido creado,
      // que es la confirmación.
      expect(openSpy).not.toHaveBeenCalled();
      expect(screen.queryByTestId('checkout-whatsapp-notice')).not.toBeInTheDocument();
      expect(await screen.findByTestId('order-code')).toHaveTextContent('K7M2QX');
      openSpy.mockRestore();
    });

    it('un StoreUser de la tienda también registra el pedido, sin el aviso', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      const checkout = await openCheckoutAs(
        makeUser({
          roles: [{ storeId: 's1', storeName: 'Moda Cubana', moduleId: 1, featureIds: [1] }],
        }),
      );

      expect(within(checkout).getByTestId('checkout-submit')).toHaveTextContent('Registrar pedido');
      fillAndSubmit(checkout);

      await waitFor(() => expect(catalogMock.createPublicOrder).toHaveBeenCalledTimes(1));
      expect(openSpy).not.toHaveBeenCalled();
      expect(screen.queryByTestId('checkout-whatsapp-notice')).not.toBeInTheDocument();
      expect(await screen.findByTestId('order-code')).toHaveTextContent('K7M2QX');
      openSpy.mockRestore();
    });

    it.each([
      ['anónimo', null],
      [
        'un owner de OTRA tienda',
        makeUser({
          isOwnerAdmin: true,
          selectedStoreId: 's-otra',
          storeList: [{ id: 's-otra', name: 'Otra' }],
        }),
      ],
      ['un SuperAdmin', makeUser({ isSuperAdmin: true, isOwnerAdmin: true, selectedStoreId: 's1' })],
      ['un ReSeller', makeUser({ isReSeller: true, selectedStoreId: 's1' })],
    ] as const)('%s sigue con el flujo de envío por WhatsApp', async (_label, user) => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      const checkout = await openCheckoutAs(user);
      // Etiqueta de cliente: la del flujo intacto.
      expect(within(checkout).getByTestId('checkout-submit')).toHaveTextContent('Enviar pedido');

      fillAndSubmit(checkout);

      await waitFor(() => expect(catalogMock.createPublicOrder).toHaveBeenCalledTimes(1));
      // Y con aviso de WhatsApp, que es lo que este visitante sigue necesitando.
      expect(openSpy).toHaveBeenCalledTimes(1);
      expect(await screen.findByTestId('checkout-whatsapp-pending')).toHaveTextContent('K7M2QX');
      openSpy.mockRestore();
    });
  });
});
