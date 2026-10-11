import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { Button } from '~/shared/components/ui/button';
import { InfoBox } from '~/shared/components/ui/info-box';
import { CartIcon, SearchIcon } from '~/shared/components/ui/icons';
import { currencyFromCode, formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';
import { apiFileUrl } from '~/shared/lib/http/media-url';
import { CatalogCarousel } from '~/catalog/components/catalog-carousel';
import { CatalogDaily } from '~/catalog/components/catalog-daily';
import { CatalogSeeProducts } from '~/catalog/components/catalog-see-products';
import type { CatalogTemplateProps } from '~/catalog/templates/catalog-template';

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

/**
 * Plantilla `default`: la carta pública tal como la conoce el cliente hoy (cabecera fija con
 * navegación por secciones, buscador + filtro por categoría, rejilla y paginación). Es la vista que
 * se pinta cuando la tienda no eligió otra plantilla, y su DOM es IDÉNTICO al de antes del refactor.
 */
export function DefaultCatalogTemplate(props: CatalogTemplateProps) {
  const {
    catalog,
    page,
    total,
    totalPages,
    currentPage,
    searchInput,
    categorySlug,
    listFailed,
    orderingConfig,
    orderingEnabled,
    logoUrl,
    carouselImages,
    dailyImages,
    cartCount,
    onSearchInputChange,
    onSearchSubmit,
    onCategoryChange,
    onPageChange,
    onOpenDetail,
    onAddToCart,
    onOpenCart,
  } = props;

  const intl = useIntl();

  /**
   * La rejilla de productos, para que el botón flotante "Ver Productos" sepa a dónde bajar. Es
   * una referencia y no un `querySelector`: el objetivo es el elemento que esta misma vista
   * pinta, y atarlo por `testid` lo convertiría en algo que un renombrado rompe en silencio.
   */
  const gridRef = useRef<HTMLUListElement>(null);

  /**
   * ¿Está la rejilla a la vista? Lo decide el navegador con un `IntersectionObserver`: el botón
   * flotante se retira cuando el cliente YA está en los productos (decisión del owner, 2026-10-08)
   * porque entonces solo tapa lo que está leyendo.
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
  }, []);

  // Las URLs de imagen llegan del backend como rutas relativas: se resuelven contra el origen
  // de la API (en producción es el mismo origen; en dev y E2E no lo es).
  const toImageUrl = (path: string | null | undefined) => (path ? apiFileUrl(path) : null);

  const items = page?.items ?? [];
  const storeName = catalog?.storeName ?? '';

  return (
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
                alt={intl.formatMessage({ id: 'CATALOG_PUBLIC.LOGO_ALT' }, { store: storeName })}
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
                Con la tienda cerrada (`enabled: false`) no se ofrece: publicar el catálogo no
                publica los pedidos, son dos interruptores distintos. Lo gateado es el CARRITO,
                no la navegación —una tienda cerrada sigue siendo un catálogo que se recorre—. */}
            {orderingEnabled && (
              <button
                type="button"
                onClick={onOpenCart}
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
                  {cartCount > 99 ? '99+' : cartCount}
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
          <CatalogCarousel images={carouselImages} storeName={storeName} />
        </div>
      )}

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Destacados: el bloque rotativo del dueño va PRIMERO en el cuerpo, antes de los
            filtros, para que se lea como una vitrina y no como un filtro más. Con el array vacío
            no hay ni caja ni título. Es la segunda sección, `id="destacados"`. */}
        {dailyImages.length > 0 && (
          <div className="scroll-mt-24" id="destacados">
            <CatalogDaily images={dailyImages} storeName={storeName} />
          </div>
        )}

        {/* Buscador + filtro por categoría: el backend filtra y pagina. */}
        <div className="flex flex-wrap items-end gap-3">
          <form
            className="flex flex-1 items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onSearchSubmit();
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
              onChange={(event) => onSearchInputChange(event.target.value)}
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
              onChange={(event) => onCategoryChange(event.target.value)}
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
                onClick={() => onOpenDetail(product)}
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
                  onClick={() => onAddToCart(product)}
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
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
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
              onClick={() => onPageChange(currentPage + 1)}
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
    </div>
  );
}

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
