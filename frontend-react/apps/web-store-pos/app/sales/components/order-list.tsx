import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { Order } from '@store-mgmt/domain';
import { ActionMenu, ActionMenuItem } from '~/shared/components/ui/action-menu';
import { ChevronDownIcon } from '~/shared/components/ui/icons';
import { confirmDialog, showAcknowledgeError } from '~/shared/lib/blocking-alert';
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
  return round2(
    order.orderItems.reduce((sum, item) => sum + round2(item.price * item.quantity), 0),
  );
}

function getOrderItemsCount(order: Order): number {
  return order.orderItems.reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * Matches Angular's `order-list.component.html`: accordion (multi-expand) of
 * orders, each panel header showing time + items count, payment-type icon,
 * and total; expanding reveals `OrderItemList`. Credit orders get the
 * `credit-order` visual treatment (Angular: `getOrderBackgroundColor`).
 *
 * The collapsed header is a flex row whose visual order is
 * `[time + items count] [price] [gear action menu] [collapse arrow]`. The gear
 * trigger cannot live inside the expand/collapse button (nested interactive
 * elements), so the row splits into two toggle controls — the info/price area
 * and the chevron — with the `ActionMenu` between them.
 */
export function OrderList({
  orders,
  readOnly = true,
  onEditOrder,
  onDeactivateOrder,
}: OrderListProps) {
  const intl = useIntl();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function togglePanel(orderId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  // Angular: deactivateOrder (order-item-list.component.ts:34-53) — Swal.fire({ title:
  // GENERAL.DELETE_CONFIRM_TITLE, text: GENERAL.DELETE_CONFIRM_MESSAGE_A with
  // name=TODAY_ORDERS.TEXT, icon: 'question', showCancelButton: true,
  // confirmButtonColor: '#3456ff', cancelButtonColor: '#dc3545', confirmButtonText: YES,
  // cancelButtonText: NO }). On confirm, deactivate; on failure, showErrorMessage (a
  // Swal.fire OK-only error dialog with the hardcoded Angular literal below).
  async function handleDeactivateClick(order: Order) {
    const confirmed = await confirmDialog({
      title: intl.formatMessage({ id: 'GENERAL.DELETE_CONFIRM_TITLE' }),
      message: intl.formatMessage(
        { id: 'GENERAL.DELETE_CONFIRM_MESSAGE_A' },
        { name: intl.formatMessage({ id: 'TODAY_ORDERS.TEXT' }) },
      ),
      confirmButtonText: intl.formatMessage({ id: 'GENERAL.YES' }),
      cancelButtonText: intl.formatMessage({ id: 'GENERAL.NO' }),
    });
    if (!confirmed) return;

    const succeeded = onDeactivateOrder?.(order) ?? true;
    if (!succeeded) {
      showAcknowledgeError({
        title: intl.formatMessage({ id: 'GENERAL.ERROR' }),
        message: intl.formatMessage(
          { id: 'TODAY_ORDERS.ERROR_DELETING_ORDER' },
          {
            // Angular's own hardcoded Spanish literal (order-item-list.component.ts:51),
            // not an i18n key — preserved verbatim, same precedent as the CSV importer fix.
            message:
              'La venta no pudo ser cancelada. Inténtelo más tarde y si persiste el problema contacte al soporte técnico.',
          },
        ),
        confirmButtonText: intl.formatMessage({ id: 'GENERAL.OK' }),
      });
    }
  }

  return (
    <div className="space-y-2">
      {orders.map((order) => {
        const isExpanded = expandedIds.has(order.id);
        return (
          <div
            key={order.id}
            className={`flex flex-wrap items-center rounded-lg border border-border bg-surface ${order.isCredit ? 'border-warning' : ''}`}
          >
            <button
              type="button"
              onClick={() => togglePanel(order.id)}
              className="flex min-w-0 flex-1 items-center justify-between gap-4 px-4 py-3 text-left"
              data-testid={`order-panel-toggle-${order.id}`}
              aria-expanded={isExpanded}
            >
              <span className="text-sm font-medium text-text">
                {formatTime(order.date)} ({getOrderItemsCount(order)})
              </span>
              <span className="text-sm font-semibold text-text whitespace-nowrap">
                {formatCurrency(getOrderTotal(order))}
              </span>
            </button>
            {!readOnly && (
              <ActionMenu testId={`order-actions-toggle-${order.id}`}>
                <ActionMenuItem
                  intent="edit"
                  data-testid="edit-order-button"
                  onClick={() => onEditOrder?.(order)}
                >
                  {/* GENERAL.EDIT */}
                  {intl.formatMessage({ id: 'GENERAL.EDIT' })}
                </ActionMenuItem>
                {order.isActive && (
                  <ActionMenuItem
                    intent="delete"
                    separatorBefore
                    data-testid="deactivate-order-button"
                    onClick={() => handleDeactivateClick(order)}
                  >
                    {/* GENERAL.DELETE */}
                    {intl.formatMessage({ id: 'GENERAL.DELETE' })}
                  </ActionMenuItem>
                )}
              </ActionMenu>
            )}
            <button
              type="button"
              onClick={() => togglePanel(order.id)}
              className="mr-2 rounded-full p-1.5 text-text-muted transition-colors hover:bg-primary-light"
              aria-label={intl.formatMessage({ id: 'GENERAL.DETAILS' })}
              aria-expanded={isExpanded}
              data-testid={`order-panel-chevron-${order.id}`}
            >
              <ChevronDownIcon isExpanded={isExpanded} />
            </button>
            {isExpanded && (
              <div className="basis-full border-t border-border px-4 py-3">
                <OrderItemList order={order} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
