import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { InventoryOfflineService } from '../lib/services/inventory-offline-service';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { ProductOfflineService } from '~/sales/lib/services/product-offline-service';
import { ProductCategoryOfflineService } from '~/sales/lib/services/product-category-offline-service';

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

  useEffect(() => {
    const inventorySvc = new InventoryOfflineService(storeId);
    const orderSvc = new OrderOfflineService(storeId);
    const productSvc = new ProductOfflineService(storeId);
    const categorySvc = new ProductCategoryOfflineService(storeId);

    const today = new Date();

    // Angular line 139-142: getCategoryOrder — falls back to 999 when category not found.
    const getCategoryOrder = (categoryId: string): number =>
      categorySvc.getById(categoryId)?.order ?? 999;

    // Angular lines 62-69: active & availableToSale products, sorted by category order then
    // product order.
    const products = productSvc
      .getAll()
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
    const todayEntries = inventorySvc.getByDate(today);

    // Angular lines 78-81: getInventoryCategoriesView() equivalent — reuse the existing
    // getAvailableByCategory (enriched with the products' own categoryId/categoryName, same
    // pattern as the Available page) to resolve each product's `disponible` quantity.
    const enriched = products.map((p) => ({
      id: p.id,
      name: p.name,
      categoryId: p.categoryId,
      categoryName: p.categoryName,
    }));
    const availableByProduct = new Map<string, number>();
    for (const cat of inventorySvc.getAvailableByCategory(enriched)) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const isEmpty = categoryGroups.length === 0;

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">
        {intl.formatMessage({ id: 'INVENTORY.QUANTITIES.TITLE' })}
      </h1>

      {isEmpty ? (
        <div className="py-8 text-center text-gray-400">
          {intl.formatMessage({ id: 'INVENTORY.QUANTITIES.NO_PRODUCTS' })}
        </div>
      ) : (
        <div className="rounded border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-600">
                  {intl.formatMessage({ id: 'INVENTORY.QUANTITIES.PRODUCT' })}
                </th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">
                  {intl.formatMessage({ id: 'INVENTORY.QUANTITIES.BEGINNING' })}
                </th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">
                  {intl.formatMessage({ id: 'INVENTORY.QUANTITIES.ENTRIES' })}
                </th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">
                  {intl.formatMessage({ id: 'INVENTORY.QUANTITIES.AVAILABLE' })}
                </th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">
                  {intl.formatMessage({ id: 'INVENTORY.QUANTITIES.SOLD' })}
                </th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">
                  {intl.formatMessage({ id: 'INVENTORY.QUANTITIES.ENDING' })}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {categoryGroups.map((category) =>
                category.products.map((product) => (
                  <tr key={product.productId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {category.categoryName} - {product.productName}
                    </td>
                    <td
                      className={`px-4 py-3 text-right ${
                        product.inicio < 0 ? 'text-red-600' : 'text-gray-600'
                      }`}
                    >
                      {product.inicio}
                    </td>
                    <td
                      className={`px-4 py-3 text-right ${
                        product.entradas > 0 ? 'text-green-700' : 'text-gray-600'
                      }`}
                    >
                      {product.entradas}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">
                      {product.disponible}
                    </td>
                    <td
                      className={`px-4 py-3 text-right ${
                        product.vendido > 0 ? 'font-semibold text-amber-600' : 'text-gray-600'
                      }`}
                    >
                      {product.vendido}
                    </td>
                    <td
                      className={`px-4 py-3 text-right ${
                        product.final < 0 ? 'font-semibold text-red-600' : 'text-gray-600'
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
      )}
    </div>
  );
}

export default InventoryTodayQuantitiesPage;
