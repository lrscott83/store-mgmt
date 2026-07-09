import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { Card } from '~/shared/components/ui/card';
import { InventoryOfflineService } from '../lib/services/inventory-offline-service';
import type { InventoryCategoryView } from '../lib/services/inventory-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { createProductService } from '~/sales/lib/services/product-service.factory';
import { ProductCategoryOfflineService } from '~/sales/lib/services/product-category-offline-service';
import { InventoryProductList } from '../components/inventory-product-list';

export const clientLoader = featureLoader([EFeatures.Available]);

export function InventoryAvailablePage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [categories, setCategories] = useState<InventoryCategoryView[]>([]);

  useEffect(() => {
    const inventorySvc = new InventoryOfflineService(
      storeId,
      new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
    );
    const productSvc = createProductService(storeId);
    const categorySvc = new ProductCategoryOfflineService(storeId);

    async function loadData() {
      // WU10 (product-service-parity Flag #1, minimal in-scope fix): categorySvc.getAll() /
      // productSvc.getAll() dropped (Exact-Surface Rule, no bare getAll on the async surface).
      // getProductCategories() is offline-only, ALL categories, same unfiltered set as before —
      // zero behavior change. Products are fetched per-category via
      // getAvailableProductsByCategoryId (isActive-only) and flattened back into one array,
      // preserving the pre-existing enrichment logic unchanged.
      const catsResult = await categorySvc.getProductCategories();
      const cats = catsResult.data ?? [];

      const productLists = await Promise.all(
        cats.map((c) => productSvc.getAvailableProductsByCategoryId(c.id)),
      );
      const products = productLists.flatMap((r) => r.data ?? []);

      // Build enriched product list for getAvailableByCategory
      const enriched = products.map((p) => ({
        id: p.id,
        name: p.name,
        categoryId: p.categoryId,
        categoryName: cats.find((c) => c.id === p.categoryId)?.name ?? '',
      }));

      // WU3 (category B): getAvailableByCategory now returns
      // BaseResponseModel<InventoryCategoryView[]> (was a bare array) — unwrap `.data`.
      setCategories(inventorySvc.getAvailableByCategory(enriched).data);
    }

    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // Header total inventory value — Angular's InventoryAvailableComponent.getInventoryCostTotal()
  // (inventory-available.component.ts:38-40): sums totalCostPrice across the currently loaded
  // categories, NOT a separate service call to InventoryOfflineService.getInventoryCostTotal()
  // (which the Angular component does not actually invoke from this screen).
  const totalInventoryValue = categories.reduce((sum, cat) => sum + cat.totalCostPrice, 0);

  return (
    <Card
      title={
        <div className="flex items-center justify-between">
          <span>{intl.formatMessage({ id: 'INVENTORY.AVAILABLE.TITLE' })}</span>
          <span className="text-lg font-bold text-primary">
            ${totalInventoryValue.toFixed(2)}
          </span>
        </div>
      }
    >
      <InventoryProductList categories={categories} />
    </Card>
  );
}

export default InventoryAvailablePage;
