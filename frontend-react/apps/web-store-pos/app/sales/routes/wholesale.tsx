import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { Product } from '@store-mgmt/domain';
import { EFeatures, OrderType, ProductErrors, Result } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useCartStore } from '~/shared/lib/stores/cart-store';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { HelpIcon, ScanBarcodeIcon } from '~/shared/components/ui/icons';
import { showBlockingError, showBlockingInfoHtml } from '~/shared/lib/blocking-alert';
import { showToastError, showToastSuccess } from '~/shared/lib/toast';
import { formatCurrency } from '~/shared/lib/format-currency';
import { Switch } from '~/shared/components/ui/switch';
import { hasInventoryModuleAvailable } from '~/shared/lib/auth/authorization-service';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { createProductService } from '../lib/services/product-service.factory';
import { createProductCategoryService } from '../lib/services/product-category-service.factory';
import { hasAvailableProductToSale } from '../lib/product-availability';
import {
  getWholesaleMinPacks,
  resolveWholesalePrice,
  wholesaleUnitName,
  wholesaleUnitPlural,
  wholesaleUnits,
} from '../lib/wholesale';
import { guardOrderType } from '../lib/order-type-guard';
import { ScannerModal } from '../components/scanner-modal';
import type { ProductCategory } from '@store-mgmt/domain';

// Mismo guard que la venta normal: feature Ventas.
export const clientLoader = featureLoader([EFeatures.Sale]);

/**
 * Ventas Mayoristas — misma venta que la normal, pero la cantidad se pide por PAQUETES
 * (6, 10, 12, 24, 30… según la config del producto) y el precio por unidad baja por escalones.
 * - `quantity` en el carrito = packs × packSize (unidades reales) → el inventario descuenta igual.
 * - `price` por línea = precio por UNIDAD del escalón aplicado (ej: 12 × 24 × 660).
 * - `OrderType.Mayorista` fluye tal cual al crear la orden.
 *
 * Presentación (paridad con /sales/new, 2026-09-05): filtro por categorías (tabs) y por
 * nombre (searchbox); debajo del nombre del producto va la disponibilidad entre
 * paréntesis + el icono ? con los rangos. La unidad de medida ("caja", "paquete"…)
 * es configurable por producto (wholesaleUnitLabel) y aparece en todos los textos.
 */

/** Sentinel id del pseudo-tab "Todas" — mismo patrón que sale.tsx ALL_CATEGORIES_ID. */
const ALL_CATEGORIES_ID = 'all';

