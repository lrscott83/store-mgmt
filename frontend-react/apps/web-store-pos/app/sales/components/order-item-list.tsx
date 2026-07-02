import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { Order } from '@store-mgmt/domain';
import { Button } from '~/shared/components/ui/button';

interface OrderItemListProps {
  order: Order;
  /** Angular default is `true` (read-only, no actions) — set `false` to show Editar/Eliminar. */
  readOnly?: boolean;
  onEditOrder?: (order: Order) => void;
  onDeactivateOrder?: (order: Order) => void;
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
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  function handleDeactivateClick() {
    if (!confirmDeactivate) {
      setConfirmDeactivate(true);
      return;
    }
    onDeactivateOrder?.(order);
    setConfirmDeactivate(false);
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
              {confirmDeactivate
                ? intl.formatMessage({ id: 'GENERAL.YES' })
                : intl.formatMessage({ id: 'GENERAL.DELETE' })}
            </Button>
          )}
        </div>
      )}

      {order.orderItems && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {order.orderItems.map((item, idx) => (
                <tr key={idx} className="border-b border-border last:border-0">
                  <td className="p-2">
                    <span className="font-semibold text-text">{item.name}</span>
                  </td>
                  <td className="p-2 text-right">
                    <span className="rounded-full bg-primary-light px-2.5 py-0.5 text-xs font-semibold text-primary">
                      {item.quantity}
                    </span>
                  </td>
                  <td className="p-2 text-right">
                    <span className="font-semibold text-text">
                      ${(item.price * item.quantity).toFixed(2)}
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
