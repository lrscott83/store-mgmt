import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { Order } from '@store-mgmt/domain';
import { EFeatures, PaymentType } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { OrderOfflineService } from '../lib/services/order-offline-service';
import { OrderList } from '../components/order-list';
import { EditOrderModal } from '../components/edit-order-modal';

export const clientLoader = featureLoader([EFeatures.TodayOrders]);

const PAYMENT_TYPE_OPTIONS = [
  { value: PaymentType.Efectivo, label: 'Efectivo' },
  { value: PaymentType.Tarjeta, label: 'Tarjeta' },
  { value: PaymentType.Zelle, label: 'Zelle' },
];

/**
 * Matches Angular's `today-orders.component.html` (Ventas del día): same
 * payment-type + isCredit radio filters as Orders history, but NOT grouped
 * by date (all today's orders in one flat accordion), and `OrderList` is
 * rendered with `readOnly={false}` so each order panel shows Editar/Eliminar.
 */
export function TodayOrdersPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [orders, setOrders] = useState<Order[]>([]);
  const [paymentType, setPaymentType] = useState<PaymentType | null>(null);
  const [isCredit, setIsCredit] = useState<number>(-1);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  function loadTodayOrders() {
    const service = new OrderOfflineService(storeId);
    const filtered = service
      .getActiveOrdersInDay(new Date())
      .filter((o) => !paymentType || paymentType === o.paymentType)
      .filter((o) => isCredit === -1 || (isCredit === 1 && o.isCredit) || (isCredit === 0 && !o.isCredit))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setOrders(filtered);
  }

  useEffect(() => {
    loadTodayOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, paymentType, isCredit]);

  // Angular's OrderOfflineService.updateTodayOrder/deactivateOrder return a Result/DataResult
  // that can report `succeeded: false`; React's offline-service ports only fail via a
  // not-found exception (see order-offline-service.ts). try/catch here is the faithful
  // translation of that failure signal for the Swal error dialogs in EditOrderModal/
  // OrderItemList.
  function handleUpdate(orderId: string, newPaymentType: PaymentType): boolean {
    try {
      const service = new OrderOfflineService(storeId);
      service.update(orderId, newPaymentType);
      loadTodayOrders();
      return true;
    } catch {
      return false;
    }
  }

  function handleDeactivate(order: Order): boolean {
    try {
      const service = new OrderOfflineService(storeId);
      service.deactivate(order.id);
      loadTodayOrders();
      return true;
    } catch {
      return false;
    }
  }

  const ordersItemsCount = orders.reduce((count, o) => count + o.itemsCount, 0);
  const ordersTotal = orders.reduce((total, o) => total + o.total, 0);

  return (
    <Card
      title={
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            {/* TODAY_ORDERS.HEADER */}
            {intl.formatMessage({ id: 'TODAY_ORDERS.HEADER' })}
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
              ({ordersItemsCount})
            </span>
          </span>
          <span className="text-sm font-semibold text-primary">${ordersTotal.toFixed(2)}</span>
        </div>
      }
    >
      <fieldset className="mb-3 flex flex-wrap gap-4">
        <label className="flex items-center gap-1 text-sm text-text">
          <input
            type="radio"
            name="paymentType"
            checked={paymentType === null}
            onChange={() => setPaymentType(null)}
            className="accent-primary"
          />
          Todas
        </label>
        {PAYMENT_TYPE_OPTIONS.map((opt) => (
          <label key={opt.value} className="flex items-center gap-1 text-sm text-text">
            <input
              type="radio"
              name="paymentType"
              checked={paymentType === opt.value}
              onChange={() => setPaymentType(opt.value)}
              className="accent-primary"
            />
            {opt.label}
          </label>
        ))}
      </fieldset>

      <fieldset className="mb-4 flex flex-wrap gap-4">
        <label className="flex items-center gap-1 text-sm text-text">
          <input
            type="radio"
            name="isCredit"
            checked={isCredit === -1}
            onChange={() => setIsCredit(-1)}
            className="accent-primary"
          />
          Todas
        </label>
        <label className="flex items-center gap-1 text-sm text-text">
          <input
            type="radio"
            name="isCredit"
            checked={isCredit === 0}
            onChange={() => setIsCredit(0)}
            className="accent-primary"
          />
          Pagadas
        </label>
        <label className="flex items-center gap-1 text-sm text-text">
          <input
            type="radio"
            name="isCredit"
            checked={isCredit === 1}
            onChange={() => setIsCredit(1)}
            className="accent-primary"
          />
          <span className="text-warning">Créditos</span>
        </label>
      </fieldset>

      {orders.length === 0 && (
        <InfoBox variant="primary" className="mb-6 text-center">
          {/* TODAY_STATS.NO_ORDER_FOUND (Angular reuses this key here, not TODAY_ORDERS.NO_ORDER_FOUND) */}
          {intl.formatMessage({ id: 'TODAY_STATS.NO_ORDER_FOUND' })}
        </InfoBox>
      )}

      <OrderList orders={orders} readOnly={false} onEditOrder={setEditingOrder} onDeactivateOrder={handleDeactivate} />

      {editingOrder && (
        <EditOrderModal
          order={editingOrder}
          isOpen={true}
          onClose={() => setEditingOrder(null)}
          onUpdate={handleUpdate}
        />
      )}
    </Card>
  );
}

export default TodayOrdersPage;
