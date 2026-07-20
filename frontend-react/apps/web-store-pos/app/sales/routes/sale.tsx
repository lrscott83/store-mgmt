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
import { createProductService } from '../lib/services/product-service.factory';
import { createProductCategoryService } from '../lib/services/product-category-service.factory';
import { hasAvailableProductToSale } from '../lib/product-availability';
import { SaleCategoryProducts } from '../components/sale-category-products';

export const clientLoader = featureLoader([EFeatures.Sale]);

// Angular's SaleComponent hard-codes orderType = OrderType.Normal (sale.component.ts:27) —
// no order-type selector exists on this screen, so React mirrors that fixed value.
const ORDER_TYPE = OrderType.Normal;

export function SalePage() {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const storeId = user?.selectedStoreId ?? '';
  const addItem = useCartStore((s) => s.addItem);
  const getCartItemQuantity = useCartStore((s) => s.getItemQuantity);

  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);

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
    addItem(product, quantity, OrderType.Normal, price);
  }

  // 1:1 port of Angular's addProductToCart's inventory check (sale-product-row.component.ts
  // :58-104 -> InventoryOfflineService.hasAvailableProductToSale). Includes the cart's
  // existing quantity for this product (Angular's shoppingCartService.getCartItemQuantity)
  // and is gated by hasInventoryModuleAvailable + product.discountFromInvantory internally.
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

  return (
    <Card title={intl.formatMessage({ id: 'SALES.HEADER' })}>
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
