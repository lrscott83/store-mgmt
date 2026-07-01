import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import type { Order } from '@store-mgmt/domain';
import { EFeatures, PaymentType } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { OrderOfflineService } from '../lib/services/order-offline-service';
import { OrderList } from '../components/order-list';
import { EditOrderModal } from '../components/edit-order-modal';

export const clientLoader = featureLoader([EFeatures.TodayOrders]);

export function TodayOrdersPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  function loadOrders() {
    const service = new OrderOfflineService(storeId);
    setOrders(service.getActiveOrdersInDay(new Date()));
  }

  useEffect(() => {
    loadOrders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

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
      <h1 className="text-xl font-semibold">
        {intl.formatMessage({ id: 'ORDERS.TODAY_TITLE' })}
      </h1>
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

export default TodayOrdersPage;
