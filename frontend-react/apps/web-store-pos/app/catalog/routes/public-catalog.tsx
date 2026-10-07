import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { useParams } from 'react-router';
import { Button } from '~/shared/components/ui/button';
import { InfoBox } from '~/shared/components/ui/info-box';
import { Modal } from '~/shared/components/ui/modal';
import { Spinner } from '~/shared/components/ui/spinner';
import { SearchIcon } from '~/shared/components/ui/icons';
import { currencyFromCode, formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';
import { isNetworkError } from '~/shared/lib/http/http-error';
import { apiFileUrl } from '~/shared/lib/http/media-url';
import {
  catalogHttpService,
  type PublicCatalog,
  type PublicCatalogPage,
  type PublicCatalogProduct,
  type PublicOrderingConfig,
} from '~/sales/lib/services/catalog-http-service';

const PAGE_SIZE = 12;
/** La búsqueda espera a que el cliente deje de teclear: una petición, no una por letra. */
const SEARCH_DEBOUNCE_MS = 300;

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
   * Marca de la carta pública (F8): logo y banner. Es un PLUS sobre el catálogo, no su
   * condición — una tienda puede no tenerlos, así que `null` (o un fallo entero de este
   * endpoint) se pinta como un catálogo sin marca, nunca como un catálogo roto.
   */
  const [orderingConfig, setOrderingConfig] = useState<PublicOrderingConfig | null>(null);

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
      // igual, solo que sin logo ni banner. No se avisa al cliente ni se cambia el estado de la
      // página, porque aquí un fallo NO significa que el catálogo no exista.
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

  // Logo y banner llegan como rutas relativas del endpoint público de media (nunca rutas del
  // servidor): `null` = la tienda no configuró ese lado, y entonces no se pinta nada.
  const logoUrl = toImageUrl(orderingConfig?.logoUrl);
  const bannerUrl = toImageUrl(orderingConfig?.bannerUrl);

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
    <div className="min-h-screen bg-background">
      {/* Marca (F8): el banner va sobre la cabecera (ancho completo, recortado para no comerse
          la carta) y el logo junto al nombre. Ninguno de los dos es obligatorio: sin marca, la
          cabecera es exactamente la que había. */}
      {bannerUrl && (
        <div className="bg-surface">
          <img
            src={bannerUrl}
            alt={intl.formatMessage(
              { id: 'CATALOG_PUBLIC.BANNER_ALT' },
              { store: catalog?.storeName ?? '' },
            )}
            className="mx-auto block max-h-56 w-full max-w-5xl object-cover"
            data-testid="catalog-banner"
          />
        </div>
      )}

      <header className="border-b border-border bg-surface px-4 py-6">
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
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-text" data-testid="catalog-store-name">
                {catalog?.storeName}
              </h1>
              <p className="text-xs text-text-muted">
                {intl.formatMessage({ id: 'CATALOG_PUBLIC.FOOTER' })}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
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
          className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3"
          data-testid="catalog-grid"
        >
          {items.map((product) => (
            <li key={product.id}>
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
          </div>
        )}
      </Modal>
    </div>
  );
}

export default PublicCatalogPage;
