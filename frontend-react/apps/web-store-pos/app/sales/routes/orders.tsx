import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import type { Order } from '@store-mgmt/domain';
import { EFeatures, PaymentType } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { OrderOfflineService } from '../lib/services/order-offline-service';
import { OrderList } from '../components/order-list';
import { EditOrderModal } from '../components/edit-order-modal';

export const loader = featureLoader([EFeatures.SalesHistory]);

function defaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  };
}

export function OrdersPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [range, setRange] = useState(defaultDateRange());
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  function loadOrders() {
    const service = new OrderOfflineService(storeId);
    const from = new Date(range.from);
    const to = new Date(range.to);
    to.setHours(23, 59, 59, 999);
    setOrders(service.getByDateRange(from, to));
  }

  useEffect(() => {
    loadOrders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, range.from, range.to]);

  async function handleDeactivate(orderId: string) {
    const service = new OrderOfflineService(storeId);
    try {
      await service.deactivate(orderId);
      loadOrders();
    } catch (err) {
      console.error(err);
    }
    setSelectedOrder(null);
  }

  async function handleUpdate(orderId: string, paymentType: PaymentType) {
    const service = new OrderOfflineService(storeId);
    try {
      service.update(orderId, paymentType);
      loadOrders();
    } catch (err) {
      console.error(err);
    }
    setSelectedOrder(null);
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">{intl.formatMessage({ id: 'ORDERS.TITLE' })}</h1>

      {/* Date range filter */}
      <div className="flex gap-3">
        <div>
          <label className="mb-1 block text-xs text-gray-500">
            {intl.formatMessage({ id: 'ORDERS.DATE_FROM' })}
          </label>
          <input
            type="date"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className="rounded border px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">
            {intl.formatMessage({ id: 'ORDERS.DATE_TO' })}
          </label>
          <input
            type="date"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="rounded border px-2 py-1 text-sm"
          />
        </div>
      </div>

      <OrderList orders={orders} onOrderClick={setSelectedOrder} />

      {selectedOrder && (
        <EditOrderModal
          order={selectedOrder}
          isOpen={true}
          onClose={() => setSelectedOrder(null)}
          onDeactivate={handleDeactivate}
          onUpdate={handleUpdate}
        />
      )}
    </div>
  );
}

export default OrdersPage;
