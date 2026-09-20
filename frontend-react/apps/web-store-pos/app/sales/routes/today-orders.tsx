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
import {
  collectOrderPaymentMethodKeys,
  matchesOrderPaymentFilter,
  paymentMethodKeyToLabel,
} from '~/shared/lib/payment-filter-options';
import { formatCurrency } from '~/shared/lib/format-currency';

export const clientLoader = featureLoader([EFeatures.TodayOrders]);

/**
 * Filtro de método de pago DINÁMICO (2026-09-19): las opciones se calculan de
 * las ventas activas del día — solo aparecen los métodos realmente presentes
 * (Efectivo/Zelle/"Transferencia (CUP|USD|…)"), resueltos por
 * `payment-filter-options` (el legacy Tarjeta se muestra y filtra como
 * Transferencia). Con "Todas" siempre primero. El estado guarda la CLAVE
 * (efectivo | zelle | transferencia-<moneda>); si los datos cambian y la
 * clave activa deja de existir, se resetea a null (Todas).
 */
export function TodayOrdersPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [orders, setOrders] = useState<Order[]>([]);
  const [paymentKey, setPaymentKey] = useState<string | null>(null);
  const [isCredit, setIsCredit] = useState<number>(-1);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  // Active orders of the day, credit-filtered only — the payment filter is
  // applied on render against the loaded set so the options and the visible
  // rows always come from the same data (no double loading pass).
  function loadTodayOrders() {
    const service = new OrderOfflineService(storeId);
    const filtered = service
      .getActiveOrdersInDay(new Date())
      .filter(
        (o) => isCredit === -1 || (isCredit === 1 && o.isCredit) || (isCredit === 0 && !o.isCredit),
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setOrders(filtered);
  }

  useEffect(() => {
    loadTodayOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadTodayOrders reads only the listed deps
  }, [storeId, isCredit]);

  // Angular's OrderOfflineService.updateTodayOrder/deactivateOrder return a Result/DataResult
  // that reports `succeeded: false` on not-found rather than throwing — mirrored here via a
  // `.succeeded` check for the Swal error dialogs in EditOrderModal/OrderItemList.
  function handleUpdate(orderId: string, newPaymentType: PaymentType): boolean {
    const service = new OrderOfflineService(storeId);
    const result = service.updateTodayOrder(orderId, newPaymentType);
    if (!result.succeeded) return false;
    loadTodayOrders();
    return true;
  }

  function handleDeactivate(order: Order): boolean {
    const service = new OrderOfflineService(storeId);
    const result = service.deactivateOrder(order.id);
    if (!result.succeeded) return false;
    loadTodayOrders();
    return true;
  }

  const paymentOptions = collectOrderPaymentMethodKeys(orders);
  const paymentActive = paymentKey !== null && paymentOptions.includes(paymentKey) ? paymentKey : null;
  const visibleOrders = orders.filter((o) => !paymentActive || matchesOrderPaymentFilter(o, paymentActive));

  const ordersItemsCount = visibleOrders.reduce((count, o) => count + o.itemsCount, 0);
  const ordersTotal = visibleOrders.reduce((total, o) => total + o.total, 0);

  return (
    <Card
      padding="tight"
      title={
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            {/* TODAY_ORDERS.HEADER */}
            {intl.formatMessage({ id: 'TODAY_ORDERS.HEADER' })}
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
              ({ordersItemsCount})
            </span>
          </span>
          <span className="text-sm font-semibold text-primary whitespace-nowrap">
            {formatCurrency(ordersTotal)}
          </span>
        </div>
      }
    >
      <fieldset className="mb-3 flex flex-wrap gap-4">
        <label className="flex items-center gap-1 text-sm text-text">
          <input
            type="radio"
            name="paymentType"
            checked={paymentActive === null}
            onChange={() => setPaymentKey(null)}
            className="accent-primary"
          />
          Todas
        </label>
        {paymentOptions.map((key) => (
          <label key={key} className="flex items-center gap-1 text-sm text-text">
            <input
              type="radio"
              name="paymentType"
              checked={paymentActive === key}
              onChange={() => setPaymentKey(key)}
              className="accent-primary"
            />
            {paymentMethodKeyToLabel(key)}
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

      {visibleOrders.length === 0 && (
        <InfoBox variant="primary" className="mb-6 text-center">
          {/* TODAY_STATS.NO_ORDER_FOUND (Angular reuses this key here, not TODAY_ORDERS.NO_ORDER_FOUND) */}
          {intl.formatMessage({ id: 'TODAY_STATS.NO_ORDER_FOUND' })}
        </InfoBox>
      )}

      <OrderList
        orders={visibleOrders}
        readOnly={false}
        onEditOrder={setEditingOrder}
        onDeactivateOrder={handleDeactivate}
      />

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
