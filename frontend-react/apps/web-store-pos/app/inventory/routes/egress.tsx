import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { Product, ProductCategory } from '@store-mgmt/domain';
import { EFeatures, OrderType } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useCartStore } from '~/shared/lib/stores/cart-store';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { hasInventoryModuleAvailable } from '~/shared/lib/auth/authorization-service';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { ProductOfflineService } from '~/sales/lib/services/product-offline-service';
import { ProductCategoryOfflineService } from '~/sales/lib/services/product-category-offline-service';
import { hasAvailableProductToSale } from '~/sales/lib/product-availability';
import { SaleCategoryProducts } from '~/sales/components/sale-category-products';
import { getOrderTypes } from '~/sales/lib/order-type-utils';

export const clientLoader = featureLoader([EFeatures.Egress]);

// Angular's EgressComponent (egress.component.ts:20) is a WHOLESALE (Mayorista) SALE screen,
// NOT a waste/return/transfer/adjustment tracker — it reuses SaleCategoryProductsComponent
// with `orderType = OrderType.Mayorista` as the default plus a full OrderType selector
// (OrderTypeUtils.getOrderTypes()). This mirrors sales/routes/sale.tsx, differing only in the
// default orderType and the presence of the selector (Angular's sale.component.ts hard-codes
// Normal with no selector at all).
const ORDER_TYPE_OPTIONS = getOrderTypes();

export function EgressPage() {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const storeId = user?.selectedStoreId ?? '';
  const addItem = useCartStore((s) => s.addItem);
  const getCartItemQuantity = useCartStore((s) => s.getItemQuantity);

  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);
  const [orderType, setOrderType] = useState<OrderType>(OrderType.Mayorista);

  useEffect(() => {
    const categoryService = new ProductCategoryOfflineService(storeId);
    const productService = new ProductOfflineService(storeId);

    // Angular: getAvailableProductCategories() -> active categories, sorted by order
    const availableCategories = categoryService
      .getAll()
      .filter((c) => c.isActive)
      .sort((a, b) => a.order - b.order);

    setCategories(availableCategories);
    setProducts(productService.getAll());

    if (availableCategories.length > 0) {
      setSelectedCategoryId(availableCategories[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  function selectCategory(category: ProductCategory) {
    setSelectedCategoryId(category.id);
  }

  function handleAdded(productId: string, quantity: number, price: number) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    addItem(product, quantity, orderType, price);
  }

  // 1:1 port of Angular's addProductToCart's inventory check (sale-product-row.component.ts
  // :58-104 -> InventoryOfflineService.hasAvailableProductToSale), identical to sale.tsx —
  // Mayorista sales still deduct inventory through the standard pipeline.
  function checkAvailability(productId: string, quantity: number) {
    const product = products.find((p) => p.id === productId);
    const inventoryService = new InventoryOfflineService(storeId);
    return hasAvailableProductToSale({
      product,
      quantity,
      cartQuantity: getCartItemQuantity(productId),
      hasInventoryModule: user ? hasInventoryModuleAvailable(user) : false,
      inventory: inventoryService.getAvailableQuantity(productId),
    });
  }

  // Angular: getProductsToSaleByCategoryId -> categoryId + isActive + availableToSale,
  // sorted by order (product-category.repository.ts / product.repository.ts equivalents)
  const categoryProducts = selectedCategoryId
    ? products
        .filter((p) => p.categoryId === selectedCategoryId && p.isActive && p.availableToSale)
        .sort((a, b) => a.order - b.order)
    : [];

  return (
    <Card title={intl.formatMessage({ id: 'INVENTORY_EGRESS.HEADER' })}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => selectCategory(category)}
              className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                category.id === selectedCategoryId
                  ? 'bg-primary text-white'
                  : 'bg-primary-light text-primary hover:bg-primary/20'
              }`}
            >
              {category.name}
            </button>
          ))}
        </div>

        {/* Angular: mat-form-field with hardcoded (non-translated) "Tipo" label +
            OrderTypeUtils.getOrderTypes() options (egress.component.html:7-16). */}
        <label className="flex flex-col gap-0.5 text-xs text-text-muted">
          Tipo
          <select
            aria-label="Tipo"
            value={orderType}
            onChange={(e) => setOrderType(Number(e.target.value) as OrderType)}
            className="rounded-md border border-border px-2 py-1 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {ORDER_TYPE_OPTIONS.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <SaleCategoryProducts
        products={categoryProducts}
        orderType={orderType}
        onAdded={handleAdded}
        checkAvailability={checkAvailability}
      />

      {categories.length > 0 && !selectedCategoryId && (
        <InfoBox variant="primary" className="mt-4 text-center">
          {intl.formatMessage({ id: 'SALES.NO_SELECTED_CATEGORY_ALERT_MESSAGE' })}
        </InfoBox>
      )}
    </Card>
  );
}

export default EgressPage;
