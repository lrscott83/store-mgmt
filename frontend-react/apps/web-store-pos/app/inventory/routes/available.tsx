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

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">
        {intl.formatMessage({ id: 'INVENTORY.AVAILABLE.TITLE' })}
      </h1>
      <InventoryProductList categories={categories} />
    </div>
  );
}

export default InventoryAvailablePage;
