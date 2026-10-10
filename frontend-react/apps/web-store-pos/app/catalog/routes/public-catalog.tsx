import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { useParams } from 'react-router';
import { Button } from '~/shared/components/ui/button';
import { InfoBox } from '~/shared/components/ui/info-box';
import { Modal } from '~/shared/components/ui/modal';
import { Spinner } from '~/shared/components/ui/spinner';
import { currencyFromCode, formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';
import { isNetworkError } from '~/shared/lib/http/http-error';
import { apiFileUrl } from '~/shared/lib/http/media-url';
import { showToastSuccess } from '~/shared/lib/toast';
import { StorefrontCart } from '~/catalog/components/storefront-cart';
import { StorefrontCheckout } from '~/catalog/components/storefront-checkout';
import { StorefrontOrderStatus } from '~/catalog/components/storefront-order-status';
import { useStorefrontCartStore } from '~/catalog/lib/storefront-cart-store';
import { isCatalogStoreStaff } from '~/catalog/lib/catalog-staff';
import { resolveTemplate } from '~/catalog/templates/registry';
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

type CatalogState = 'loading' | 'ready' | 'not-found' | 'offline';

/**
 * Catálogo público (`/catalog/<storeSlug>`): la tienda tal como la ve el cliente final.
 *
 * Este componente es el CONTENEDOR: es dueño de la funcionalidad —carga del catálogo, búsqueda,
 * filtro por categoría, paginación, carrito, checkout y consulta de estado— y de las OVERLAYS
 * (detalle, carrito, checkout, estado). La VISTA se delega a una plantilla resuelta por el
 * `templateId` del config público (ver `templates/registry.ts`): la plantilla por defecto es la
 * carta de siempre, y una tienda puede elegir otra sin cambiar nada del comportamiento.
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

  /** Publicar el catálogo y aceptar pedidos son DOS interruptores distintos (F1). */
  const orderingEnabled = orderingConfig?.enabled ?? false;

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

  // La plantilla la elige la tienda en su config; un id ausente o desconocido cae a `default`.
  const Template = resolveTemplate(orderingConfig?.templateId);

  return (
    <>
      <Template
        storeSlug={storeSlug}
        catalog={catalog}
        page={page}
        total={total}
        totalPages={totalPages}
        currentPage={currentPage}
        searchInput={searchInput}
        categorySlug={categorySlug}
        listFailed={listFailed}
        orderingConfig={orderingConfig}
        orderingEnabled={orderingEnabled}
        logoUrl={logoUrl}
        carouselImages={carouselImages}
        dailyImages={dailyImages}
        cartCount={cartCountForStore}
        onSearchInputChange={setSearchInput}
        onSearchSubmit={() => {
          setSearch(searchInput.trim());
          setCurrentPage(1);
        }}
        onCategoryChange={(slug) => {
          setCategorySlug(slug);
          setCurrentPage(1);
        }}
        onPageChange={setCurrentPage}
        onOpenDetail={(product) => void openDetail(product)}
        onAddToCart={addProductToCart}
        onOpenCart={() => setCartOpen(true)}
      />

      {/* Detalle: descripción en texto plano (D9) + galería. Vive en el CONTENEDOR, no en la
          plantilla: es funcionalidad compartida por todas las vistas. */}
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

      {/* El checkout solo existe si la tienda acepta pedidos: con `enabled: false` no hay ni
          botón ni modal, porque el backend lo rechazaría (y el cliente no puede permitirse
          descubrir eso escribiendo a mano un pedido). */}
      {orderingConfig && (
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
    </>
  );
}

export default PublicCatalogPage;
