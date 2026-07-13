import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { Card } from '~/shared/components/ui/card';
import { Spinner } from '~/shared/components/ui/spinner';
import { EmptyBoxesIcon } from '~/shared/components/ui/icons';
import { InventoryOfflineService } from '../lib/services/inventory-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';

export const clientLoader = featureLoader([EFeatures.InventoryTodayQuantities]);

/**
 * Angular parity: inventory-today-quantities.component.ts:57-137.
 * Product set: `.filter(p => p.isActive && p.availableToSale)` (line 63).
 * Per product: disponible = availableProduct?.quantity ?? 0 (line 90);
 * entradas = sum(today entries for product) (line 92);
 * vendido = sum(today order items for product) (line 93);
 * inicio = disponible + vendido - entradas (line 94);
 * final = disponible - vendido (line 95).
 * Rows grouped by category, ordered by category.order then product.order (lines 64-69, 118-134).
 */
interface ProductQuantityRow {
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  inicio: number;
  entradas: number;
  disponible: number;
  vendido: number;
  final: number;
}

interface CategoryGroup {
  categoryId: string;
  categoryName: string;
  products: ProductQuantityRow[];
}

export function InventoryTodayQuantitiesPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  // Angular parity: inventory-today-quantities.component.html `isLoading` branch
  // (spinner-border + "Cargando" while data loads).
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const categoryRepository = new ProductCategoryRepository(storeId);
    const productRepository = new ProductRepository(storeId, categoryRepository);
    const inventorySvc = new InventoryOfflineService(storeId, productRepository);
    const orderSvc = new OrderOfflineService(storeId);

    const today = new Date();

    // Angular line 139-142: getCategoryOrder — falls back to 999 when category not found.
    // Angular's category SERVICE never had this method (product-category.service.ts:21
    // commented out) — ONLY the repository exposes getProductCategoryById, so this reads the
    // repository directly (SYNC, no envelope needed).
    const getCategoryOrder = (categoryId: string): number =>
      categoryRepository.getProductCategoryById(categoryId)?.order ?? 999;

    // Angular lines 62-69: active & availableToSale products, sorted by category order then
    // product order.
    const products = [...productRepository.getStorageProductsMap().values()]
      .filter((p) => p.isActive && p.availableToSale)
      .sort((a, b) => {
        const catOrderA = getCategoryOrder(a.categoryId);
        const catOrderB = getCategoryOrder(b.categoryId);
        if (catOrderA !== catOrderB) return catOrderA - catOrderB;
        return a.order - b.order;
      });

    // Angular line 72: today's active orders.
    const todayOrders = orderSvc.getActiveOrdersInDay(today);

    // Angular line 75: today's inventory entries.
    // WU3 (service-return-shape-parity Slice 1, category B): getInventoryEntriesInDay now
    // returns BaseResponseModel<InventoryEntryView[]> (was a bare array) — unwrap `.data`.
    // Fase 4: renamed from getByDate (date arg ignored — always returns today).
    const todayEntries = inventorySvc.getInventoryEntriesInDay(today).data;

    // Angular lines 78-81: getInventoryCategoriesView() — zero-arg (Fase 4 GATE-B), sources
    // each product's `disponible` quantity by grouping the service's own active entries; the
    // `enriched` products array is no longer needed as an input.
    const availableByProduct = new Map<string, number>();
    for (const cat of inventorySvc.getInventoryCategoriesView().data) {
      for (const prod of cat.products) {
        availableByProduct.set(prod.productId, prod.totalAvailable);
      }
    }

    // Angular lines 84-108: build per-product quantities.
    const productQuantities: ProductQuantityRow[] = products.map((prod) => {
      const orderItems = todayOrders
        .flatMap((o) => o.orderItems)
        .filter((oi) => oi.productId === prod.id);

      const productTodayEntries = todayEntries.filter((e) => e.productId === prod.id);

      const disponible = availableByProduct.get(prod.id) ?? 0;
      const entradas = productTodayEntries.reduce((total, e) => total + e.quantity, 0);
      const vendido = orderItems.reduce((total, oi) => total + oi.quantity, 0);
      const inicio = disponible + vendido - entradas;
      const final = disponible - vendido;

      return {
        productId: prod.id,
        productName: prod.name,
        categoryId: prod.categoryId,
        categoryName: prod.categoryName,
        inicio,
        entradas,
        disponible,
        vendido,
        final,
      };
    });

    // Angular lines 110-134: group by category, ordered by category order, products ordered
    // by product.order within each category.
    const seenCategories = new Map<string, ProductQuantityRow>();
    for (const pq of productQuantities) {
      if (!seenCategories.has(pq.categoryId)) seenCategories.set(pq.categoryId, pq);
    }

    const groups: CategoryGroup[] = Array.from(seenCategories.values())
      .sort((a, b) => getCategoryOrder(a.categoryId) - getCategoryOrder(b.categoryId))
      .map((pq) => ({
        categoryId: pq.categoryId,
        categoryName: pq.categoryName,
        products: productQuantities
          .filter((p) => p.categoryId === pq.categoryId)
          .sort((a, b) => {
            const prodA = products.find((p) => p.id === a.productId);
            const prodB = products.find((p) => p.id === b.productId);
            return (prodA?.order ?? 0) - (prodB?.order ?? 0);
          }),
      }));

    setCategoryGroups(groups);
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const isEmpty = categoryGroups.length === 0;
  const allProducts = categoryGroups.flatMap((category) =>
    category.products.map((product) => ({ category, product })),
  );

  return (
    <Card title={intl.formatMessage({ id: 'INVENTORY.QUANTITIES.TITLE' })}>
      {isLoading ? (
        <Spinner label={intl.formatMessage({ id: 'GENERAL.LOADING' })} />
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-text-muted">
          <EmptyBoxesIcon className="text-text-muted" />
          <p>{intl.formatMessage({ id: 'INVENTORY.QUANTITIES.NO_PRODUCTS' })}</p>
        </div>
      ) : (
        <>
          {/* Desktop/Tablet Table View — Angular parity: .desktop-view (>=768px). */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-background">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-text-muted">
                    {intl.formatMessage({ id: 'INVENTORY.QUANTITIES.PRODUCT' })}
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-text-muted">
                    {intl.formatMessage({ id: 'INVENTORY.QUANTITIES.BEGINNING' })}
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-text-muted">
                    {intl.formatMessage({ id: 'INVENTORY.QUANTITIES.ENTRIES' })}
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-text-muted">
                    {intl.formatMessage({ id: 'INVENTORY.QUANTITIES.AVAILABLE' })}
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-text-muted">
                    {intl.formatMessage({ id: 'INVENTORY.QUANTITIES.SOLD' })}
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-text-muted">
                    {intl.formatMessage({ id: 'INVENTORY.QUANTITIES.ENDING' })}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {categoryGroups.map((category) =>
                  category.products.map((product) => (
                    <tr key={product.productId} className="hover:bg-background">
                      <td className="px-4 py-3 font-medium text-text">
                        {category.categoryName} - {product.productName}
                      </td>
                      <td
                        className={`px-4 py-3 text-right ${
                          product.inicio < 0 ? 'text-danger' : 'text-text-muted'
                        }`}
                      >
                        {product.inicio}
                      </td>
                      <td
                        className={`px-4 py-3 text-right ${
                          product.entradas > 0 ? 'text-success' : 'text-text-muted'
                        }`}
                      >
                        {product.entradas}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-text">
                        {product.disponible}
                      </td>
                      <td
                        className={`px-4 py-3 text-right ${
                          product.vendido > 0 ? 'font-semibold text-warning' : 'text-text-muted'
                        }`}
                      >
                        {product.vendido}
                      </td>
                      <td
                        className={`px-4 py-3 text-right ${
                          product.final < 0 ? 'font-semibold text-danger' : 'text-text-muted'
                        }`}
                      >
                        {product.final}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View — Angular parity: .mobile-view (<768px), 5-item quantity grid. */}
          <div className="space-y-3 md:hidden">
            {allProducts.map(({ category, product }) => (
              <div
                key={product.productId}
                className="rounded-lg border border-border bg-background p-3"
              >
                <p className="mb-2 font-medium text-text">
                  {category.categoryName} - {product.productName}
                </p>
                <div className="grid grid-cols-5 gap-2 text-center text-xs">
                  <div>
                    <p className="text-text-muted">
                      {intl.formatMessage({ id: 'INVENTORY.QUANTITIES.BEGINNING' })}
                    </p>
                    <p className={product.inicio < 0 ? 'text-danger' : 'text-text'}>
                      {product.inicio}
                    </p>
                  </div>
                  <div>
                    <p className="text-text-muted">
                      {intl.formatMessage({ id: 'INVENTORY.QUANTITIES.ENTRIES' })}
                    </p>
                    <p className={product.entradas > 0 ? 'font-semibold text-success' : 'text-text'}>
                      {product.entradas}
                    </p>
                  </div>
                  <div>
                    <p className="text-text-muted">
                      {intl.formatMessage({ id: 'INVENTORY.QUANTITIES.AVAILABLE' })}
                    </p>
                    <p className="font-semibold text-text">{product.disponible}</p>
                  </div>
                  <div>
                    <p className="text-text-muted">
                      {intl.formatMessage({ id: 'INVENTORY.QUANTITIES.SOLD' })}
                    </p>
                    <p className={product.vendido > 0 ? 'font-semibold text-warning' : 'text-text'}>
                      {product.vendido}
                    </p>
                  </div>
                  <div>
                    <p className="text-text-muted">
                      {intl.formatMessage({ id: 'INVENTORY.QUANTITIES.ENDING' })}
                    </p>
                    <p className={product.final < 0 ? 'font-semibold text-danger' : 'text-text'}>
                      {product.final}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

export default InventoryTodayQuantitiesPage;
