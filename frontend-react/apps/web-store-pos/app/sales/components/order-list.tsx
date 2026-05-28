import { useIntl } from 'react-intl';
import type { Order } from '@store-mgmt/domain';
import { PaymentType } from '@store-mgmt/domain';

interface OrderListProps {
  orders: Order[];
  onOrderClick: (order: Order) => void;
}

const PAYMENT_LABELS: Record<PaymentType, string> = {
  [PaymentType.Efectivo]: 'Efectivo',
  [PaymentType.Tarjeta]: 'Tarjeta',
  [PaymentType.Zelle]: 'Zelle',
};

export function OrderList({ orders, onOrderClick }: OrderListProps) {
  const intl = useIntl();

  if (orders.length === 0) {
    return (
      <div className="py-8 text-center text-gray-400">
        {intl.formatMessage({ id: 'ORDERS.EMPTY_STATE' })}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {orders.map((order) => (
        <button
          key={order.id}
          onClick={() => onOrderClick(order)}
          className="w-full rounded border p-3 text-left hover:bg-gray-50 focus:outline-none"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">
                {intl.formatMessage({ id: 'ORDERS.DATE' })}:{' '}
                {new Date(order.date).toLocaleDateString('es')}
              </span>
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {PAYMENT_LABELS[order.paymentType] ?? order.paymentType}
              </span>
              {order.isCredit && (
                <span className="rounded bg-orange-100 px-2 py-0.5 text-xs text-orange-700">
                  {intl.formatMessage({ id: 'ORDERS.CREDIT_BADGE' })}
                </span>
              )}
            </div>
            <div className="text-right">
              <p className="font-semibold text-gray-800">{order.total.toFixed(2)}</p>
              <p className="text-xs text-gray-400">
                {intl.formatMessage({ id: 'ORDERS.ITEMS_COUNT' })}: {order.itemsCount}
              </p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
