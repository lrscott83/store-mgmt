import { useIntl } from 'react-intl';
import type { Order } from '@store-mgmt/domain';
import { Button } from '~/shared/components/ui/button';
import { confirmDialog, showAcknowledgeError } from '~/shared/lib/blocking-alert';
import { formatCurrency } from '~/shared/lib/format-currency';

interface OrderItemListProps {
  order: Order;
  /** Angular default is `true` (read-only, no actions) — set `false` to show Editar/Eliminar. */
  readOnly?: boolean;
  onEditOrder?: (order: Order) => void;
  /** Returns `true` on success, `false` on failure — mirrors Angular's
   * `orderService.deactivateOrder(order.id)` returning a `Result` with `succeeded`. */
  onDeactivateOrder?: (order: Order) => boolean;
}

/**
 * Matches Angular's `order-item-list.component.html`: optional action row
 * (Editar / Eliminar, shown only when `readOnly` is false and only while the
 * order `isActive`), followed by the order's item table (name, quantity,
 * line total). No header row in Angular's markup — table body only.
 */
export function OrderItemList({
  order,
  readOnly = true,
  onEditOrder,
  onDeactivateOrder,
}: OrderItemListProps) {
  const intl = useIntl();

  // Angular: deactivateOrder (order-item-list.component.ts:34-53) — Swal.fire({ title:
  // GENERAL.DELETE_CONFIRM_TITLE, text: GENERAL.DELETE_CONFIRM_MESSAGE_A with
  // name=TODAY_ORDERS.TEXT, icon: 'question', showCancelButton: true,
  // confirmButtonColor: '#3456ff', cancelButtonColor: '#dc3545', confirmButtonText: YES,
  // cancelButtonText: NO }). On confirm, deactivate; on failure, showErrorMessage (a
  // Swal.fire OK-only error dialog with the hardcoded Angular literal below).
  async function handleDeactivateClick() {
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
      {!readOnly && (
        <div className="flex justify-end gap-2">
          <Button variant="fab" onClick={() => onEditOrder?.(order)} data-testid="edit-order-button">
            {/* GENERAL.EDIT */}
            {intl.formatMessage({ id: 'GENERAL.EDIT' })}
          </Button>
          {order.isActive && (
            <Button
              variant="danger"
              onClick={handleDeactivateClick}
              data-testid="deactivate-order-button"
            >
              {/* GENERAL.DELETE */}
              {intl.formatMessage({ id: 'GENERAL.DELETE' })}
            </Button>
          )}
        </div>
      )}

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
                    <span className="font-semibold text-text">
                      {formatCurrency(item.price * item.quantity)}
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
