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
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { createProductService } from '~/sales/lib/services/product-service.factory';
import { createProductCategoryService } from '~/sales/lib/services/product-category-service.factory';
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

  // Angular parity (egress.component.ts / sale.component.ts:39-40): getAvailableProductCategories()
  // already returns active-only categories sorted by order (ProductCategoryRepository.
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // Angular parity (sale-category-products.component.ts:31-43): refetches
  // getProductsToSaleByCategoryId every time the selected category changes — `products` is
  // CATEGORY-SCOPED (only the selected category's sellable products), matching Angular's
  // `products$`, not a client-side filter over a flat list.
  useEffect(() => {
    if (!selectedCategoryId) {
      setProducts([]);
      return;
    }
    const productService = createProductService(storeId);
    productService.getProductsToSaleByCategoryId(selectedCategoryId).then((result) => {
      setProducts(result.data ?? []);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, selectedCategoryId]);

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

  // Angular: mat-form-field with hardcoded (non-translated) "Tipo" label +
  // OrderTypeUtils.getOrderTypes() options, rendered in the card-toolbar / top-right
  // (egress.component.html:6-17).
  const typeSelector = (
    <label className="flex items-center gap-2 text-xs text-text-muted">
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
  );

  return (
    <Card padding="tight" title={intl.formatMessage({ id: 'INVENTORY_EGRESS.HEADER' })} headerAction={typeSelector}>
      {/* Category scrollmenu — 1:1 with the Sale screen (sale.tsx): smaller buttons,
          hidden scrollbar (Angular's `scrollmenu no-scrollbar`, egress.component.html:21). */}
      <div className="no-scrollbar mb-3 flex gap-1 overflow-x-auto pb-1">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => selectCategory(category)}
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
        products={products}
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
