import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import type { OrderItem } from '@store-mgmt/domain';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { ProductOfflineService } from '~/sales/lib/services/product-offline-service';
import { calculateOrderProfit } from '../lib/profit-calculator';
import type { OrderProfitResult } from '../lib/profit-calculator';

export const loader = featureLoader([EFeatures.InventoryTodaySaleProfit]);

interface ProfitRow {
  productId: string;
  productName: string;
  unitsSold: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
}

export function InventoryTodaySalesProfitPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [rows, setRows] = useState<ProfitRow[]>([]);

  useEffect(() => {
    const orderSvc = new OrderOfflineService(storeId);
    const productSvc = new ProductOfflineService(storeId);

    const products = productSvc.getAll();
    const productMap = new Map(products.map((p) => [p.id, p]));

    const todayOrders = orderSvc.getActiveOrdersInDay(new Date());

    // Aggregate profit per product, only items where discountFromInvantory === true
    const profitByProduct = new Map<string, ProfitRow>();

    for (const order of todayOrders) {
      for (const item of order.orderItems) {
        const product = productMap.get(item.productId);
        // Spec §6.5, S-I8: exclude products where discountFromInvantory === false
        if (!product?.discountFromInvantory) continue;

        const profitResult: OrderProfitResult = calculateOrderProfit(item);

        const existing = profitByProduct.get(item.productId);
        if (existing) {
          existing.unitsSold += item.quantity;
          existing.revenue += profitResult.revenue;
          existing.cost += profitResult.cost;
          existing.profit += profitResult.profit;
          // Recalculate margin for accumulated values
          existing.margin = existing.revenue === 0
            ? 0
            : (existing.profit / existing.revenue) * 100;
        } else {
          profitByProduct.set(item.productId, {
            productId: item.productId,
            productName: product.name,
            unitsSold: item.quantity,
            revenue: profitResult.revenue,
            cost: profitResult.cost,
            profit: profitResult.profit,
            margin: profitResult.margin,
          });
        }
      }
    }

    setRows(Array.from(profitByProduct.values()));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const totals = rows.reduce(
    (acc, row) => ({
      unitsSold: acc.unitsSold + row.unitsSold,
      revenue: acc.revenue + row.revenue,
      cost: acc.cost + row.cost,
      profit: acc.profit + row.profit,
    }),
    { unitsSold: 0, revenue: 0, cost: 0, profit: 0 },
  );
  const totalMargin = totals.revenue === 0 ? 0 : (totals.profit / totals.revenue) * 100;

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">
        {intl.formatMessage({ id: 'INVENTORY.PROFIT.TITLE' })}
      </h1>

      {rows.length === 0 ? (
        <div className="py-8 text-center text-gray-400">
          {intl.formatMessage({ id: 'INVENTORY.EMPTY_STATE' })}
        </div>
      ) : (
        <div className="rounded border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-600">
                  {intl.formatMessage({ id: 'INVENTORY.ENTRY.PRODUCT' })}
                </th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">Unidades</th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">
                  {intl.formatMessage({ id: 'INVENTORY.PROFIT.REVENUE' })}
                </th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">
                  {intl.formatMessage({ id: 'INVENTORY.PROFIT.COST' })}
                </th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">
                  {intl.formatMessage({ id: 'INVENTORY.PROFIT.GROSS_PROFIT' })}
                </th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">
                  {intl.formatMessage({ id: 'INVENTORY.PROFIT.MARGIN' })}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.productId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{row.productName}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{row.unitsSold}</td>
                  <td className="px-4 py-3 text-right text-gray-600">${row.revenue.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">${row.cost.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-medium text-green-700">
                    ${row.profit.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {row.margin.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Summary row */}
            <tfoot className="border-t border-gray-300 bg-gray-50">
              <tr className="font-semibold">
                <td className="px-4 py-3 text-gray-700">Total</td>
                <td className="px-4 py-3 text-right text-gray-700">{totals.unitsSold}</td>
                <td className="px-4 py-3 text-right text-gray-700">${totals.revenue.toFixed(2)}</td>
                <td className="px-4 py-3 text-right text-gray-700">${totals.cost.toFixed(2)}</td>
                <td className="px-4 py-3 text-right text-green-800">${totals.profit.toFixed(2)}</td>
                <td className="px-4 py-3 text-right text-gray-700">{totalMargin.toFixed(1)}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

export default InventoryTodaySalesProfitPage;
