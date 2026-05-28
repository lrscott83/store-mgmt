import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { Order } from '@store-mgmt/domain';
import { PaymentType } from '@store-mgmt/domain';
import { OrderItemList } from './order-item-list';

interface EditOrderModalProps {
  order: Order;
  isOpen: boolean;
  onClose: () => void;
  onDeactivate: (orderId: string) => void;
  onUpdate: (orderId: string, paymentType: PaymentType) => void;
}

const PAYMENT_OPTIONS = [
  { value: PaymentType.Efectivo, label: 'Efectivo' },
  { value: PaymentType.Tarjeta, label: 'Tarjeta' },
  { value: PaymentType.Zelle, label: 'Zelle' },
];

export function EditOrderModal({
  order,
  isOpen,
  onClose,
  onDeactivate,
  onUpdate,
}: EditOrderModalProps) {
  const intl = useIntl();
  const [paymentType, setPaymentType] = useState<PaymentType>(order.paymentType);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  if (!isOpen) return null;

  function handleDeactivate() {
    if (!confirmDeactivate) {
      setConfirmDeactivate(true);
      return;
    }
    onDeactivate(order.id);
    onClose();
  }

  function handleSave() {
    onUpdate(order.id, paymentType);
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {intl.formatMessage({ id: 'ORDERS.PAYMENT_TYPE' })}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label={intl.formatMessage({ id: 'GENERAL.CLOSE' })}
          >
            ✕
          </button>
        </div>

        {/* Order metadata */}
        <div className="mb-4 space-y-1 text-sm text-gray-600">
          <p>
            {intl.formatMessage({ id: 'ORDERS.DATE' })}:{' '}
            {new Date(order.date).toLocaleString('es')}
          </p>
          <p>
            {intl.formatMessage({ id: 'ORDERS.TOTAL' })}: <strong>${order.total.toFixed(2)}</strong>
          </p>
        </div>

        {/* Order items */}
        <div className="mb-4">
          <OrderItemList items={order.orderItems} />
        </div>

        {/* Payment type edit */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {intl.formatMessage({ id: 'ORDERS.PAYMENT_TYPE' })}
          </label>
          <select
            value={paymentType}
            onChange={(e) => setPaymentType(Number(e.target.value) as PaymentType)}
            className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {PAYMENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Deactivate warning */}
        {confirmDeactivate && (
          <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">
            {intl.formatMessage({ id: 'ORDERS.DEACTIVATE_CONFIRM' })}
            {order.isCredit && (
              <p className="mt-1 font-medium">
                {intl.formatMessage({ id: 'ORDERS.DEACTIVATE_WITH_CREDIT_WARNING' })}
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="flex-1 rounded bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {intl.formatMessage({ id: 'GENERAL.SAVE' })}
          </button>
          <button
            onClick={handleDeactivate}
            className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            {confirmDeactivate
              ? intl.formatMessage({ id: 'GENERAL.CONFIRM' })
              : intl.formatMessage({ id: 'ORDERS.DEACTIVATE' })}
          </button>
          <button
            onClick={onClose}
            className="rounded border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            {intl.formatMessage({ id: 'GENERAL.CANCEL' })}
          </button>
        </div>
      </div>
    </div>
  );
}
