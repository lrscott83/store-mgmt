import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { InventoryOfflineService } from '../lib/services/inventory-offline-service';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { ProductOfflineService } from '~/sales/lib/services/product-offline-service';
import { ProductCategoryOfflineService } from '~/sales/lib/services/product-category-offline-service';
import { calculateOrderProfit } from '../lib/profit-calculator';

export const clientLoader = featureLoader([EFeatures.InventoryTodaySaleProfit]);

/**
 * Angular parity: inventory-today-sales-profit.component.ts:57-183.
 *
 * Product set (gap #3b, lines 66-73): `.filter(p => p.isActive && p.availableToSale)`, sorted by
 * category order then product order — same candidate set as Today Quantities, NOT "products
 * present in today's sold order items".
 *
 * Row inclusion (gap #4, line 123): `sold > 0 || hasTodayEntries(productId)` — a product
 * received today but not yet sold still surfaces as an entry-only row (lines 98-104), with an
 * informational average unit cost from today's entries and totalCost=0 (contributes 0 to
 * totals).
 *
 * Cost mechanism for sold quantities (gap #3c — deliberate, documented bug-fix over Angular):
 * Angular recomputes the FIFO cost LIVE via the MUTATING
 * `InventoryOfflineService.getAvailableInventoryCosts` (inventory-offline.service.ts:445-461),
 * which decrements and PERSISTS `available` on every render of this page — a genuine Angular
 * defect that double-deducts inventory when the page is viewed more than once. React instead
 * sums each sold order item's `productCosts` via `calculateOrderProfit` — the FIFO cost
 * breakdown already recorded, non-mutating, at the moment of the original sale. Same FIFO-cost
 * intent, zero mutation, idempotent across any number of renders. Do NOT port Angular's
 * mutating recompute here.
 */
interface ProductProfitRow {
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  sold: number;
  salePrice: number;
  amount: number;
  unitCost: number;
  totalCost: number;
  profit: number;
}

interface CategoryGroup {
  categoryId: string;
  categoryName: string;
  products: ProductProfitRow[];
}

const ZERO_TOTALS = { sold: 0, amount: 0, cost: 0, profit: 0 };

export function InventoryTodaySalesProfitPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [totals, setTotals] = useState(ZERO_TOTALS);

  useEffect(() => {
    const inventorySvc = new InventoryOfflineService(storeId);
    const orderSvc = new OrderOfflineService(storeId);
    const productSvc = new ProductOfflineService(storeId);
    const categorySvc = new ProductCategoryOfflineService(storeId);

    const today = new Date();

    // Angular lines 180-183: getCategoryOrder — falls back to 999 when category not found.
    const getCategoryOrder = (categoryId: string): number =>
      categorySvc.getById(categoryId)?.order ?? 999;

    // Angular lines 66-73 (gap #3b): active & availableToSale products, sorted by category
    // order then product order.
    const products = productSvc
      .getAll()
      .filter((p) => p.isActive && p.availableToSale)
      .sort((a, b) => {
        const catOrderA = getCategoryOrder(a.categoryId);
        const catOrderB = getCategoryOrder(b.categoryId);
        if (catOrderA !== catOrderB) return catOrderA - catOrderB;
        return a.order - b.order;
      });

    // Angular line 76: today's active orders.
    const todayOrders = orderSvc.getActiveOrdersInDay(today);

    // Angular line 87 (read-only, non-mutating): today's inventory entries.
    const todayEntries = inventorySvc.getByDate(today);

    // Angular lines 79-120: build a profit row per candidate product.
    const productProfits: ProductProfitRow[] = products.map((prod) => {
      const orderItems = todayOrders
        .flatMap((o) => o.orderItems)
        .filter((oi) => oi.productId === prod.id);

      const sold = orderItems.reduce((total, oi) => total + oi.quantity, 0);
      const salePrice = prod.price;
      const amount = sold * salePrice;

      const productTodayEntries = todayEntries.filter((e) => e.productId === prod.id);

      let unitCost = 0;
      let totalCost = 0;

      if (sold > 0) {
        // Gap #3c fix: sum each order item's already-recorded (non-mutating) FIFO cost
        // breakdown instead of recomputing it live against currently-available entries.
        totalCost = orderItems.reduce((sum, oi) => sum + calculateOrderProfit(oi).cost, 0);
        unitCost = totalCost / sold;
      } else if (productTodayEntries.length > 0) {
        // Angular lines 98-103: entry-only row — informational average cost from today's
        // entries, contributes 0 to totals (no sale occurred).
        const totalQuantity = productTodayEntries.reduce((sum, e) => sum + e.quantity, 0);
        const totalCostEntries = productTodayEntries.reduce(
          (sum, e) => sum + e.costPrice * e.quantity,
          0,
        );
        unitCost = totalQuantity > 0 ? totalCostEntries / totalQuantity : 0;
        totalCost = 0;
      }

      const profit = amount - totalCost;

      return {
        productId: prod.id,
        productName: prod.name,
        categoryId: prod.categoryId,
        categoryName: prod.categoryName,
        sold,
        salePrice,
        amount,
        unitCost,
        totalCost,
        profit,
      };
    });

    // Angular line 123 (gap #4): include rows with sold>0 OR today entries (quantity>0).
    const productsWithActivity = productProfits.filter(
      (pp) =>
        pp.sold > 0 ||
        todayEntries.some((e) => e.productId === pp.productId && e.quantity > 0),
    );

    // Angular lines 126-149: group by category, ordered by category order, products ordered
    // by product.order within each category.
    const seenCategories = new Map<string, ProductProfitRow>();
    for (const pp of productsWithActivity) {
      if (!seenCategories.has(pp.categoryId)) seenCategories.set(pp.categoryId, pp);
    }

    const groups: CategoryGroup[] = Array.from(seenCategories.values())
      .sort((a, b) => getCategoryOrder(a.categoryId) - getCategoryOrder(b.categoryId))
      .map((pp) => ({
        categoryId: pp.categoryId,
        categoryName: pp.categoryName,
        products: productsWithActivity
          .filter((p) => p.categoryId === pp.categoryId)
          .sort((a, b) => {
            const prodA = products.find((p) => p.id === a.productId);
            const prodB = products.find((p) => p.id === b.productId);
            return (prodA?.order ?? 0) - (prodB?.order ?? 0);
          }),
      }));

    setCategoryGroups(groups);
    setTotals(
      productsWithActivity.reduce(
        (acc, p) => ({
          sold: acc.sold + p.sold,
          amount: acc.amount + p.amount,
          cost: acc.cost + p.totalCost,
          profit: acc.profit + p.profit,
        }),
        ZERO_TOTALS,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const isEmpty = categoryGroups.length === 0;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {intl.formatMessage({ id: 'INVENTORY.PROFIT.TITLE' })}
        </h1>
        <span className="text-lg font-bold text-green-700">${totals.profit.toFixed(2)}</span>
      </div>

      {isEmpty ? (
        <div className="py-8 text-center text-gray-400">
          {intl.formatMessage({ id: 'INVENTORY.PROFIT.NO_SALES' })}
        </div>
      ) : (
        <div className="rounded border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-600">
                  {intl.formatMessage({ id: 'INVENTORY.PROFIT.PRODUCT' })}
                </th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">
                  {intl.formatMessage({ id: 'INVENTORY.PROFIT.SOLD' })}
                </th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">
                  {intl.formatMessage({ id: 'INVENTORY.PROFIT.PRICE' })}
                </th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">
                  {intl.formatMessage({ id: 'INVENTORY.PROFIT.COST' })}
                </th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">
                  {intl.formatMessage({ id: 'INVENTORY.PROFIT.PROFIT' })}
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
                        product.sold > 0 ? 'font-semibold text-amber-600' : 'text-gray-600'
                      }`}
                    >
                      {product.sold}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      <div>{product.salePrice.toFixed(2)}</div>
                      <div className="text-xs text-gray-400">{product.amount.toFixed(2)}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      <div>{product.unitCost.toFixed(2)}</div>
                      <div className="text-xs text-gray-400">{product.totalCost.toFixed(2)}</div>
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-semibold ${
                        product.profit > 0
                          ? 'text-green-700'
                          : product.profit < 0
                            ? 'text-red-600'
                            : 'text-gray-600'
                      }`}
                    >
                      {product.profit.toFixed(2)}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
            <tfoot className="border-t border-gray-300 bg-gray-50">
              <tr className="font-semibold">
                <td className="px-4 py-3 text-gray-700">
                  {intl.formatMessage({ id: 'INVENTORY.PROFIT.TOTAL' })}
                </td>
                <td className="px-4 py-3 text-right text-gray-700">{totals.sold}</td>
                <td className="px-4 py-3 text-right text-gray-700">{totals.amount.toFixed(2)}</td>
                <td className="px-4 py-3 text-right text-gray-700">{totals.cost.toFixed(2)}</td>
                <td
                  className={`px-4 py-3 text-right ${
                    totals.profit > 0
                      ? 'text-green-800'
                      : totals.profit < 0
                        ? 'text-red-700'
                        : 'text-gray-700'
                  }`}
                >
                  {totals.profit.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

export default InventoryTodaySalesProfitPage;
