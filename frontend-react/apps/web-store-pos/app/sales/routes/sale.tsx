import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import type { Product, ProductCategory } from '@store-mgmt/domain';
import { EFeatures, OrderType } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useCartStore } from '~/shared/lib/stores/cart-store';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { Switch } from '~/shared/components/ui/switch';
import { hasInventoryModuleAvailable } from '~/shared/lib/auth/authorization-service';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { createProductService } from '../lib/services/product-service.factory';
import { createProductCategoryService } from '../lib/services/product-category-service.factory';
import { hasAvailableProductToSale } from '../lib/product-availability';
import { SaleCategoryProducts } from '../components/sale-category-products';

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

  // Angular parity (sale.component.ts:39-40): getAvailableProductCategories() already
  // returns active-only categories sorted by order (ProductCategoryRepository.
  // getAvailableProductCategories) — no manual filter/sort needed.
  useEffect(() => {
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
  useEffect(() => {
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
  useEffect(() => {
    if (categories.length === 0) {
      setAllProducts([]);
      return;
    }
    const productService = createProductService(storeId);
    Promise.all(
      categories.map((category) => productService.getProductsToSaleByCategoryId(category.id)),
    ).then((results) => {
      setAllProducts(results.flatMap((result) => result.data ?? []));
    });
  }, [storeId, categories]);

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
    addItem(product, quantity, OrderType.Normal, price);
  }

  // 1:1 port of Angular's addProductToCart's inventory check (sale-product-row.component.ts
  // :58-104 -> InventoryOfflineService.hasAvailableProductToSale). Includes the cart's
  // existing quantity for this product (Angular's shoppingCartService.getCartItemQuantity)
  // and is gated by hasInventoryModuleAvailable + product.discountFromInvantory internally.
  function checkAvailability(productId: string, quantity: number) {
    const product = displayedProducts.find((p) => p.id === productId);
    const inventoryService = new InventoryOfflineService(
      storeId,
      new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
    );
    return hasAvailableProductToSale({
      product,
      quantity,
      cartQuantity: getCartItemQuantity(productId),
      hasInventoryModule: user ? hasInventoryModuleAvailable(user) : false,
      inventory: inventoryService.getAvailableQuantity(productId),
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
        <Switch
          checked={searchAllCategories}
          onChange={setSearchAllCategories}
          label={intl.formatMessage({ id: 'SALES.ALL_CATEGORIES' })}
          className="shrink-0"
        />
      </div>
      <div className="no-scrollbar mb-3 flex gap-1 overflow-x-auto pb-1">
        {categories.length > 0 && (
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
        {categories.map((category) => (
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
      />

      {categories.length > 0 && !selectedCategoryId && (
        <InfoBox variant="primary" className="mt-4 text-center">
          {/* SALES.NO_SELECTED_CATEGORY_ALERT_MESSAGE */}
          {intl.formatMessage({ id: 'SALES.NO_SELECTED_CATEGORY_ALERT_MESSAGE' })}
        </InfoBox>
      )}
    </Card>
  );
}

export default SalePage;
