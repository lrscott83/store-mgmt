import { useState } from 'react';
import type { Order } from '@store-mgmt/domain';
import { ChevronDownIcon } from '~/shared/components/ui/icons';
import { formatCurrency } from '~/shared/lib/format-currency';
import { round2 } from '~/shared/lib/money';
import { OrderItemList } from './order-item-list';

interface OrderListProps {
  orders: Order[];
  /** Angular default is `true` (read-only, no edit/delete actions inside each panel). */
  readOnly?: boolean;
  onEditOrder?: (order: Order) => void;
  onDeactivateOrder?: (order: Order) => boolean;
}

function formatTime(date: Date): string {
  const d = new Date(date);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getOrderTotal(order: Order): number {
  return round2(order.orderItems.reduce((sum, item) => sum + round2(item.price * item.quantity), 0));
}

function getOrderItemsCount(order: Order): number {
  return order.orderItems.reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * Matches Angular's `order-list.component.html`: accordion (multi-expand) of
 * orders, each panel header showing time + items count, payment-type icon,
 * and total; expanding reveals `OrderItemList`. Credit orders get the
 * `credit-order` visual treatment (Angular: `getOrderBackgroundColor`).
 */
export function OrderList({ orders, readOnly = true, onEditOrder, onDeactivateOrder }: OrderListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function togglePanel(orderId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      {orders.map((order) => {
        const isExpanded = expandedIds.has(order.id);
        return (
          <div
            key={order.id}
            className={`rounded-lg border border-border bg-surface ${order.isCredit ? 'border-warning' : ''}`}
          >
            <button
              type="button"
              onClick={() => togglePanel(order.id)}
              className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
              data-testid={`order-panel-toggle-${order.id}`}
              aria-expanded={isExpanded}
            >
              <span className="text-sm font-medium text-text">
                {formatTime(order.date)} ({getOrderItemsCount(order)})
              </span>
              <span className="flex items-center gap-2">
                <span className="text-sm font-semibold text-text">
                  {formatCurrency(getOrderTotal(order))}
                </span>
                <ChevronDownIcon isExpanded={isExpanded} className="text-text-muted" />
              </span>
            </button>
            {isExpanded && (
              <div className="border-t border-border px-4 py-3">
                <OrderItemList
                  order={order}
                  readOnly={readOnly}
                  onEditOrder={onEditOrder}
                  onDeactivateOrder={onDeactivateOrder}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
