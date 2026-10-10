import { useCallback, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { useParams } from 'react-router';
import { Button } from '~/shared/components/ui/button';
import { InfoBox } from '~/shared/components/ui/info-box';
import { Modal } from '~/shared/components/ui/modal';
import { Spinner } from '~/shared/components/ui/spinner';
import { CartIcon, SearchIcon } from '~/shared/components/ui/icons';
import { currencyFromCode, formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';
import { isNetworkError } from '~/shared/lib/http/http-error';
import { apiFileUrl } from '~/shared/lib/http/media-url';
import { showToastSuccess } from '~/shared/lib/toast';
import { CatalogCarousel } from '~/catalog/components/catalog-carousel';
import { CatalogDaily } from '~/catalog/components/catalog-daily';
import { CatalogSeeProducts } from '~/catalog/components/catalog-see-products';
import { StorefrontCart } from '~/catalog/components/storefront-cart';
import { StorefrontCheckout } from '~/catalog/components/storefront-checkout';
import { StorefrontOrderStatus } from '~/catalog/components/storefront-order-status';
import { useStorefrontCartStore } from '~/catalog/lib/storefront-cart-store';
import { isCatalogStoreStaff } from '~/catalog/lib/catalog-staff';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import {
  catalogHttpService,
  type PublicCatalog,
  type PublicCatalogPage,
  type PublicCatalogProduct,
  type PublicOrderingConfig,
  type PublicOrderCreated,
} from '~/sales/lib/services/catalog-http-service';

const PAGE_SIZE = 12;
/** La búsqueda espera a que el cliente deje de teclear: una petición, no una por letra. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Las TRES secciones de la carta (D2), y ni una más. El ancla es el `id` que monta cada bloque:
 * el carrusel `inicio`, los destacados `destacados` y la rejilla `productos`. "Categorías" NO
 * está porque es un FILTRO, no un sitio al que ir.
 */
const NAV_SECTIONS = [
  { anchor: 'inicio', labelId: 'CATALOG_PUBLIC.NAV_HOME' },
  { anchor: 'destacados', labelId: 'CATALOG_PUBLIC.NAV_FEATURED' },
  { anchor: 'productos', labelId: 'CATALOG_PUBLIC.NAV_PRODUCTS' },
] as const;

const NAV_LINK_CLASSES =
  'rounded-md px-2 py-1 text-sm text-text-muted transition-colors hover:bg-primary-light hover:text-text';

type CatalogState = 'loading' | 'ready' | 'not-found' | 'offline';

/**
 * Catálogo público (`/catalog/<storeSlug>`): la tienda tal como la ve el cliente final.
 *
 * Sin sesión y sin layout autenticado: el backend sirve estos endpoints de forma anónima
 * (`PublicCatalogController`). Solo se muestra lo que la tienda sincronizó; los productos
 * fuera de venta no aparecen. La descripción se pinta como TEXTO PLANO (decisión D9): nunca se
 * interpreta HTML, y los saltos de línea se respetan.
 */
export function PublicCatalogPage() {
  const intl = useIntl();
  const { storeSlug = '' } = useParams<{ storeSlug: string }>();

  /**
   * Quién está mirando esta carta. La ruta es PÚBLICA y no exige sesión: `isAuthenticated`
   * discrimina al visitante anónimo (el caso normal, con envío por WhatsApp) del staff de ESTA
   * tienda, que registra el pedido en vez de enviarlo.
   */
  const user = useAuthStore((s) => (s.isAuthenticated ? s.user : null));

  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [page, setPage] = useState<PublicCatalogPage | null>(null);
  const [state, setState] = useState<CatalogState>('loading');
  const [listFailed, setListFailed] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categorySlug, setCategorySlug] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const [detail, setDetail] = useState<PublicCatalogProduct | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);

  /**
   * La rejilla de productos, para que el botón flotante "Ver Productos" sepa a dónde bajar. Es
   * una referencia y no un `querySelector`: el objetivo es el elemento que esta misma vista
   * pinta, y atarlo por `testid` lo convertiría en algo que un renombrado rompe en silencio.
   */
  const gridRef = useRef<HTMLUListElement>(null);

  /**
   * ¿Está la rejilla a la vista? Lo decide el navegador con un `IntersectionObserver`, sin
   * costuras de scroll propias: el botón flotante se retira cuando el cliente YA está en los
   * productos (decisión del owner, 2026-10-08) porque entonces solo tapa lo que está leyendo.
   *
   * Se engancha en cuanto la página tiene cuerpo (`state === 'ready'`): antes de eso el retorno
   * temprano no monta la rejilla y no hay nada que observar. La lista se pide después, así que
   * observar cuando aparece el `<ul>` y no cuando llegan los productos evita un observer por
   * re-render.
   */
  const [gridVisible, setGridVisible] = useState(false);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const observer = new IntersectionObserver((entries) => {
      setGridVisible(entries.some((entry) => entry.isIntersecting));
    });
    observer.observe(grid);
    return () => observer.disconnect();
  }, [state]);

  /**
   * Marca de la carta pública (F8): solo el LOGO. El banner se retiró de la carta por decisión del
   * owner el 2026-10-08 —ni en la vista ni en la configuración del dueño— sin tocar el dato ni el
   * backend. El logo es un PLUS sobre el catálogo, no su condición: una tienda puede no tenerlo, así
   * que `null` (o un fallo entero de este endpoint) se pinta como un catálogo sin marca, nunca como
   * un catálogo roto.
   */
  const [orderingConfig, setOrderingConfig] = useState<PublicOrderingConfig | null>(null);

  /**
   * Pedido del cliente anónimo (F3). El carrito es un store PROPIO y aislado por slug
   * (`lizoft-catalog-cart`): el del POS (`lizoft-cart`) es la venta del vendedor y no se toca.
   */
  const cartItemsByStore = useStorefrontCartStore((state) => state.itemsByStore);
  const addToCart = useStorefrontCartStore((state) => state.addItem);
  const removeFromCart = useStorefrontCartStore((state) => state.removeItem);
  const updateCartQuantity = useStorefrontCartStore((state) => state.updateQuantity);
  const clearCart = useStorefrontCartStore((state) => state.clear);
  const cartTotal = useStorefrontCartStore((state) => state.total);
  const cartCount = useStorefrontCartStore((state) => state.count);

  const cartLines = cartItemsByStore[storeSlug] ?? [];
  const cartCountForStore = cartCount(storeSlug);

  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<PublicOrderCreated | null>(null);

  /**
   * EL CARRITO exige los DOS interruptores (M2), no uno: el módulo "Pedidos WhatsApp" (19) —sin él
   * no hay carrito ni pedidos nuevos— y la fila de configuración (`enabled`), que es la decisión
   * del dueño de abrir o cerrar pedidos.
   *
   * Son INDEPENDIENTES y por eso se exigen los dos: `enabled` es lo que la tienda acepta hacer y
   * `pedidosWhatsAppEnabled` es lo que compró. Con el interruptor en false pero el módulo pagado,
   * publicar el catálogo no publica los pedidos; con el módulo pagado pero el interruptor apagado,
   * son dos cosas distintas y la tienda ganó; y con ninguno de los dos, este catálogo es
   * exactamente el catálogo de siempre, sin carrito.
   */
  const orderingEnabled =
    (orderingConfig?.enabled ?? false) && (orderingConfig?.pedidosWhatsAppEnabled ?? false);

  /**
   * Staff de ESTA tienda viendo su propia carta: el pedido se registra y no se manda a WhatsApp
   * (D2). Anónimo, SuperAdmin/ReSeller y staff de otra tienda siguen con el flujo de siempre.
   * Se calcula sobre `catalog.storeId` —el id real detrás del slug— y no sobre el slug.
   */
  const staffMode = isCatalogStoreStaff(user, catalog?.storeId);

  function addProductToCart(product: PublicCatalogProduct) {
    addToCart(storeSlug, {
      id: product.id,
      name: product.name,
      currency: product.currency,
      unitPrice: product.finalPrice,
      imageUrl: product.imageUrl,
    });
    // El aviso va al TOAST global, no a un `<p>` en la cabecera (decisión del owner,
    // 2026-10-08): el botón de la tarjeta ya es solo un ícono, así que el texto pegado a la
    // cabecera era la única confirmación y competía con el propio botón del carrito.
    showToastSuccess(intl.formatMessage({ id: 'CATALOG_PUBLIC.ADDED_TO_CART' }));
  }

  const loadCatalog = useCallback(async () => {
    try {
      const result = await catalogHttpService.getPublicCatalog(storeSlug);
      if (!result.succeeded) {
        setState('not-found');
        return;
      }
      setCatalog(result.data);
      setState('ready');
    } catch (err) {
      // 404 = tienda inexistente o sin catálogo publicado (el backend no distingue el motivo);
      // sin conexión es otra cosa y se dice aparte, para no culpar al catálogo.
      setState(isNetworkError(err) ? 'offline' : 'not-found');
    }
  }, [storeSlug]);

  const loadProducts = useCallback(async () => {
    try {
      const result = await catalogHttpService.getPublicProducts(storeSlug, {
        categorySlug: categorySlug || undefined,
        search: search || undefined,
        page: currentPage,
        pageSize: PAGE_SIZE,
      });
      if (result.succeeded) {
        setPage(result.data);
        setListFailed(false);
      }
    } catch {
      // La cabecera ya dice si el catálogo no existe; aquí solo se deja constancia de que la
      // lista no se pudo actualizar.
      setListFailed(true);
    }
  }, [storeSlug, categorySlug, search, currentPage]);

  const loadOrderingConfig = useCallback(async () => {
    try {
      const result = await catalogHttpService.getPublicOrderingConfig(storeSlug);
      if (result.succeeded) {
        setOrderingConfig(result.data);
      }
    } catch {
      // La marca es opcional: si el config anónimo no está (o falla la red), la carta se publica
      // igual, solo que sin logo. No se avisa al cliente ni se cambia el estado de la página,
      // porque aquí un fallo NO significa que el catálogo no exista.
    }
  }, [storeSlug]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    void loadOrderingConfig();
  }, [loadOrderingConfig]);

  useEffect(() => {
    if (state !== 'ready') return;
    void loadProducts();
  }, [state, loadProducts]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setCurrentPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  async function openDetail(product: PublicCatalogProduct) {
    // Se abre con lo que ya trae la tarjeta (instantáneo) y se completa con el detalle.
    setDetail(product);
    setActiveImage(product.imageUrl);
    setZoomed(false);
    setDetailOpen(true);
    try {
      const result = await catalogHttpService.getPublicProduct(storeSlug, product.id);
      if (result.succeeded) {
        setDetail(result.data);
        setActiveImage(result.data.imageUrl);
      }
    } catch {
      // El detalle de la tarjeta ya alcanza para mostrar el producto.
    }
  }

  // Las URLs de imagen llegan del backend como rutas relativas: se resuelven contra el origen
  // de la API (en producción es el mismo origen; en dev y E2E no lo es).
  const toImageUrl = (path: string | null | undefined) => (path ? apiFileUrl(path) : null);

  // El logo llega como ruta relativa del endpoint público de media (nunca una ruta del servidor):
  // `null` = la tienda no configuró logo, y entonces no se pinta nada.
  const logoUrl = toImageUrl(orderingConfig?.logoUrl);

  // Showcase de la carta (carrusel + destacados). Los DOS conjuntos son independientes y
  // opcionales (C1/C2): el backend los manda SIEMPRE, vacíos cuando la tienda no subió ninguna.
  // El `?.` cubre además el config entero ausente (si el endpoint falla, esto queda `[]`).
  const carouselImages = orderingConfig?.carouselImages ?? [];
  const dailyImages = orderingConfig?.dailyImages ?? [];

  const total = page?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (state === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Spinner label={intl.formatMessage({ id: 'GENERAL.LOADING' })} />
      </main>
    );
  }

  if (state === 'not-found' || state === 'offline') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center" data-testid="catalog-public-unavailable">
          <h1 className="text-xl font-semibold text-text">
            {intl.formatMessage({ id: 'CATALOG_PUBLIC.NOT_FOUND_TITLE' })}
          </h1>
          <InfoBox variant={state === 'offline' ? 'danger' : 'info'} className="mt-3">
            {intl.formatMessage({
              id: state === 'offline' ? 'GENERAL.OFFLINE' : 'CATALOG_PUBLIC.NOT_FOUND',
            })}
          </InfoBox>
        </div>
      </main>
    );
  }

  const items = page?.items ?? [];

  return (
    /* `scroll-smooth` en el contenedor raíz: las anclas de la cabecera bajan con suavidad sin
       ninguna librería de scroll. */
    <div className="min-h-screen scroll-smooth bg-background">
      {/* Cabecera FIJA con la marca y la navegación. Va PRIMERO y se queda pegada al scroll:
          con el carrusel debajo, las tres secciones siguen a mano sin volver arriba. El botón
          "Consultar mi pedido" ya NO está aquí (decisión del owner, 2026-10-08): el popup de
          estado sigue existiendo y lo abre el checkout al crear el pedido. */}
      <header className="sticky top-0 z-40 border-b border-border bg-surface px-4 py-4">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center gap-3">
            {logoUrl && (
              <img
                src={logoUrl}
                alt={intl.formatMessage(
                  { id: 'CATALOG_PUBLIC.LOGO_ALT' },
                  { store: catalog?.storeName ?? '' },
                )}
                className="h-12 w-12 shrink-0 rounded-md border border-border object-contain"
                data-testid="catalog-logo"
              />
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold text-text" data-testid="catalog-store-name">
                {catalog?.storeName}
              </h1>
              <p className="text-xs text-text-muted">
                {intl.formatMessage({ id: 'CATALOG_PUBLIC.FOOTER' })}
              </p>
            </div>
            {/* Las TRES secciones, en línea en escritorio (D2). En móvil el mismo grupo de
                enlaces sale del desplegable de al lado: no son dos navegaciones, es una. */}
            <CatalogNavLinks className="hidden shrink-0 items-center gap-1 md:flex" />
            <CatalogNavMenu className="md:hidden" />
            {/* Carrito (F3) con la misma forma que el del POS: ícono + contador SIEMPRE visible.
                Con la tienda cerrada (`enabled: false`) o SIN el módulo "Pedidos WhatsApp" (19)
                no se ofrece: sin ese módulo no hay carrito ni pedidos nuevos (M2), y sin el
                interruptor tampoco —son dos interruptores distintos y se exigen los dos—. Lo
                gateado es el CARRITO, no la navegación —una tienda cerrada sigue siendo un
                catálogo que se recorre—. */}
            {orderingEnabled && (
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                className="relative rounded-lg p-2 text-text-muted transition-colors hover:bg-primary-light"
                aria-label={intl.formatMessage({ id: 'CATALOG_PUBLIC.CART_TITLE' })}
                data-testid="catalog-cart-button"
              >
                <CartIcon />
                {/* Contador SIEMPRE visible, como en el POS: tapar y destapar el número con la
                    compra es ruido. Con tope en 99+ porque el badge es de 16 px. */}
                <span
                  className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-xs font-bold text-white"
                  data-testid="catalog-cart-badge"
                >
                  {cartCountForStore > 99 ? '99+' : cartCountForStore}
                </span>
              </button>
            )}
          </div>

          {!orderingEnabled && orderingConfig && (
            <p className="mt-3 text-xs text-text-muted" data-testid="catalog-orders-disabled">
              {intl.formatMessage({ id: 'CATALOG_PUBLIC.ORDERS_DISABLED' })}
            </p>
          )}
        </div>
      </header>

      {/* Portada visual de la tienda: el carrusel va DEBAJO de la cabecera (decisión del owner,
          2026-10-08) y es `id="inicio"`, la primera de las tres secciones. Con el array vacío
          no se pinta ni un marco —la página es exactamente la de antes—. */}
      {carouselImages.length > 0 && (
        <div className="scroll-mt-24 px-4 pt-4" id="inicio">
          <CatalogCarousel images={carouselImages} storeName={catalog?.storeName ?? ''} />
        </div>
      )}

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Destacados: el bloque rotativo del dueño va PRIMERO en el cuerpo, antes de los
            filtros, para que se lea como una vitrina y no como un filtro más. Con el array vacío
            no hay ni caja ni título. Es la segunda sección, `id="destacados"`. */}
        {dailyImages.length > 0 && (
          <div className="scroll-mt-24" id="destacados">
            <CatalogDaily images={dailyImages} storeName={catalog?.storeName ?? ''} />
          </div>
        )}

        {/* Buscador + filtro por categoría: el backend filtra y pagina. */}
        <div className="flex flex-wrap items-end gap-3">
          <form
            className="flex flex-1 items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(searchInput.trim());
              setCurrentPage(1);
            }}
          >
            <label className="sr-only" htmlFor="catalog-search">
              {intl.formatMessage({ id: 'CATALOG_PUBLIC.SEARCH' })}
            </label>
            <input
              id="catalog-search"
              type="search"
              value={searchInput}
              placeholder={intl.formatMessage({ id: 'CATALOG_PUBLIC.SEARCH_PLACEHOLDER' })}
              onChange={(event) => setSearchInput(event.target.value)}
              className="w-full min-w-40 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
              data-testid="catalog-search-input"
            />
            <Button type="submit" data-testid="catalog-search-button">
              <SearchIcon />
              {intl.formatMessage({ id: 'CATALOG_PUBLIC.SEARCH' })}
            </Button>
          </form>

          <div>
            <label
              className="mb-1 block text-xs font-medium text-text-muted"
              htmlFor="catalog-category"
            >
              {intl.formatMessage({ id: 'CATALOG_PUBLIC.CATEGORY' })}
            </label>
            <select
              id="catalog-category"
              value={categorySlug}
              onChange={(event) => {
                setCategorySlug(event.target.value);
                setCurrentPage(1);
              }}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
              data-testid="catalog-category-select"
            >
              <option value="">{intl.formatMessage({ id: 'CATALOG_PUBLIC.ALL_CATEGORIES' })}</option>
              {(catalog?.categories ?? []).map((category) => (
                <option key={category.id} value={category.slug}>
                  {category.name} ({category.productsCount})
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="mt-3 text-sm text-text-muted" data-testid="catalog-results-count">
          {total === 1
            ? intl.formatMessage({ id: 'CATALOG_PUBLIC.RESULTS_ONE' })
            : intl.formatMessage({ id: 'CATALOG_PUBLIC.RESULTS' }, { count: total })}
        </p>

        {listFailed && (
          <InfoBox variant="danger" className="mt-3">
            {intl.formatMessage({ id: 'GENERAL.OFFLINE' })}
          </InfoBox>
        )}

        {!listFailed && items.length === 0 && (
          <InfoBox variant="info" className="mt-4 text-center">
            {intl.formatMessage({
              id:
                catalog && catalog.categories.length === 0
                  ? 'CATALOG_PUBLIC.EMPTY_CATALOG'
                  : 'CATALOG_PUBLIC.EMPTY',
            })}
          </InfoBox>
        )}

        {/* Dos columnas DESDE móvil (decisión del owner, 2026-10-06): la rejilla anterior
            solo tenía 2 columnas desde `sm`, así que en móvil cada tarjeta ocupaba el ancho
            completo y la vista desaprovechaba el espacio. Al partirla en dos, la tarjeta se
            estrecha a la mitad, y por eso el nombre y el precio tienen que ir APILADOS (más
            abajo): repartidos en horizontal el nombre se sale de su caja y pinta sobre el
            precio. `gap` también baja en móvil porque a media columna un `gap-4` se come la
            tarjeta. */}
        <ul
          ref={gridRef}
          id="productos"
          className="mt-4 grid scroll-mt-24 grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3"
          data-testid="catalog-grid"
        >
          {items.map((product) => (
            /* El botón "Añadir" va SOBRE la tarjeta, no dentro: la tarjeta es un `<button>` que
               abre el detalle, y un `<button>` dentro de otro `<button>` es HTML inválido —el
               navegador cierra el primero y el clic acaba en la tarjeta, sin añadir nada. Por
               eso el `<li>` es el contenedor `relative` y el botón va posicionado encima. */
            <li key={product.id} className="relative">
              <button
                type="button"
                onClick={() => void openDetail(product)}
                className="group relative h-full w-full overflow-hidden rounded-lg bg-surface text-left shadow-card transition-transform duration-300 hover:scale-[1.02]"
                data-testid={`catalog-card-${product.id}`}
              >
                <div className="relative w-full overflow-hidden">
                  {product.imageUrl ? (
                    <img
                      src={toImageUrl(product.imageUrl) ?? undefined}
                      alt={product.name}
                      className="h-40 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-40 w-full items-center justify-center bg-surface-hover text-sm text-text-muted sm:h-64">
                      {intl.formatMessage({ id: 'CATALOG_PUBLIC.NO_IMAGE' })}
                    </div>
                  )}
                  {(product.isNew || product.hasDiscount) && (
                    <div className="absolute left-2 top-2 z-10 flex gap-2">
                      {product.isNew && (
                        <span
                          className="rounded-full bg-primary px-2 py-1 text-xs text-white"
                          data-testid={`catalog-badge-new-${product.id}`}
                        >
                          {intl.formatMessage({ id: 'CATALOG_PUBLIC.NEW' })}
                        </span>
                      )}
                      {product.hasDiscount && (
                        <span
                          className="rounded-full bg-danger px-2 py-1 text-xs text-white"
                          data-testid={`catalog-badge-discount-${product.id}`}
                        >
                          -{product.percentDiscount}%
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Nombre y precio APILADOS y a la IZQUIERDA (decisión del owner, 2026-10-06; sustituye
                    el reparto en la misma fila del 2026-10-01). Con dos columnas en móvil la
                    tarjeta se estrecha, y en horizontal el nombre —que puede encogerse por
                    debajo de su contenido— se salía de su caja y pintaba encima del precio,
                    que al ser `shrink-0` nunca cedía espacio. En columna no compiten. */}
                <div className="p-3 sm:p-4">
                  <div
                    className="flex flex-col gap-1"
                    data-testid={`catalog-card-pricing-${product.id}`}
                  >
                    <h3 className="min-w-0 break-words text-base font-semibold text-text">
                      {product.name}
                    </h3>
                    {/* Moneda como CÓDIGO (CUP/USD/…), nunca el símbolo $: cada producto lleva
                        la suya. El precio original tachado va DEBAJO del final. */}
                    <div
                      className="shrink-0 text-left"
                      data-testid={`catalog-card-price-${product.id}`}
                    >
                      <span className="block text-base font-bold text-primary">
                        {formatMoneyWithCurrency(
                          product.finalPrice,
                          currencyFromCode(product.currency),
                        )}
                      </span>
                      {product.hasDiscount && (
                        <span className="block text-xs text-text-muted line-through">
                          {formatMoneyWithCurrency(product.price, currencyFromCode(product.currency))}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Descripción como TEXTO PLANO (D9) recortada a 3 líneas: la larga ya no
                      empuja el precio fuera de la vista rápida. El modal sigue con el texto
                      completo. */}
                  {product.description && (
                    <p
                      className="mt-1.5 line-clamp-3 whitespace-pre-line text-xs text-text-muted"
                      data-testid={`catalog-card-description-${product.id}`}
                    >
                      {product.description}
                    </p>
                  )}
                </div>
              </button>
              {/* "Añadir" es SOLO el ícono del carrito de venta (decisión del owner, 2026-10-08):
                  el texto se comía media tarjeta en la rejilla de dos columnas. Un ícono sin
                  nombre no dice qué hace, así que el `aria-label` lleva el producto. */}
              {orderingEnabled && (
                <Button
                  className="absolute right-2 bottom-2 z-10 size-9 rounded-full p-0 shadow-card"
                  onClick={() => addProductToCart(product)}
                  aria-label={intl.formatMessage(
                    { id: 'CATALOG_PUBLIC.ADD_TO_CART_PRODUCT' },
                    { name: product.name },
                  )}
                  data-testid={`catalog-add-${product.id}`}
                >
                  <CartIcon />
                </Button>
              )}
            </li>
          ))}
        </ul>

        {totalPages > 1 && (
          <nav className="mt-6 flex items-center justify-center gap-3">
            <Button
              variant="outline"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((value) => Math.max(1, value - 1))}
              data-testid="catalog-previous-page"
            >
              {intl.formatMessage({ id: 'CATALOG_PUBLIC.PREVIOUS' })}
            </Button>
            <span className="text-sm text-text-muted" data-testid="catalog-page-indicator">
              {intl.formatMessage(
                { id: 'CATALOG_PUBLIC.PAGE' },
                { page: page?.page ?? currentPage, pages: totalPages },
              )}
            </span>
            <Button
              variant="outline"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((value) => value + 1)}
              data-testid="catalog-next-page"
            >
              {intl.formatMessage({ id: 'CATALOG_PUBLIC.NEXT' })}
            </Button>
          </nav>
        )}
      </main>

      {/* Atajo a los productos. Solo con la página lista y ALGO que ver: sin productos no hay
          rejilla a la que bajar, y ofrecer un botón que no lleva a ninguna parte es peor que
          no ofrecerlo. Y se retira al llegar a la rejilla (decisión del owner, 2026-10-08),
          porque entonces solo taparía los productos que el cliente ya está leyendo. */}
      {items.length > 0 && <CatalogSeeProducts targetRef={gridRef} hidden={gridVisible} />}

      {/* Detalle: descripción en texto plano (D9) + galería. */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={detail?.name ?? ''}
        testId="catalog-detail-modal"
      >
        {detail && (
          <div className="space-y-4">
            {activeImage ? (
              <button
                type="button"
                onClick={() => setZoomed((value) => !value)}
                className="w-full"
                aria-label={intl.formatMessage({
                  id: zoomed ? 'CATALOG_PUBLIC.ZOOM_OUT' : 'CATALOG_PUBLIC.ZOOM_IN',
                })}
                data-testid="catalog-detail-image-toggle"
              >
                <img
                  src={toImageUrl(activeImage) ?? undefined}
                  alt={detail.name}
                  className={`w-full rounded-lg ${
                    zoomed ? 'max-h-[70vh] object-contain' : 'max-h-72 object-cover'
                  }`}
                  data-testid="catalog-detail-image"
                />
              </button>
            ) : (
              <p className="text-sm text-text-muted">
                {intl.formatMessage({ id: 'CATALOG_PUBLIC.NO_IMAGE' })}
              </p>
            )}

            {detail.imageUrls.length > 1 && (
              <div>
                <span className="text-xs font-medium text-text-muted">
                  {intl.formatMessage({ id: 'CATALOG_PUBLIC.GALLERY' })}
                </span>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {detail.imageUrls.map((url, index) => (
                    <li key={url}>
                      <button
                        type="button"
                        onClick={() => setActiveImage(url)}
                        className={`h-16 w-16 overflow-hidden rounded-md border ${
                          url === activeImage ? 'border-primary' : 'border-border'
                        }`}
                        data-testid={`catalog-detail-thumb-${index}`}
                      >
                        <img
                          src={toImageUrl(url) ?? undefined}
                          alt={detail.name}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {detail.isNew && (
                <span className="rounded-full bg-primary px-2 py-1 text-xs text-white">
                  {intl.formatMessage({ id: 'CATALOG_PUBLIC.NEW' })}
                </span>
              )}
              {detail.hasDiscount && (
                <span className="rounded-full bg-danger px-2 py-1 text-xs text-white">
                  -{detail.percentDiscount}%
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-primary">
                {formatMoneyWithCurrency(detail.finalPrice, currencyFromCode(detail.currency))}
              </span>
              {detail.hasDiscount && (
                <span className="text-lg text-text-muted line-through">
                  {formatMoneyWithCurrency(detail.price, currencyFromCode(detail.currency))}
                </span>
              )}
            </div>

            <p className="whitespace-pre-line text-sm text-text" data-testid="catalog-detail-description">
              {detail.description}
            </p>

            {orderingEnabled && (
              <Button
                className="w-full"
                onClick={() => {
                  addProductToCart(detail);
                  setDetailOpen(false);
                  setCartOpen(true);
                }}
                data-testid="catalog-detail-add"
              >
                {intl.formatMessage({ id: 'CATALOG_PUBLIC.ADD_TO_CART' })}
              </Button>
            )}
          </div>
        )}
      </Modal>

      <StorefrontCart
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        lines={cartLines}
        subtotal={cartTotal(storeSlug)}
        currency={cartLines[0]?.currency ?? null}
        onUpdateQuantity={(productId, quantity) => updateCartQuantity(storeSlug, productId, quantity)}
        onRemove={(productId) => removeFromCart(storeSlug, productId)}
        onClear={() => clearCart(storeSlug)}
        onCheckout={() => {
          setCartOpen(false);
          setCheckoutOpen(true);
        }}
      />

      {/* El checkout solo existe si la tienda ofrece el carrito: con `enabled: false` o sin el
          módulo 19 no hay ni botón ni modal, porque el backend no lo aceptaría (y el cliente no
          puede permitirse descubrir eso escribiendo a mano un pedido). Cuál de los dos flujos usa
          por dentro —POST con "Gestión de Pedidos" (20) o `wa.me` sin él (M3)— lo decide el
          propio checkout leyendo `config.gestionPedidosEnabled`. */}
      {orderingConfig && orderingEnabled && (
        <StorefrontCheckout
          open={checkoutOpen}
          onClose={() => setCheckoutOpen(false)}
          storeSlug={storeSlug}
          config={orderingConfig}
          lines={cartLines}
          staffMode={staffMode}
          onCreated={(order) => {
            clearCart(storeSlug);
            setCheckoutOpen(false);
            setCreatedOrder(order);
            setStatusOpen(true);
          }}
          onSentWithoutOrder={() => setCheckoutOpen(false)}
        />
      )}

      <StorefrontOrderStatus
        open={statusOpen}
        onClose={() => {
          setStatusOpen(false);
          setCreatedOrder(null);
        }}
        storeSlug={storeSlug}
        createdOrder={createdOrder}
      />
    </div>
  );
}

export default PublicCatalogPage;

/**
 * Navegación de la cabecera en ESCRITORIO: las tres secciones en línea.
 *
 * Son anclas, no manejadores de scroll: el navegador baja solo al `id` y el `scroll-smooth` del
 * contenedor raíz hace el resto. Así el enlace sigue siendo un enlace —se abre en otra pestaña,
 * se copia, se navega con teclado— sin ninguna librería de scroll.
 */
function CatalogNavLinks({ className = '' }: { readonly className?: string }) {
  const intl = useIntl();

  return (
    <nav
      className={className}
      aria-label={intl.formatMessage({ id: 'CATALOG_PUBLIC.NAV_LABEL' })}
      data-testid="catalog-nav"
    >
      {NAV_SECTIONS.map((section) => (
        <a
          key={section.anchor}
          href={`#${section.anchor}`}
          className={NAV_LINK_CLASSES}
          data-testid={`catalog-nav-${section.anchor}`}
        >
          {intl.formatMessage({ id: section.labelId })}
        </a>
      ))}
    </nav>
  );
}

/**
 * La MISMA navegación en MÓVIL, plegada tras un botón `☰`.
 *
 * En una barra estrecha los tres enlaces no caben junto al logo sin partirla, así que el header
 * se queda con marca + carrito y las secciones salen de un desplegable. Se cierra al elegir
 * destino —si no, el panel seguiría abierto encima de la sección a la que se bajó— y el botón
 * declara `aria-expanded` para que un lector de pantalla sepa si el panel está abierto.
 *
 * El panel se ancla al header (`sticky` es un contenedor de su `absolute`), así que se abre
 * ENCIMA del contenido en vez de empujarlo.
 */
function CatalogNavMenu({ className = '' }: { readonly className?: string }) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);

  return (
    <div className={`relative shrink-0 ${className}`.trim()}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="catalog-menu-panel"
        aria-label={intl.formatMessage({ id: 'CATALOG_PUBLIC.MENU' })}
        className="rounded-lg p-2 text-text-muted transition-colors hover:bg-primary-light"
        data-testid="catalog-menu-button"
      >
        <span aria-hidden="true" className="text-lg leading-none">
          ☰
        </span>
      </button>

      {open && (
        <div
          id="catalog-menu-panel"
          className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-card"
          data-testid="catalog-menu-panel"
        >
          {NAV_SECTIONS.map((section) => (
            <a
              key={section.anchor}
              href={`#${section.anchor}`}
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm text-text transition-colors hover:bg-primary-light"
              data-testid={`catalog-menu-${section.anchor}`}
            >
              {intl.formatMessage({ id: section.labelId })}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
