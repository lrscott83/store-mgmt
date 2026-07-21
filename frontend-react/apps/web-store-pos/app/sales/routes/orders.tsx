import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { Order } from '@store-mgmt/domain';
import { EFeatures, PaymentType } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { ChevronDownIcon } from '~/shared/components/ui/icons';
import { OrderOfflineService } from '../lib/services/order-offline-service';
import { OrderList } from '../components/order-list';

export const clientLoader = featureLoader([EFeatures.SalesHistory]);

interface DateOrder {
  date: Date;
  orders: Order[];
  count: number;
  total: number;
}

const PAYMENT_TYPE_OPTIONS = [
  { value: PaymentType.Efectivo, label: 'Efectivo' },
  { value: PaymentType.Tarjeta, label: 'Tarjeta' },
  { value: PaymentType.Zelle, label: 'Zelle' },
];

function groupOrders(orders: Order[]): DateOrder[] {
  const groups = new Map<string, Order[]>();
  orders.forEach((order) => {
    const groupId = new Date(order.date).toISOString().split('T')[0];
    const collection = groups.get(groupId);
    if (collection) collection.push(order);
    else groups.set(groupId, [order]);
  });

  const dateOrders: DateOrder[] = Array.from(groups.values()).map((groupOrders) => ({
    date: groupOrders[0].date,
    orders: [...groupOrders].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    count: groupOrders.length,
    total: groupOrders.reduce((total, o) => total + o.total, 0),
  }));

  return dateOrders.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function formatDateOnly(date: Date): string {
  const d = new Date(date);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${day}/${month}/${year}`;
}

/**
 * Matches Angular's `orders.component.html` (Historial de Ventas): payment-type
 * + isCredit radio filters, orders grouped by day into an accordion, each date
 * panel wraps `OrderList` (read-only, no edit/delete actions — Angular's
 * `app-order-list` here has no `[readOnly]` binding, default `true`). No date
 * range picker exists in Angular; the React-only range inputs are removed.
 */
export function OrdersPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [dateOrders, setDateOrders] = useState<DateOrder[]>([]);
  const [expandedDateIds, setExpandedDateIds] = useState<Set<string>>(new Set());
  const [paymentType, setPaymentType] = useState<PaymentType | null>(null);
  const [isCredit, setIsCredit] = useState<number>(-1);

  function loadOrders() {
    const service = new OrderOfflineService(storeId);
    const filtered = service
      .getStorageOrders()
      .filter((o) => o.isActive)
      .filter((o) => !paymentType || paymentType === o.paymentType)
      .filter((o) => isCredit === -1 || (isCredit === 1 && o.isCredit) || (isCredit === 0 && !o.isCredit));
    setDateOrders(groupOrders(filtered));
  }

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, paymentType, isCredit]);

  function toggleDatePanel(dateId: string) {
    setExpandedDateIds((prev) => {
      const next = new Set(prev);
      if (next.has(dateId)) next.delete(dateId);
      else next.add(dateId);
      return next;
    });
  }

  const ordersCount = dateOrders.reduce((count, d) => count + d.count, 0);
  const ordersTotal = dateOrders.reduce((total, d) => total + d.total, 0);

  return (
    <Card
      title={
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            {/* ORDERS.TITLE */}
            {intl.formatMessage({ id: 'ORDERS.TITLE' })}
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
              ({ordersCount})
            </span>
          </span>
          <span className="text-sm font-semibold text-text">${ordersTotal.toFixed(2)}</span>
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

      {dateOrders.length === 0 && (
        <InfoBox variant="primary" className="mb-6 text-center">
          {/* ORDERS.NO_ORDERS_FOUND */}
          {intl.formatMessage({ id: 'ORDERS.NO_ORDERS_FOUND' })}
        </InfoBox>
      )}

      <div className="space-y-2">
        {dateOrders.map((dateOrder) => {
          const dateId = new Date(dateOrder.date).toISOString().split('T')[0];
          const isExpanded = expandedDateIds.has(dateId);
          return (
            <div key={dateId} className="rounded-lg border border-border bg-surface">
              <button
                type="button"
                onClick={() => toggleDatePanel(dateId)}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
                data-testid={`date-panel-toggle-${dateId}`}
                aria-expanded={isExpanded}
              >
                <span className="text-sm font-medium text-text">
                  {formatDateOnly(dateOrder.date)} ({dateOrder.count})
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text">${dateOrder.total.toFixed(2)}</span>
                  <ChevronDownIcon isExpanded={isExpanded} className="text-text-muted" />
                </span>
              </button>
              {isExpanded && (
                <div className="border-t border-border px-4 py-3">
                  <OrderList orders={dateOrder.orders} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default OrdersPage;
