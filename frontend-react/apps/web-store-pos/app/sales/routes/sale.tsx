import { useEffect, useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import type { Product, ProductCategory } from '@store-mgmt/domain';
import { EFeatures, OrderType, ProductErrors } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useCartStore } from '~/shared/lib/stores/cart-store';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { Switch } from '~/shared/components/ui/switch';
import { ScanBarcodeIcon } from '~/shared/components/ui/icons';
import { showBlockingError } from '~/shared/lib/blocking-alert';
import { showToastError, showToastSuccess } from '~/shared/lib/toast';
import { hasInventoryModuleAvailable } from '~/shared/lib/auth/authorization-service';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { createProductService } from '../lib/services/product-service.factory';
import { createProductCategoryService } from '../lib/services/product-category-service.factory';
import { hasAvailableProductToSale } from '../lib/product-availability';
import { SaleCategoryProducts } from '../components/sale-category-products';
import { ScannerModal } from '../components/scanner-modal';

export const clientLoader = featureLoader([EFeatures.Sale]);

// Angular's SaleComponent hard-codes orderType = OrderType.Normal (sale.component.ts:27) —
// no order-type selector exists on this screen, so React mirrors that fixed value.
const ORDER_TYPE = OrderType.Normal;

/** Sentinel id for the "Todos" pseudo-category: all sellable products ordered by category order then product order. */
const ALL_CATEGORIES_ID = 'all';