export function WholesalePage() {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const storeId = user?.selectedStoreId ?? '';
  const addItem = useCartStore((s) => s.addItem);
  const getCartItemQuantity = useCartStore((s) => s.getItemQuantity);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(ALL_CATEGORIES_ID);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchAllCategories, setSearchAllCategories] = useState(true);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [packsByProduct, setPacksByProduct] = useState<Record<string, string>>({});
  // Exclusividad Normal/Mayorista: se leen en cada render (no suscriben re-render).
  const cartItems = useCartStore((s) => s.items);
  const cartOrderType = useCartStore((s) => s.orderType);

  useEffect(() => {
    if (!storeId) return;
    const categoryService = createProductCategoryService(storeId);
    categoryService.getAvailableProductCategories().then((categoriesResult) => {
      const availableCategories = categoriesResult.data ?? [];
      setCategories(availableCategories);
      const productService = createProductService(storeId);
      Promise.all(
        availableCategories.map((c) => productService.getProductsToSaleByCategoryId(c.id)),
      ).then((results) => {
        const wholesaleProducts = results
          .flatMap((r) => r.data ?? [])
          .filter((p) => p.wholesaleEnabled && p.wholesalePackSize && p.wholesaleTiers?.length);
        setProducts(wholesaleProducts);
      });
    });
  }, [storeId]);

  const inventoryService = new InventoryOfflineService(
    storeId,
    new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
  );
  const hasInventoryModule = user ? hasInventoryModuleAvailable(user) : false;

  /** Cantidad disponible en unidades del producto (solo si descuenta inventario). */
  function availableUnits(product: Product): number | undefined {
    if (!hasInventoryModule || !product.discountFromInvantory) return undefined;
    const quantity = inventoryService.getAvailableQuantity(product.id);
    return quantity.hasEntries ? quantity.available : undefined;
  }

  /** Unidad de medida del producto ("caja", "paquete"…) con fallback "paquete". */
  function unitName(product: Product): string {
    return wholesaleUnitName(product);
  }

  /** Mismo gate de inventario que la venta normal, pero SIEMPRE en unidades (packs × packSize). */
  function availabilityGate(
    product: Product | undefined,
    productId: string,
    units: number,
  ): Result {
    return hasAvailableProductToSale({
      product,
      quantity: units,
      cartQuantity: getCartItemQuantity(productId),
      hasInventoryModule,
      inventory: inventoryService.getAvailableQuantity(productId),
    });
  }

  /** Popup readonly con los rangos de precio del producto (SweetAlert2 con HTML). */
  function showTiers(product: Product) {
    const tiers = [...(product.wholesaleTiers ?? [])].sort((a, b) => a.minPacks - b.minPacks);
    // Plural siempre — "Desde 1 paquetes" es la forma histórica pineada por el E2E
    // (mayorista-sale.spec.ts), no un error de gramática a corregir aquí.
    const unitPlural = wholesaleUnitPlural(unitName(product));
    const html = `
      <div style="text-align:left;font-size:14px;line-height:1.7">
        <p style="margin:0 0 8px"><strong>${intl.formatMessage({ id: 'SALES.WHOLESALE.TIERS_POPUP_PACK' })}:</strong> ${product.wholesalePackSize}</p>
        ${tiers
          .map(
            (tier) =>
              `<p style="margin:0">${intl
                .formatMessage(
                  { id: 'SALES.WHOLESALE.TIERS_POPUP_FROM' },
                  {
                    min: tier.minPacks,
                    price: formatCurrency(tier.pricePerUnit),
                    unit: unitPlural,
                  },
                )
                .replace(/</g, '&lt;')}</p>`,
          )
          .join('')}
      </div>`;
    showBlockingInfoHtml(intl.formatMessage({ id: 'SALES.WHOLESALE.TIERS_POPUP_TITLE' }), html);
  }

  /**
   * SHARED add-to-wholesale chokepoint — the manual row add (via handleAdd)
   * and the barcode scanner both land here: type guard, min-packs check,
   * inventory gate, then add. The manual path pre-checks nothing extra;
   * the gates are pure, so re-running them here is deterministic.
   * Returns the failing Result (or undefined on success) so each caller
   * can render its own error surface (row: blocking alert, scanner: toast
   * + blocking alert for inventory, matching sale.tsx's contract).
   */
  function addProductToWholesale(product: Product, packs: number): Result | undefined {
    // Exclusividad: no se puede mezclar venta normal y mayorista en el mismo carrito.
    const typeGuard = guardOrderType({
      items: cartItems,
      cartOrderType,
      requested: OrderType.Mayorista,
    });
    if (!typeGuard.succeeded) return typeGuard;

    // La cantidad mínima de paquetes es el primer rango de la config mayorista.
    const minPacks = getWholesaleMinPacks(product);
    if (packs < minPacks) {
      return Result.Failure([
        {
          code: 'Product.WholesaleMinPacks',
          description: intl.formatMessage(
            { id: 'SALES.WHOLESALE.MIN_PACKS_ERROR' },
            {
              min: minPacks,
              packSize: product.wholesalePackSize ?? 0,
              unit: wholesaleUnitPlural(unitName(product)),
            },
          ),
        },
      ]);
    }

    const packSize = product.wholesalePackSize ?? 0;
    const units = wholesaleUnits(packs, packSize);
    const availability = availabilityGate(product, product.id, units);
    if (!availability.succeeded) return availability;

    const { unitPrice } = resolveWholesalePrice(product, packs);
    addItem(product, units, OrderType.Mayorista, unitPrice);
    return undefined;
  }

  function handleAdd(product: Product) {
    const packs = parseInt(packsByProduct[product.id] ?? '', 10) || 0;
    if (packs <= 0) return;

    const failure = addProductToWholesale(product, packs);
    if (failure) {
      // Detalle de inventario debajo del motivo: disponibles y faltantes (en unidades).
      const stock = inventoryService.getAvailableQuantity(product.id);
      const units = wholesaleUnits(packs, product.wholesalePackSize ?? 0);
      const detail =
        stock.hasEntries && units > stock.available
          ? `\n${intl.formatMessage(
              { id: 'SALES.WHOLESALE.QUANTITY_UNAVAILABLE' },
              {
                available: stock.available,
                missing: units - stock.available,
                requested: units,
              },
            )}`
          : '';
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.RESPONSE.ERROR_TITLE' }),
        (failure.errors[0]?.description ?? ProductErrors.ProductNotAvailable.description) + detail,
      );
      return;
    }
    showToastSuccess(
      intl.formatMessage({ id: 'SALES.WHOLESALE.ADDED' }, { name: product.name }),
      intl.formatMessage({ id: 'GENERAL.RESPONSE.SUCCESS_TITLE' }),
    );
    setPacksByProduct((prev) => ({ ...prev, [product.id]: '' }));
  }

  /**
   * Scanner flow: barcode -> lookup -> sellability + wholesale config ->
   * the SAME shared addProductToWholesale gate as the manual add, with the
   * scanned QUANTITY multiplying the first tier's minimum packs (user
   * decision 2026-09-07: quantity 1 = minPacks of the first tier, so the
   * stepper scales whole tier-minimums and never trips the min-packs
   * error). The repository's barcode lookup does NOT filter
   * isActive/availableToSale or wholesaleEnabled (unlike the
   * category-scoped sellable query the manual rows come from), so the
   * scanner must check all three before adding — a non-wholesale product
   * gets its own message, NOT "not found", so the merchant knows the
   * barcode works but the product can't be sold wholesale. An
   * inventory-gate failure appends how many units are actually available.
   */
  function handleScanned(barcode: string, quantity: number) {
    const productService = createProductService(storeId);
    productService.getProductByBarcode(barcode).then((result) => {
      const product = result.data;
      if (!product) {
        showToastError(intl.formatMessage({ id: 'SCANNER.PRODUCT_NOT_FOUND' }, { barcode }));
        return;
      }
      if (!product.isActive || !product.availableToSale) {
        showToastError(
          intl.formatMessage({ id: 'SCANNER.PRODUCT_NOT_SELLABLE' }, { name: product.name }),
        );
        return;
      }
      if (
        !product.wholesaleEnabled ||
        !product.wholesalePackSize ||
        !product.wholesaleTiers?.length
      ) {
        showToastError(
          intl.formatMessage(
            { id: 'SALES.WHOLESALE.SCANNER_NOT_WHOLESALE' },
            { name: product.name },
          ),
        );
        return;
      }
      const minPacks = getWholesaleMinPacks(product);
      if (minPacks <= 0) {
        showToastError(
          intl.formatMessage(
            { id: 'SALES.WHOLESALE.SCANNER_NOT_WHOLESALE' },
            { name: product.name },
          ),
        );
        return;
      }
      const packs = minPacks * quantity;

      const failure = addProductToWholesale(product, packs);
      if (failure) {
        // Same blocking-alert contract as the manual row add, with the
        // store's available stock appended so the merchant sees the
        // inventory ceiling.
        const message =
          failure.errors[0]?.description ?? ProductErrors.ProductNotAvailable.description;
        const stock = inventoryService.getAvailableQuantity(product.id);
        const detail = stock.hasEntries
          ? `\n${intl.formatMessage({ id: 'SALES.AVAILABLE_STOCK' }, { available: stock.available })}`
          : '';
        showBlockingError(
          intl.formatMessage({ id: 'GENERAL.RESPONSE.ERROR_TITLE' }),
          message + detail,
        );
        return;
      }
      const { unitPrice } = resolveWholesalePrice(product, packs);
      const units = wholesaleUnits(packs, product.wholesalePackSize ?? 0);
      showToastSuccess(
        intl.formatMessage(
          { id: 'SALES.WHOLESALE.SCANNER_ADDED' },
          { name: product.name, packs, units, price: formatCurrency(unitPrice) },
        ),
      );
    });
  }

  // Filtros — mismo criterio que sale.tsx: categoría (tab) Y búsqueda por nombre.
  // Con el switch "Todos" ON la búsqueda recorre TODOS los productos mayoristas;
  // OFF la restringe a los de la categoría seleccionada (paridad con /sales/new).
  const query = searchQuery.trim().toLowerCase();
  const visibleProducts = products.filter((product) => {
    const inCategory =
      selectedCategoryId === ALL_CATEGORIES_ID || product.categoryId === selectedCategoryId;
    const matchesQuery = !query || product.name.toLowerCase().includes(query);
    return inCategory && matchesQuery;
  });

  /** Source de la búsqueda según el switch: ALL = todos los mayoristas, sino la categoría visible. */
  const searchSource = searchAllCategories ? products : visibleProducts;
  const searchedProducts = query
    ? searchSource.filter((product) => product.name.toLowerCase().includes(query))
    : visibleProducts;

  // Solo categorías con productos mayoristas se muestran como tabs (paridad con
  // sale.tsx, que oculta categorías sin productos vendibles).
  const wholesaleCategoryIds = new Set(products.map((p) => p.categoryId));
  const displayableCategories = categories.filter((c) => wholesaleCategoryIds.has(c.id));

  return (
    <Card padding="tight" title={intl.formatMessage({ id: 'SALES.WHOLESALE.HEADER' })}>
      {products.length === 0 ? (
        <InfoBox variant="info" className="text-center">
          {intl.formatMessage({ id: 'SALES.WHOLESALE.EMPTY' })}
        </InfoBox>
      ) : (
        <>
          {/* Búsqueda + scanner + switch "Todos" — mismo toolbar que /sales/new:
              searchbox, botón del scanner y switch de alcance de búsqueda. */}
          <div className="mb-3 flex items-center gap-2">
            <input
              role="searchbox"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={intl.formatMessage({ id: 'SALES.SEARCH_PLACEHOLDER' })}
              className="min-w-0 flex-1 rounded border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="wholesale-search-input"
            />
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              aria-label={intl.formatMessage({ id: 'SCANNER.TITLE' })}
              title={intl.formatMessage({ id: 'SCANNER.TITLE' })}
              data-testid="wholesale-scanner"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-primary transition-colors hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <ScanBarcodeIcon />
            </button>
            <Switch
              checked={searchAllCategories}
              onChange={setSearchAllCategories}
              label={intl.formatMessage({ id: 'SALES.ALL_CATEGORIES' })}
              className="shrink-0"
            />
          </div>

          {/* Filtro por categorías — tabs con el pseudo-tab "Todas", igual que /sales/new.
              Solo categorías con productos mayoristas. */}
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedCategoryId(ALL_CATEGORIES_ID)}
              aria-pressed={selectedCategoryId === ALL_CATEGORIES_ID}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                selectedCategoryId === ALL_CATEGORIES_ID
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              data-testid="wholesale-category-all"
            >
              {intl.formatMessage({ id: 'SALES.ALL_CATEGORIES' })}
            </button>
            {displayableCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setSelectedCategoryId(category.id)}
                aria-pressed={selectedCategoryId === category.id}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  selectedCategoryId === category.id
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                data-testid={`wholesale-category-${category.id}`}
              >
                {category.name}
              </button>
            ))}
          </div>

          {searchedProducts.length === 0 ? (
            <InfoBox variant="info" className="text-center">
              {intl.formatMessage({ id: 'STATISTICS.EMPTY_STATE' })}
            </InfoBox>
          ) : (
            <div className="divide-y divide-border">
              {searchedProducts.map((product) => {
                const packSize = product.wholesalePackSize ?? 0;
                const packs = parseInt(packsByProduct[product.id] ?? '', 10) || 0;
                const { unitPrice, total } = resolveWholesalePrice(product, packs);
                const available = availableUnits(product);
                return (
                  <div key={product.id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      {/* Nombre + disponibilidad entre paréntesis + icono ? — debajo del
                          nombre, como el precio en /sales/new (sale-product-row.tsx). */}
                      <p className="truncate text-sm text-text">{product.name}</p>
                      <p className="flex items-center gap-1 text-xs text-muted">
                        {available !== undefined && <span>({available})</span>}
                        <button
                          type="button"
                          onClick={() => showTiers(product)}
                          aria-label={intl.formatMessage({
                            id: 'SALES.WHOLESALE.TIERS_POPUP_TITLE',
                          })}
                          data-testid={`wholesale-tiers-info-${product.id}`}
                          className="inline-flex align-middle text-text-muted transition-colors hover:text-primary"
                        >
                          <HelpIcon className="h-4 w-4" />
                        </button>
                      </p>
                      {packs > 0 && (
                        <p
                          className="text-xs text-primary"
                          data-testid={`wholesale-quote-${product.id}`}
                        >
                          {packs} × {packSize} × {formatCurrency(unitPrice)} ={' '}
                          {formatCurrency(total)}
                        </p>
                      )}
                    </div>

                    <label className="flex flex-col gap-0.5 text-xs text-muted">
                      {unitName(product)} ({packSize})
                      <input
                        type="number"
                        min={getWholesaleMinPacks(product)}
                        step="any"
                        value={packsByProduct[product.id] ?? ''}
                        onChange={(e) =>
                          setPacksByProduct((prev) => ({ ...prev, [product.id]: e.target.value }))
                        }
                        className="w-20 rounded-md border border-border px-2 py-1 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
                        data-testid={`wholesale-packs-input-${product.id}`}
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => handleAdd(product)}
                      aria-label={intl.formatMessage({ id: 'SALES.WHOLESALE.ADD' })}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-card hover:bg-primary-hover transition-colors"
                      data-testid={`wholesale-add-${product.id}`}
                    >
                      <svg
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                        />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {isScannerOpen && (
        <ScannerModal onScanned={handleScanned} onClose={() => setIsScannerOpen(false)} />
      )}
    </Card>
  );
}

export default WholesalePage;
