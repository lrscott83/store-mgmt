import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { InventoryOfflineService } from '../lib/services/inventory-offline-service';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { ProductOfflineService } from '~/sales/lib/services/product-offline-service';

export const clientLoader = featureLoader([EFeatures.InventoryTodayQuantities]);

// NOTE (parity gap, intentionally NOT closed in this slice): this table is still NOT a full
// port of Angular's Today Quantities screen — netChange here is only `entered - sold`. The
// fabricated "egressed" column (from the deleted waste-tracker, no Angular analog) has been
// removed, but the full Angular-formula rewrite (Stage 2 gap #2) is a SEPARATE next slice.
interface ProductQuantities {
  productId: string;
  productName: string;
  entered: number;
  sold: number;
  netChange: number;
}

export function InventoryTodayQuantitiesPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [rows, setRows] = useState<ProductQuantities[]>([]);

  useEffect(() => {
    const inventorySvc = new InventoryOfflineService(storeId);
    const orderSvc = new OrderOfflineService(storeId);
    const productSvc = new ProductOfflineService(storeId);

    const products = productSvc.getAll();
    const productMap = new Map(products.map((p) => [p.id, p.name]));

    // Today's inventory entries
    const todayEntries = inventorySvc.getByDate(new Date());
    const enteredByProduct = new Map<string, number>();
    for (const e of todayEntries) {
      enteredByProduct.set(e.productId, (enteredByProduct.get(e.productId) ?? 0) + e.quantity);
    }

    // Today's orders → sold quantities
    const todayOrders = orderSvc.getActiveOrdersInDay(new Date());
    const soldByProduct = new Map<string, number>();
    for (const order of todayOrders) {
      for (const item of order.orderItems) {
        soldByProduct.set(
          item.productId,
          (soldByProduct.get(item.productId) ?? 0) + item.quantity,
        );
      }
    }

    // Aggregate all product ids seen today
    const allProductIds = new Set([...enteredByProduct.keys(), ...soldByProduct.keys()]);

    const result: ProductQuantities[] = Array.from(allProductIds).map((productId) => {
      const entered = enteredByProduct.get(productId) ?? 0;
      const sold = soldByProduct.get(productId) ?? 0;
      return {
        productId,
        productName: productMap.get(productId) ?? productId,
        entered,
        sold,
        netChange: entered - sold,
      };
    });

    setRows(result);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">
        {intl.formatMessage({ id: 'INVENTORY.QUANTITIES.TITLE' })}
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
                <th className="px-4 py-2 text-right font-medium text-gray-600">Entradas</th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">Ventas</th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">Cambio neto</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.productId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{row.productName}</td>
                  <td className="px-4 py-3 text-right text-green-700">+{row.entered}</td>
                  <td className="px-4 py-3 text-right text-red-600">-{row.sold}</td>
                  <td
                    className={`px-4 py-3 text-right font-semibold ${
                      row.netChange >= 0 ? 'text-green-700' : 'text-red-600'
                    }`}
                  >
                    {row.netChange >= 0 ? '+' : ''}{row.netChange}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default InventoryTodayQuantitiesPage;
