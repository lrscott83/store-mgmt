import type { Order } from '@store-mgmt/domain';
import { formatCurrency } from '~/shared/lib/format-currency';
import { round2 } from '~/shared/lib/money';

interface OrderItemListProps {
  order: Order;
  /**
   * Retained for caller compatibility. The expanded panel no longer hosts the
   * edit/delete actions — they moved to the collapsed header's gear `ActionMenu`
   * (`order-list.tsx`), so this prop is no longer read.
   */
  readOnly?: boolean;
}

/**
 * Matches Angular's `order-item-list.component.html` item table (name, quantity,
 * line total). The edit/delete action row that used to live here was moved to
 * the header gear menu; the expanded content is now the item table only.
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
                      {formatCurrency(round2(item.price * item.quantity))}
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
