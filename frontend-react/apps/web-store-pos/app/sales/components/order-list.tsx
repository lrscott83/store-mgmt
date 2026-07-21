import { useState } from 'react';
import type { Order } from '@store-mgmt/domain';
import { PaymentType } from '@store-mgmt/domain';
import { ChevronDownIcon } from '~/shared/components/ui/icons';
import { OrderItemList } from './order-item-list';

interface OrderListProps {
  orders: Order[];
  /** Angular default is `true` (read-only, no edit/delete actions inside each panel). */
  readOnly?: boolean;
  onEditOrder?: (order: Order) => void;
  onDeactivateOrder?: (order: Order) => boolean;
}

/** Angular's `PaymentTypeUtils.getPaymentTypeIcon` — matched 1:1 with Bootstrap icon classes,
 * translated here to inline SVGs from the same icon family (Bootstrap Icons) since the React
 * app has no `bi-*` icon font loaded. */
function PaymentTypeIcon({ paymentType }: { paymentType: PaymentType }) {
  switch (paymentType) {
    case PaymentType.Efectivo:
      return (
        <svg className="h-4 w-4 text-success" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
          <path d="M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4Zm3 0a2 2 0 0 1-2 2v4a2 2 0 0 1 2 2h10a2 2 0 0 1 2-2V6a2 2 0 0 1-2-2H3Z" />
        </svg>
      );
    case PaymentType.Tarjeta:
      return (
        <svg className="h-4 w-4 text-success" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4Zm2-1a1 1 0 0 0-1 1v1h14V4a1 1 0 0 0-1-1H2Zm13 4H1v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7Z" />
        </svg>
      );
    case PaymentType.Zelle:
      return (
        <svg className="h-4 w-4 text-success" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M11 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h6ZM5 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H5Z" />
          <path d="M8 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
        </svg>
      );
    default:
      return (
        <svg className="h-4 w-4 text-success" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm0 1A8 8 0 1 1 8 0a8 8 0 0 1 0 16Z" />
        </svg>
      );
  }
}

function formatTime(date: Date): string {
  const d = new Date(date);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getOrderTotal(order: Order): number {
  return order.orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
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
                <PaymentTypeIcon paymentType={order.paymentType} />
                <span className="text-sm font-semibold text-text">
                  ${getOrderTotal(order).toFixed(2)}
                </span>
                <ChevronDownIcon isExpanded={isExpanded} />
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
