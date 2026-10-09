import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const showToastSuccessMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/toast', () => ({
  showToastSuccess: (...args: unknown[]) => showToastSuccessMock(...args),
}));

/**
 * jsdom NO implementa `IntersectionObserver`, y la página lo usa para decidir si el botón
 * "Ver Productos" se retira (decisión del owner, 2026-10-08). Sin este doble, `new
 * IntersectionObserver` revienta con ReferenceError y toda la suite muere por el motivo
 * equivocado. Se deja CONTROLABLE a propósito —`emit(true|false)`— para poder comprobar que el
 * botón se oculta al llegar a la rejilla, en vez de dejar el caso sin cubrir.
 */
class FakeIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: readonly number[] = [];
  readonly elements = new Set<Element>();

  constructor(private readonly callback: IntersectionObserverCallback) {
    observedBy.push(this);
  }

  observe(element: Element) {
    this.elements.add(element);
  }

  unobserve(element: Element) {
    this.elements.delete(element);
  }

  disconnect() {
    this.elements.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** Lo que el navegador hace al hacer scroll: avisa si el elemento está o no en pantalla. */
  emit(isIntersecting: boolean) {
    this.callback(
      Array.from(this.elements).map(
        (target) => ({ target, isIntersecting }) as IntersectionObserverEntry,
      ),
      this,
    );
  }
}

const observedBy: FakeIntersectionObserver[] = [];

/** Dispara la entrada/salida de TODO lo observado, como haría el scroll del navegador. */
function emitIntersection(isIntersecting: boolean) {
  act(() => {
    observedBy.forEach((observer) => observer.emit(isIntersecting));
  });
}

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

