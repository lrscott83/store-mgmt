import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { InventoryOfflineService } from '../lib/services/inventory-offline-service';
import type { InventoryCategoryView } from '../lib/services/inventory-offline-service';
import { ProductOfflineService } from '~/sales/lib/services/product-offline-service';
import { ProductCategoryOfflineService } from '~/sales/lib/services/product-category-offline-service';
import { InventoryProductList } from '../components/inventory-product-list';

export const clientLoader = featureLoader([EFeatures.Available]);

export function InventoryAvailablePage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [categories, setCategories] = useState<InventoryCategoryView[]>([]);

  useEffect(() => {
    const inventorySvc = new InventoryOfflineService(storeId);
    const productSvc = new ProductOfflineService(storeId);
    const categorySvc = new ProductCategoryOfflineService(storeId);

    const products = productSvc.getAll();
    const cats = categorySvc.getAll();

    // Build enriched product list for getAvailableByCategory
    const enriched = products.map((p) => ({
      id: p.id,
      name: p.name,
      categoryId: p.categoryId,
      categoryName: cats.find((c) => c.id === p.categoryId)?.name ?? '',
    }));

    setCategories(inventorySvc.getAvailableByCategory(enriched));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // Header total inventory value — Angular's InventoryAvailableComponent.getInventoryCostTotal()
  // (inventory-available.component.ts:38-40): sums totalCostPrice across the currently loaded
  // categories, NOT a separate service call to InventoryOfflineService.getInventoryCostTotal()
  // (which the Angular component does not actually invoke from this screen).
  const totalInventoryValue = categories.reduce((sum, cat) => sum + cat.totalCostPrice, 0);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {intl.formatMessage({ id: 'INVENTORY.AVAILABLE.TITLE' })}
        </h1>
        <span className="text-lg font-bold text-primary">${totalInventoryValue.toFixed(2)}</span>
      </div>
      <InventoryProductList categories={categories} />
    </div>
  );
}

export default InventoryAvailablePage;
