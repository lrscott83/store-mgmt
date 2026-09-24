import type { Order } from '@store-mgmt/domain';
import { formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';
import { round2 } from '~/shared/lib/money';

interface OrderItemListProps {
  order: Order;
}

/**
 * Matches Angular's `order-item-list.component.html`: the order's item table
 * (name, quantity, line total). No header row in Angular's markup — table
 * body only.
 *
 * Owner request 2026-09-18 (Ventas del día): the Editar/Eliminar action row
 * that used to live here moved into the panel header's actions gear
 * (`order-list.tsx`) — the expanded panel now renders the items table only.
 * The deactivate confirm/error flow moved with it, unchanged (Angular
 * order-item-list.component.ts:34-53).
 */
export function OrderItemList({ order }: OrderItemListProps) {
  return (
    <div className="space-y-2">
      {order.orderItems && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {order.orderItems.map((item, idx) => (
                <tr key={idx}>
                  <td className="p-2">
                    <span className="font-semibold text-text">{item.name}</span>
                  </td>
                  <td className="p-2 text-right">
                    <span className="text-xs font-semibold text-primary">{item.quantity}</span>
                  </td>
                  <td className="p-2 text-right">
                    <span className="font-semibold text-text whitespace-nowrap">
                      {formatMoneyWithCurrency(round2(item.price * item.quantity))}
                    </span>
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
