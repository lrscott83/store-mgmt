import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { Product, ProductCategory } from '@store-mgmt/domain';
import { EFeatures, OrderType } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useCartStore } from '~/shared/lib/stores/cart-store';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { ProductOfflineService } from '../lib/services/product-offline-service';
import { ProductCategoryOfflineService } from '../lib/services/product-category-offline-service';
import { SaleCategoryProducts } from '../components/sale-category-products';

export const clientLoader = featureLoader([EFeatures.Sale]);

// Angular's SaleComponent hard-codes orderType = OrderType.Normal (sale.component.ts:27) —
// no order-type selector exists on this screen, so React mirrors that fixed value.
const ORDER_TYPE = OrderType.Normal;

export function SalePage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const addItem = useCartStore((s) => s.addItem);

  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);

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

  function handleAdded(productId: string, quantity: number) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    addItem(product, quantity);
  }

  // Angular: getProductsToSaleByCategoryId -> categoryId + isActive + availableToSale,
  // sorted by order (product-category.repository.ts / product.repository.ts equivalents)
  const categoryProducts = selectedCategoryId
    ? products
        .filter((p) => p.categoryId === selectedCategoryId && p.isActive && p.availableToSale)
        .sort((a, b) => a.order - b.order)
    : [];

  return (
    <Card title={intl.formatMessage({ id: 'SALES.HEADER' })}>
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
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

      <SaleCategoryProducts products={categoryProducts} orderType={ORDER_TYPE} onAdded={handleAdded} />

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
