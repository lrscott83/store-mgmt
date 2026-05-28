import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { Product, ProductCategory } from '@store-mgmt/domain';
import { EFeatures, PaymentType } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useCartStore } from '~/shared/lib/stores/cart-store';
import { ProductOfflineService } from '../lib/services/product-offline-service';
import { ProductCategoryOfflineService } from '../lib/services/product-category-offline-service';
import { SaleCategoryProducts } from '../components/sale-category-products';
import { QuickSaleScanner } from '../components/quick-sale-scanner';
import { useEffect } from 'react';

export const loader = featureLoader([EFeatures.Sale]);

export function SalePage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const { items, addItem, updateQuantity } = useCartStore((s) => ({
    items: s.items,
    addItem: s.addItem,
    updateQuantity: s.updateQuantity,
  }));

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);

  useEffect(() => {
    const productService = new ProductOfflineService(storeId);
    const categoryService = new ProductCategoryOfflineService(storeId);
    const allProducts = productService.getAll();
    const allCategories = categoryService.getAll().sort((a, b) => a.order - b.order);
    setProducts(allProducts);
    setCategories(allCategories);
    if (allCategories.length > 0 && !activeTab) {
      setActiveTab(allCategories[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // Build a map of productId → quantity in cart
  const cartQtyMap: Record<string, number> = {};
  for (const item of items) {
    cartQtyMap[item.product.id] = item.quantity;
  }

  const activeCategory = categories.find((c) => c.id === activeTab) ?? categories[0];

  function handleIncrease(productId: string) {
    const current = cartQtyMap[productId] ?? 0;
    updateQuantity(productId, current + 1);
  }

  function handleDecrease(productId: string) {
    const current = cartQtyMap[productId] ?? 0;
    updateQuantity(productId, current - 1);
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{intl.formatMessage({ id: 'MENU.SALE' })}</h1>
        <button
          onClick={() => setScannerVisible((v) => !v)}
          className="rounded border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          {intl.formatMessage({ id: 'SCANNER.SCANNING' })}
        </button>
      </div>

      {scannerVisible && (
        <div className="rounded border bg-gray-50 p-3">
          <QuickSaleScanner />
        </div>
      )}

      {/* Category tabs */}
      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveTab(cat.id)}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTab === cat.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Products grid */}
      {activeCategory && (
        <SaleCategoryProducts
          category={activeCategory}
          products={products}
          cartQtyMap={cartQtyMap}
          onAdd={addItem}
          onIncrease={handleIncrease}
          onDecrease={handleDecrease}
        />
      )}
    </div>
  );
}

export default SalePage;