/** Config anónimo de pedidos: sin marca por defecto (una tienda puede no tener logo/banner). */
const CONFIG_WITHOUT_BRAND: PublicOrderingConfig = {
  enabled: true,
  pickupEnabled: true,
  deliveryEnabled: true,
  deliveryFee: 0,
  minimumOrderAmount: 0,
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
    showToastSuccessMock.mockClear();
    observedBy.length = 0;
    globalThis.IntersectionObserver =
      FakeIntersectionObserver as unknown as typeof IntersectionObserver;
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

  // ── MARCA (F8): SOLO el logo — el banner se retiró de la carta el 2026-10-08 (D3) ────
  describe('marca del catálogo público', () => {
    it('pinta el logo junto al nombre y NUNCA un banner, aunque la tienda tenga los dos', async () => {
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
      expect(catalogMock.getPublicOrderingConfig).toHaveBeenCalledWith('mi-tienda');
      // El logo acompaña al nombre: sigue siendo el título de la carta.
      expect(screen.getByTestId('catalog-store-name')).toHaveTextContent('Moda Cubana');
      // El banner sigue LLEGANDO en el config —el backend no se toca (D10)— pero la vista ya no
      // lo pinta: lo que se retiró es el dato en pantalla, no el endpoint.
      expect(screen.queryByTestId('catalog-banner')).not.toBeInTheDocument();
    });

    it('sin marca no pinta ni logo ni banner, y la carta es la de siempre', async () => {
      renderPage();

      expect(await screen.findByTestId('catalog-store-name')).toBeInTheDocument();
      expect(screen.queryByTestId('catalog-logo')).not.toBeInTheDocument();
      expect(screen.queryByTestId('catalog-banner')).not.toBeInTheDocument();
      // Y el catálogo sigue entero: la marca es un plus, no su condición.
      expect(screen.getByTestId('catalog-grid')).toBeInTheDocument();
    });

    it('solo banner y sin logo: el logo falta y el banner tampoco se pinta', async () => {
      catalogMock.getPublicOrderingConfig.mockResolvedValue(
        envelope({
          ...CONFIG_WITHOUT_BRAND,
          bannerUrl: '/api/v1/public/catalog/mi-tienda/media/t/s/branding/banner.png',
        }),
      );
      renderPage();

      await screen.findByTestId('catalog-store-name');
      expect(screen.queryByTestId('catalog-logo')).not.toBeInTheDocument();
      expect(screen.queryByTestId('catalog-banner')).not.toBeInTheDocument();
      // Y sin un solo hueco: la carta es exactamente la de siempre.
      expect(screen.getByTestId('catalog-grid')).toBeInTheDocument();
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

  // ── CABECERA FIJA Y NAVEGACIÓN POR SECCIONES (decisión del owner, 2026-10-08) ───────
  describe('cabecera fija y navegación', () => {
    it('el header se queda arriba con la marca a la izquierda', async () => {
      renderPage();

      const header = (await screen.findByTestId('catalog-store-name')).closest('header');
      expect(header).not.toBeNull();
      expect(header).toHaveClass('sticky');
      expect(header).toHaveClass('top-0');
      // Por encima del contenido (`z-30` del botón flotante y `z-50` de los modales) para que
      // pegarse arriba no lo tape nadie.
      expect(header).toHaveClass('z-40');
      expect(header).toHaveClass('bg-surface');
      expect(header).toHaveClass('border-b');
      expect(header).toHaveClass('border-border');
    });

    it('el contenedor raíz hace el scroll suave, sin ninguna librería', async () => {
      const { container } = renderPage();

      await screen.findByTestId('catalog-store-name');
      expect(container.firstElementChild).toHaveClass('scroll-smooth');
    });

    it('enlaza las TRES secciones, y "Categorías" no es una sección', async () => {
      renderPage();
      await screen.findByTestId('catalog-nav');

      // D2: Inicio · Destacados · Productos. El filtro de categorías no es un sitio al que ir.
      const anchors = within(screen.getByTestId('catalog-nav')).getAllByRole('link');
      expect(anchors.map((link) => link.textContent)).toEqual([
        'Inicio',
        'Destacados',
        'Productos',
      ]);
      expect(anchors.map((link) => link.getAttribute('href'))).toEqual([
        '#inicio',
        '#destacados',
        '#productos',
      ]);
      expect(screen.queryByRole('link', { name: 'Categorías' })).not.toBeInTheDocument();
    });

    it('cada ancla existe y deja margen para que el header fijo no la tape', async () => {
      const MEDIA = '/api/v1/public/catalog/mi-tienda/media/t/s/showcase';
      catalogMock.getPublicOrderingConfig.mockResolvedValue(
        envelope({
          ...CONFIG_WITHOUT_BRAND,
          carouselImages: [{ url: `${MEDIA}/a.jpg`, caption: null }],
          dailyImages: [{ url: `${MEDIA}/d1.jpg`, caption: null }],
        }),
      );
      renderPage();
      await screen.findByTestId('catalog-grid');

      // Los tres destinos del menú tienen su `id` en la página.
      expect(document.getElementById('inicio')).not.toBeNull();
      expect(document.getElementById('destacados')).not.toBeNull();
      expect(document.getElementById('productos')).toBe(screen.getByTestId('catalog-grid'));

      // Y `scroll-mt-24` en los tres: sin margen, el header fijo se comería el título.
      for (const id of ['inicio', 'destacados', 'productos']) {
        expect(document.getElementById(id)).toHaveClass('scroll-mt-24');
      }
    });

    it('en móvil las secciones salen del desplegable, y se cierra al elegir', async () => {
      renderPage();
      const menu = await screen.findByTestId('catalog-menu-button');

      expect(menu).toHaveAttribute('aria-label', 'Menú');
      expect(menu).toHaveAttribute('aria-expanded', 'false');
      // Plegado: el panel no existe hasta que se pide.
      expect(screen.queryByTestId('catalog-menu-panel')).not.toBeInTheDocument();

      fireEvent.click(menu);
      expect(menu).toHaveAttribute('aria-expanded', 'true');

      const panel = await screen.findByTestId('catalog-menu-panel');
      const links = within(panel).getAllByRole('link');
      expect(links.map((link) => link.textContent)).toEqual([
        'Inicio',
        'Destacados',
        'Productos',
      ]);
      expect(links.map((link) => link.getAttribute('href'))).toEqual([
        '#inicio',
        '#destacados',
        '#productos',
      ]);

      // Elegir destino cierra el panel: si no, taparía la sección a la que se bajó.
      fireEvent.click(screen.getByTestId('catalog-menu-productos'));
      expect(screen.queryByTestId('catalog-menu-panel')).not.toBeInTheDocument();
      expect(menu).toHaveAttribute('aria-expanded', 'false');
    });

    it('la navegación existe con la tienda cerrada: lo gateado es el carrito', async () => {
      catalogMock.getPublicOrderingConfig.mockResolvedValue(
        envelope({ ...CONFIG_WITHOUT_BRAND, enabled: false }),
      );
      renderPage();

      await screen.findByTestId('catalog-nav');
      // Sin carrito (F1), pero la carta se sigue recorriendo como un catálogo.
      expect(screen.queryByTestId('catalog-cart-button')).not.toBeInTheDocument();
      expect(screen.getByTestId('catalog-menu-button')).toBeInTheDocument();
      expect(within(screen.getByTestId('catalog-nav')).getAllByRole('link')).toHaveLength(3);
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

    it('las diapositivas se SUPERPONEN: el marco mide una sola imagen', async () => {
      const MEDIA = '/api/v1/public/catalog/mi-tienda/media/t/s/showcase';
      catalogMock.getPublicOrderingConfig.mockResolvedValue(
        envelope({
          ...CONFIG_WITHOUT_BRAND,
          carouselImages: [
            { url: `${MEDIA}/a.jpg`, caption: null },
            { url: `${MEDIA}/b.jpg`, caption: null },
          ],
        }),
      );
      renderPage();

      const carousel = await screen.findByTestId('catalog-carousel');
      // El ARREGLO ESTRUCTURAL (el defecto que reportaba el owner): antes cada diapositiva iba
      // en flujo normal, así que el marco medía N×alto y las flechas y los puntos quedaban
      // anclados al fondo de toda la pila.
      expect(carousel).toHaveClass('relative');
      expect(carousel).toHaveClass('h-56');
      expect(carousel).toHaveClass('sm:h-72');
      expect(carousel).toHaveClass('lg:h-96');

      for (const position of [0, 1]) {
        const slide = within(carousel).getByTestId(`catalog-carousel-slide-${position}`);
        expect(slide).toHaveClass('absolute');
        expect(slide).toHaveClass('inset-0');
        // Y no reservan altura propia: sin `h-*` de diapositiva, la altura es la del marco.
        expect(slide.className).not.toMatch(/(^|\s)h-\d/);
      }

      // Solo la activa se ve; la otra sale del árbol de accesibilidad.
      expect(within(carousel).getByTestId('catalog-carousel-slide-0')).toHaveClass('opacity-100');
      expect(within(carousel).getByTestId('catalog-carousel-slide-0')).toHaveAttribute(
        'aria-hidden',
        'false',
      );
      expect(within(carousel).getByTestId('catalog-carousel-slide-1')).toHaveClass('opacity-0');
      expect(within(carousel).getByTestId('catalog-carousel-slide-1')).toHaveAttribute(
        'aria-hidden',
        'true',
      );
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

    it('el botón "Ver productos" se retira al llegar a la rejilla (D9)', async () => {
      renderPage();

      const button = await screen.findByTestId('catalog-see-products');
      expect(button).toBeInTheDocument();

      // El navegador avisa de que la rejilla entró en pantalla: entonces el atajo solo taparía
      // los productos que el cliente ya está leyendo.
      emitIntersection(true);
      expect(screen.queryByTestId('catalog-see-products')).not.toBeInTheDocument();

      // Y vuelve al salir: arriba el botón sigue haciendo falta. Se desmonta y se vuelve a
      // montar, así que se comprueba que está, no que sea el mismo nodo.
      emitIntersection(false);
      expect(await screen.findByTestId('catalog-see-products')).toBeInTheDocument();
    });

    it('el halo de atención del botón se apaga con movimiento reducido', async () => {
      renderPage();

      const button = await screen.findByTestId('catalog-see-products');
      const halo = button.querySelector('span[aria-hidden="true"]');
      expect(halo?.className).toContain('animate-ping');
      expect(halo?.className).toContain('motion-reduce:animate-none');
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
  });

  // ── CARRITO Y PEDIDO DEL CLIENTE ANÓNIMO (F3) ────────────────────────────────────────────
  describe('pedido del cliente anónimo (F3)', () => {
    beforeEach(() => {
      useStorefrontCartStore.setState({ itemsByStore: {} });
      localStorage.clear();
    });

    it('añade desde la tarjeta, sube el badge y avisa con un toast', async () => {
      renderPage();
      await screen.findByTestId('catalog-add-cp1');

      // El botón de la tarjeta es un ícono, así que se busca por su nombre accesible: sin el
      // `aria-label` con el producto sería un botón sin decir qué añade (D6).
      expect(screen.getByRole('button', { name: 'Añadir Camisa azul al carrito' })).toBe(
        screen.getByTestId('catalog-add-cp1'),
      );
      fireEvent.click(screen.getByTestId('catalog-add-cp1'));

      // El carrito es del STOREFRONT, no el del POS: la línea vive en el store nuevo.
      const lines = useStorefrontCartStore.getState().itemsByStore['mi-tienda'];
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({ productId: 'cp1', quantity: 1, unitPrice: 82.5 });
      // Y el carrito del POS sigue vacío (claves distintas: `lizoft-catalog-cart` vs `lizoft-cart`).
      expect(useCartStore.getState().items).toHaveLength(0);
      expect(await screen.findByTestId('catalog-cart-badge')).toHaveTextContent('1');
      // La confirmación va al TOAST global (D8), no a un texto pegado en la cabecera.
      expect(showToastSuccessMock).toHaveBeenCalledWith('Añadido al carrito de venta');
      expect(screen.queryByTestId('catalog-add-notice')).not.toBeInTheDocument();
    });

    it('el badge del carrito se ve SIEMPRE, y vacío marca 0 (D7)', async () => {
      renderPage();
      await screen.findByTestId('catalog-cart-button');

      // El badge del POS nunca se oculta: tapar y destapar el número con la compra es ruido.
      const badge = screen.getByTestId('catalog-cart-badge');
      expect(badge).toHaveTextContent('0');
      expect(badge).toHaveClass('rounded-full');
      expect(badge).toHaveClass('bg-primary');

      // El botón es un ícono de carrito, no un botón de texto.
      expect(screen.getByTestId('catalog-cart-button').querySelector('svg')).not.toBeNull();
    });

    it('el tope del badge es 99+, porque el badge es de 16 px', async () => {
      renderPage();
      await screen.findByTestId('catalog-add-cp1');

      useStorefrontCartStore.setState({
        itemsByStore: {
          'mi-tienda': Array.from({ length: 150 }, () => ({
            productId: 'cp1',
            name: 'Camisa azul',
            quantity: 1,
            unitPrice: 82.5,
            currency: 'CUP',
            imageUrl: null,
          })),
        },
      });

      await waitFor(() =>
        expect(screen.getByTestId('catalog-cart-badge')).toHaveTextContent('99+'),
      );
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
        envelope({ id: 'o1', code: 'K7M2QX', total: 82.5, currency: 0 }),
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
      // El badge NO desaparece: siempre visible, y en la otra tienda marca 0 (D7).
      expect(screen.getByTestId('catalog-cart-badge')).toHaveTextContent('0');
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

    it('la cabecera NO ofrece "Consultar mi pedido": sale del header (D1)', async () => {
      renderPage();
      await screen.findByTestId('catalog-card-cp1');

      // El botón se fue del header: el estado del pedido recién creado lo abre el checkout, que
      // es parte del flujo de compra (D5). Lo que ya no existe es la consulta suelta por código.
      expect(screen.queryByTestId('order-status-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('order-status-code')).not.toBeInTheDocument();
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
          total: 82.5,
          currency: 0,
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