export function SalePage() {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const storeId = user?.selectedStoreId ?? '';
  const addItem = useCartStore((s) => s.addItem);
  const getCartItemQuantity = useCartStore((s) => s.getItemQuantity);

  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchAllCategories, setSearchAllCategories] = useState(true);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  // Tracks category IDs that have at least one product available to sale.
  // Updated by a useEffect; categories with no sellable products are hidden from tabs.
  const [sellableCategoryIds, setSellableCategoryIds] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const sellableLoadedRef = useRef(false);

  // Angular parity (sale.component.ts:39-40): getAvailableProductCategories() already
  // returns active-only categories sorted by order (ProductCategoryRepository.
  // getAvailableProductCategories) — no manual filter/sort needed.
  //
  // logout() (auth-store.ts:471) releases the DEK and nulls the user synchronously,
  // and only then redirects — through /login's async guestOnlyLoader, so this page
  // is still mounted when storeId (above) falls back to ''. Its re-fired load then
  // reaches the repositories' storage reads with no DEK in memory and throws
  // MissingDataKeyError, whose blocking alert outlives the navigation to sit on top
  // of the login screen (the user-reported logout bug, reproduced by
  // e2e/logout-silent-dbg.spec.ts). An unselected store has nothing to load.
  // Same guard as products.tsx:85 for the same race.
  useEffect(() => {
    if (!storeId) return;
    const categoryService = createProductCategoryService(storeId);
    categoryService.getAvailableProductCategories().then((result) => {
      const availableCategories = result.data ?? [];
      setCategories(availableCategories);
      if (availableCategories.length > 0) {
        setSelectedCategoryId(availableCategories[0].id);
      }
    });
  }, [storeId]);

  // Angular parity (sale-category-products.component.ts:31-43): refetches
  // getProductsToSaleByCategoryId every time the selected category changes — `products` is
  // CATEGORY-SCOPED (only the selected category's sellable products), matching Angular's
  // `products$`, not a client-side filter over a flat list.
  // `!storeId`: mid-logout re-fire — see the first effect's comment.
  useEffect(() => {
    if (!storeId) return;
    if (!selectedCategoryId || selectedCategoryId === ALL_CATEGORIES_ID) {
      setProducts([]);
      return;
    }
    const productService = createProductService(storeId);
    productService.getProductsToSaleByCategoryId(selectedCategoryId).then((result) => {
      setProducts(result.data ?? []);
    });
  }, [storeId, selectedCategoryId]);

  // "Todos" support: concatenate every category's sellable products in category order. The
  // per-category lists already arrive sorted by product order, so the combined list is
  // ordered by category order then product order (React-only feature, no Angular correlate).
  // `!storeId`: mid-logout re-fire — see the first effect's comment.
  useEffect(() => {
    if (!storeId) return;
    if (categories.length === 0) {
      setAllProducts([]);
      return;
    }
    const productService = createProductService(storeId);
    Promise.all(
      categories.map((category) => productService.getProductsToSaleByCategoryId(category.id)),
    ).then((results) => {
      setAllProducts(results.flatMap((result) => result.data ?? []));
      // Update sellable category IDs from the results
      const sellableIds = new Set<string>();
      for (const result of results) {
        const products = result.data ?? [];
        for (const product of products) {
          sellableIds.add(product.categoryId);
        }
      }
      setSellableCategoryIds(sellableIds);
      sellableLoadedRef.current = true;
    });
  }, [storeId, categories]);

  // Derived: filter out categories that have no products available to sell.
  const displayableCategories = useMemo(() => {
    if (!sellableLoadedRef.current) return categories;
    return categories.filter((c) => sellableCategoryIds.has(c.id));
  }, [categories, sellableCategoryIds]);

  // Auto-select the first sellable category if the current selection was filtered out
  useEffect(() => {
    if (
      selectedCategoryId &&
      selectedCategoryId !== ALL_CATEGORIES_ID &&
      sellableCategoryIds.size > 0 &&
      !sellableCategoryIds.has(selectedCategoryId)
    ) {
      const firstAvailable = displayableCategories[0];
      setSelectedCategoryId(firstAvailable?.id);
    }
  }, [selectedCategoryId, sellableCategoryIds, displayableCategories]);

  function selectCategory(categoryId: string) {
    setSelectedCategoryId(categoryId);
  }

  const displayedProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const baseProducts = selectedCategoryId === ALL_CATEGORIES_ID ? allProducts : products;
    if (!query) return baseProducts;
    const source = searchAllCategories ? allProducts : baseProducts;
    return source.filter((product) => product.name.toLowerCase().includes(query));
  }, [allProducts, products, selectedCategoryId, searchQuery, searchAllCategories]);


  function handleAdded(productId: string, quantity: number, price: number) {
    const product = displayedProducts.find((p) => p.id === productId);
    if (!product) return;
    addProductToSale(product, quantity, price);
  }

  const inventoryService = useMemo(
    () =>
      new InventoryOfflineService(
        storeId,
        new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
      ),
    [storeId],
  );

  const hasInventoryModule = user ? hasInventoryModuleAvailable(user) : false;

  /** Mapa productId → cantidad disponible (solo para productos que descuentan inventario
   * y que tienen entradas registradas; sin entradas no se muestra nada). */
  const availableByProductId = useMemo(() => {
    if (!hasInventoryModule) return {};
    const map: Record<string, number> = {};
    for (const product of displayedProducts) {
      if (!product.discountFromInvantory) continue;
      const quantity = inventoryService.getAvailableQuantity(product.id);
      if (quantity.hasEntries) map[product.id] = quantity.available;
    }
    return map;
  }, [displayedProducts, hasInventoryModule, inventoryService]);

  /** Shared inventory gate — 1:1 port of Angular's addProductToCart check
   * (sale-product-row.component.ts:58-104 -> hasAvailableProductToSale),
   * including the cart's existing quantity and the inventory-module +
   * discountFromInvantory gate living inside the predicate itself. */
  function availabilityGate(product: Product | undefined, productId: string, quantity: number) {
    return hasAvailableProductToSale({
      product,
      quantity,
      cartQuantity: getCartItemQuantity(productId),
      hasInventoryModule,
      inventory: inventoryService.getAvailableQuantity(productId),
    });
  }

  function checkAvailability(productId: string, quantity: number) {
    const product = displayedProducts.find((p) => p.id === productId);
    return availabilityGate(product, productId, quantity);
  }

  /**
   * SHARED add-to-sale chokepoint — the manual row add (via handleAdded)
   * and the barcode scanner both land here: gate, then add. Zero behavior
   * change for the manual path (the row pre-checks with checkAvailability;
   * the gate is pure, so re-running it here is deterministic).
   */
  function addProductToSale(product: Product, quantity: number, price?: number) {
    const availability = availabilityGate(product, product.id, quantity);
    if (!availability.succeeded) {
      return availability;
    }
    addItem(product, quantity, OrderType.Normal, price ?? product.price);
    return availability;
  }

  /**
   * Scanner flow: barcode -> lookup -> sellability -> the SAME shared
   * addProductToSale gate as the manual add. The repository's barcode
   * lookup does NOT filter isActive/availableToSale (unlike the
   * category-scoped sellable query the manual rows come from), so the
   * scanner must check both before adding — a non-sellable product gets
   * its own message, NOT "not found", so the merchant knows the barcode
   * works but the product can't be sold.
   */
  function handleScanned(barcode: string) {
    const productService = createProductService(storeId);
    productService.getProductByBarcode(barcode).then((result) => {
      const product = result.data;
      if (!product) {
        showToastError(intl.formatMessage({ id: 'SCANNER.PRODUCT_NOT_FOUND' }, { barcode }));
        return;
      }
      if (!product.isActive || !product.availableToSale) {
        showToastError(intl.formatMessage({ id: 'SCANNER.PRODUCT_NOT_SELLABLE' }, { name: product.name }));
        return;
      }
      const availability = addProductToSale(product, 1);
      if (!availability.succeeded) {
        // Same blocking-alert contract as the manual row add
        // (sale-product-row.tsx:44-45).
        const message =
          availability.errors[0]?.description ?? ProductErrors.ProductNotAvailable.description;
        showBlockingError(intl.formatMessage({ id: 'GENERAL.RESPONSE.ERROR_TITLE' }), message);
        return;
      }
      showToastSuccess(intl.formatMessage({ id: 'SCANNER.PRODUCT_ADDED' }, { name: product.name }));
    });
  }

  return (
    <Card padding="tight" title={intl.formatMessage({ id: 'SALES.HEADER' })}>
      <div className="mb-3 flex items-center gap-2">
        <input
          role="searchbox"
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={intl.formatMessage({ id: 'SALES.SEARCH_PLACEHOLDER' })}
          className="min-w-0 flex-1 rounded border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="button"
          onClick={() => setIsScannerOpen(true)}
          aria-label={intl.formatMessage({ id: 'SCANNER.TITLE' })}
          title={intl.formatMessage({ id: 'SCANNER.TITLE' })}
          data-testid="quick-sale-scanner"
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
      <div className="no-scrollbar mb-3 flex gap-1 overflow-x-auto pb-1">
        {displayableCategories.length > 0 && (
          <button
            key={ALL_CATEGORIES_ID}
            type="button"
            onClick={() => selectCategory(ALL_CATEGORIES_ID)}
            className={`whitespace-nowrap rounded-md px-1 py-2 text-sm font-medium transition-colors ${
              selectedCategoryId === ALL_CATEGORIES_ID
                ? 'bg-primary text-white'
                : 'bg-primary-light text-primary hover:bg-primary/20'
            }`}
          >
            {intl.formatMessage({ id: 'SALES.ALL_CATEGORIES' })}
          </button>
        )}
        {displayableCategories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => selectCategory(category.id)}
            className={`whitespace-nowrap rounded-md px-1 py-2 text-sm font-medium transition-colors ${
              category.id === selectedCategoryId
                ? 'bg-primary text-white'
                : 'bg-primary-light text-primary hover:bg-primary/20'
            }`}
          >
            {category.name}
          </button>
        ))}
      </div>

      <SaleCategoryProducts
        products={displayedProducts}
        orderType={ORDER_TYPE}
        onAdded={handleAdded}
        checkAvailability={checkAvailability}
        availableByProductId={availableByProductId}
      />

      {displayableCategories.length > 0 && !selectedCategoryId && (
        <InfoBox variant="primary" className="mt-4 text-center">
          {/* SALES.NO_SELECTED_CATEGORY_ALERT_MESSAGE */}
          {intl.formatMessage({ id: 'SALES.NO_SELECTED_CATEGORY_ALERT_MESSAGE' })}
        </InfoBox>
      )}
      {isScannerOpen && (
        <ScannerModal onScanned={handleScanned} onClose={() => setIsScannerOpen(false)} />
      )}
    </Card>
  );
}

export default SalePage;
