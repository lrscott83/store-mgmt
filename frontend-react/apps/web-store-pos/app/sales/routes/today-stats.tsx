import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import type { Order } from '@store-mgmt/domain';
import { EFeatures, PaymentType } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { OrderOfflineService } from '../lib/services/order-offline-service';
import { CategoryStats } from '../components/category-stats';

export const loader = featureLoader([EFeatures.Sale]);

const PAYMENT_LABELS: Record<PaymentType, string> = {
  [PaymentType.Efectivo]: 'Efectivo',
  [PaymentType.Tarjeta]: 'Tarjeta',
  [PaymentType.Zelle]: 'Zelle',
};

export function TodayStatsPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    const service = new OrderOfflineService(storeId);
    setOrders(service.getActiveOrdersInDay(new Date()));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const activeOrders = orders.filter((o) => o.isActive);
  const totalRevenue = activeOrders.reduce((sum, o) => sum + o.total, 0);

  // Revenue per payment type
  const revenueByPaymentType: Partial<Record<PaymentType, number>> = {};
  for (const order of activeOrders) {
    revenueByPaymentType[order.paymentType] =
      (revenueByPaymentType[order.paymentType] ?? 0) + order.total;
  }

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-xl font-semibold">
        {intl.formatMessage({ id: 'ORDERS.STATS_TITLE' })}
      </h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded border bg-blue-50 p-4">
          <p className="text-xs text-blue-600">{intl.formatMessage({ id: 'ORDERS.STATS.REVENUE' })}</p>
          <p className="mt-1 text-2xl font-bold text-blue-800">${totalRevenue.toFixed(2)}</p>
        </div>
        <div className="rounded border bg-gray-50 p-4">
          <p className="text-xs text-gray-500">{intl.formatMessage({ id: 'ORDERS.ITEMS_COUNT' })}</p>
          <p className="mt-1 text-2xl font-bold text-gray-800">{activeOrders.length}</p>
        </div>
      </div>

      {/* Revenue by payment type */}
      {Object.entries(revenueByPaymentType).length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-gray-600">
            {intl.formatMessage({ id: 'ORDERS.PAYMENT_TYPE' })}
          </h2>
          <div className="space-y-2">
            {(Object.entries(revenueByPaymentType) as [string, number][]).map(
              ([type, amount]) => (
                <div key={type} className="flex items-center justify-between rounded border p-3">
                  <span className="text-sm text-gray-600">
                    {PAYMENT_LABELS[Number(type) as PaymentType] ?? type}
                  </span>
                  <span className="font-medium">${amount.toFixed(2)}</span>
                </div>
              ),
            )}
          </div>
        </div>
      )}

      {/* Category breakdown */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-gray-600">
          {intl.formatMessage({ id: 'ORDERS.STATS.ITEMS_SOLD' })}
        </h2>
        <CategoryStats orders={activeOrders} />
      </div>
    </div>
  );
}

export default TodayStatsPage;
