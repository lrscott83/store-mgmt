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

    // WU3 (category B): getInventoryCategoriesView now returns
    // BaseResponseModel<InventoryCategoryView[]> (was a bare array) — unwrap `.data`.
    // Fase 4 (GATE-B): renamed from getAvailableByCategory, now zero-arg — the service itself
    // groups its own active entries and sources product/category names internally (via
    // ProductRepository / ProductRepository.getCategoryRepository()), so the category/product
    // fetching this page used to do purely to build the `enriched` array is no longer needed.
    const response = inventorySvc.getInventoryCategoriesView();
    // InventoryOfflineService.getInventoryCategoriesView is a sync local-storage read that
    // never actually fails; this guard exists for the type only.
    if (!response.succeeded) return;
    setCategories(response.data);
  }, [storeId]);

  // Header total inventory value — Angular's InventoryAvailableComponent.getInventoryCostTotal()
  // (inventory-available.component.ts:38-40): sums totalCostPrice across the currently loaded
  // categories, NOT a separate service call to InventoryOfflineService.getInventoryCostTotal()
  // (which the Angular component does not actually invoke from this screen).
  const totalInventoryValue = categories.reduce((sum, cat) => sum + cat.totalCostPrice, 0);

  return (
    <Card
      padding="tight"
      title={
        <div className="flex items-center justify-between">
          <span>{intl.formatMessage({ id: 'INVENTORY.AVAILABLE.TITLE' })}</span>
          <span className="text-lg font-bold text-primary">
            ${totalInventoryValue.toFixed(2)}
          </span>
        </div>
      }
    >
      {/* Angular parity (InventoryAvailableComponent): INVENTORY.NO_ENTRY_FOUND is shown when
          there are zero categories at all; the per-category/search empty message
          (INVENTORY.CATEGORY_PRODUCT_NO_FOUND, owned by InventoryProductList) only applies
          once at least one category exists. */}
      {categories.length === 0 ? (
        <div className="py-8 text-center text-text-muted">
          {intl.formatMessage({ id: 'INVENTORY.NO_ENTRY_FOUND' })}
        </div>
      ) : (
        <InventoryProductList categories={categories} />
      )}
    </Card>
  );
}

export default InventoryAvailablePage;
