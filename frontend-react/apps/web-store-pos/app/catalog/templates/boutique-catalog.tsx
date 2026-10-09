import { useIntl } from 'react-intl';
import { Button } from '~/shared/components/ui/button';
import { InfoBox } from '~/shared/components/ui/info-box';
import { CartIcon, SearchIcon } from '~/shared/components/ui/icons';
import { currencyFromCode, formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';
import { apiFileUrl } from '~/shared/lib/http/media-url';
import { CatalogCarousel } from '~/catalog/components/catalog-carousel';
import { CatalogDaily } from '~/catalog/components/catalog-daily';
import type { CatalogTemplateProps } from '~/catalog/templates/catalog-template';

/**
 * Plantilla `boutique`: una VITRINA centrada en la marca de la tienda.
 *
 * Es la misma carta con otra disposición: hero centrado con logo + nombre + horario y modalidades
 * de entrega, buscador destacado, categorías como CHIPS en vez de desplegable, y una rejilla de
 * tarjetas con el PRECIO de protagonista y un botón de añadir con texto. La funcionalidad es la
 * MISMA que en `default` (buscar, filtrar, paginar, ver detalle, añadir al carrito): lo único que
 * cambia es la vista.
 *
 * No tiene cabecera fija con anclas ni botón flotante "Ver Productos": el hero ya es el punto de
 * entrada y las categorías están a mano.
 */
export function BoutiqueCatalogTemplate(props: CatalogTemplateProps) {
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

  const toImageUrl = (path: string | null | undefined) => (path ? apiFileUrl(path) : null);

  const items = page?.items ?? [];
  const storeName = catalog?.storeName ?? '';
  const categories = catalog?.categories ?? [];

  const deliveryNote = [
    orderingConfig?.pickupEnabled
      ? intl.formatMessage({ id: 'CATALOG_BOUTIQUE.PICKUP' })
      : null,
    orderingConfig?.deliveryEnabled
      ? intl.formatMessage({ id: 'CATALOG_BOUTIQUE.DELIVERY' })
      : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');

  return (
    <div className="min-h-screen bg-background">
      {/* Hero: la marca de la tienda, centrada. Es el punto de entrada y hace las veces de
          cabecera; el carrito vive en la esquina. */}
      <header className="relative border-b border-border bg-linear-to-b from-primary-light to-surface px-4 pt-10 pb-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          {logoUrl && (
            <img
              src={logoUrl}
              alt={intl.formatMessage({ id: 'CATALOG_PUBLIC.LOGO_ALT' }, { store: storeName })}
              className="h-20 w-20 rounded-full border border-border bg-surface object-contain p-1"
              data-testid="catalog-logo"
            />
          )}
          <h1
            className="mt-4 text-3xl font-bold tracking-tight text-text"
            data-testid="catalog-store-name"
          >
            {catalog?.storeName}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {intl.formatMessage({ id: 'CATALOG_PUBLIC.FOOTER' })}
          </p>
          {(deliveryNote || orderingConfig?.businessHours) && (
            <p className="mt-3 text-xs text-text-muted" data-testid="boutique-store-info">
              {[deliveryNote, orderingConfig?.businessHours].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        {/* Carrito: mismo comportamiento que en `default`, anclado arriba a la derecha. */}
        {orderingEnabled && (
          <button
            type="button"
            onClick={onOpenCart}
            className="absolute top-4 right-4 rounded-full border border-border bg-surface p-2 text-text-muted shadow-card transition-colors hover:bg-primary-light"
            aria-label={intl.formatMessage({ id: 'CATALOG_PUBLIC.CART_TITLE' })}
            data-testid="catalog-cart-button"
          >
            <CartIcon />
            <span
              className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-xs font-bold text-white"
              data-testid="catalog-cart-badge"
            >
              {cartCount > 99 ? '99+' : cartCount}
            </span>
          </button>
        )}
      </header>

      {!orderingEnabled && orderingConfig && (
        <p
          className="bg-surface px-4 py-2 text-center text-xs text-text-muted"
          data-testid="catalog-orders-disabled"
        >
          {intl.formatMessage({ id: 'CATALOG_PUBLIC.ORDERS_DISABLED' })}
        </p>
      )}

      {carouselImages.length > 0 && (
        <div className="px-4 pt-4">
          <CatalogCarousel images={carouselImages} storeName={storeName} />
        </div>
      )}

      <main className="mx-auto max-w-5xl px-4 py-6">
        {dailyImages.length > 0 && <CatalogDaily images={dailyImages} storeName={storeName} />}

        {/* Buscador destacado, centrado. */}
        <form
          className="mx-auto flex max-w-xl items-center gap-2"
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
            className="w-full flex-1 rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid="catalog-search-input"
          />
          <Button type="submit" className="rounded-full" data-testid="catalog-search-button">
            <SearchIcon />
            <span className="hidden sm:inline">
              {intl.formatMessage({ id: 'CATALOG_PUBLIC.SEARCH' })}
            </span>
          </Button>
        </form>

        {/* Categorías como chips: un toque, sin desplegar. "Todas" siempre primero. */}
        <div
          className="mt-5 flex flex-wrap justify-center gap-2"
          data-testid="boutique-categories"
        >
          <button
            type="button"
            onClick={() => onCategoryChange('')}
            aria-pressed={categorySlug === ''}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              categorySlug === ''
                ? 'border-primary bg-primary text-white'
                : 'border-border bg-surface text-text-muted hover:bg-primary-light'
            }`}
            data-testid="boutique-category-all"
          >
            {intl.formatMessage({ id: 'CATALOG_PUBLIC.ALL_CATEGORIES' })}
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => onCategoryChange(category.slug)}
              aria-pressed={categorySlug === category.slug}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                categorySlug === category.slug
                  ? 'border-primary bg-primary text-white'
                  : 'border-border bg-surface text-text-muted hover:bg-primary-light'
              }`}
              data-testid={`boutique-category-${category.slug}`}
            >
              {category.name}
              <span className="ml-1 opacity-60">({category.productsCount})</span>
            </button>
          ))}
        </div>

        <p className="mt-5 text-center text-sm text-text-muted" data-testid="catalog-results-count">
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

        {/* Rejilla de vitrina: tarjetas de una columna en móvil y dos en escritorio, con el precio
            grande y un botón de añadir con texto. La tarjeta NO envuelve al botón (HTML válido):
            el detalle y el añadir son dos botones hermanos. */}
        <ul
          className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
          data-testid="boutique-grid"
        >
          {items.map((product) => (
            <li
              key={product.id}
              className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card"
              data-testid={`boutique-card-${product.id}`}
            >
              <button
                type="button"
                onClick={() => onOpenDetail(product)}
                className="block w-full text-left"
              >
                {product.imageUrl ? (
                  <img
                    src={toImageUrl(product.imageUrl) ?? undefined}
                    alt={product.name}
                    className="h-48 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-48 w-full items-center justify-center bg-surface-hover text-sm text-text-muted">
                    {intl.formatMessage({ id: 'CATALOG_PUBLIC.NO_IMAGE' })}
                  </div>
                )}
                <div className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {product.isNew && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-white">
                        {intl.formatMessage({ id: 'CATALOG_PUBLIC.NEW' })}
                      </span>
                    )}
                    {product.hasDiscount && (
                      <span className="rounded-full bg-danger px-2 py-0.5 text-xs text-white">
                        -{product.percentDiscount}%
                      </span>
                    )}
                  </div>
                  <h3 className="mt-2 text-lg font-semibold text-text">{product.name}</h3>
                  {product.description && (
                    <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-text-muted">
                      {product.description}
                    </p>
                  )}
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-xl font-bold text-primary">
                      {formatMoneyWithCurrency(
                        product.finalPrice,
                        currencyFromCode(product.currency),
                      )}
                    </span>
                    {product.hasDiscount && (
                      <span className="text-sm text-text-muted line-through">
                        {formatMoneyWithCurrency(product.price, currencyFromCode(product.currency))}
                      </span>
                    )}
                  </div>
                </div>
              </button>
              {orderingEnabled && (
                <div className="px-4 pb-4">
                  <Button
                    className="w-full"
                    onClick={() => onAddToCart(product)}
                    aria-label={intl.formatMessage(
                      { id: 'CATALOG_PUBLIC.ADD_TO_CART_PRODUCT' },
                      { name: product.name },
                    )}
                    data-testid={`catalog-add-${product.id}`}
                  >
                    {intl.formatMessage({ id: 'CATALOG_PUBLIC.ADD_TO_CART' })}
                  </Button>
                </div>
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
    </div>
  );
}
