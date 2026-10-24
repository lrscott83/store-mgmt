import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link } from 'react-router';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { Button } from '~/shared/components/ui/button';
import { Modal } from '~/shared/components/ui/modal';
import { Spinner } from '~/shared/components/ui/spinner';
import { showBlockingError } from '~/shared/lib/blocking-alert';
import { formatCurrency } from '~/shared/lib/format-currency';
import { httpErrorKey } from '~/shared/lib/http/http-error';
import { showToastSuccess } from '~/shared/lib/toast';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { hasInventoryModuleAvailable } from '~/shared/lib/auth/authorization-service';
import { OrderDetailModal, formatOrderDate } from '../components/ordering/order-detail-modal';
import { statusLabel } from '../lib/ordering-labels';
import {
  createOnlineOrderSaleDeps,
  syncPaidOnlineOrderSales,
} from '../lib/services/online-order-sale-service';
import {
  allowedTransitionsFrom,
  orderingHttpService,
  OnlineOrderDeliveryType,
  OnlineOrderStatus,
  type DeliveryDriverOption,
  type OnlineOrderFilters,
  type OnlineOrderListItem,
} from '../lib/services/ordering-http-service';

export const clientLoader = featureLoader([EFeatures.OnlineOrders]);

const PAGE_SIZE = 20;

const PANEL_ORDER: readonly OnlineOrderStatus[] = [
  OnlineOrderStatus.Creado,
  OnlineOrderStatus.Preparado,
  OnlineOrderStatus.Transportando,
  OnlineOrderStatus.Entregado,
  OnlineOrderStatus.Cancelado,
];

/** Paneles que muestran sólo el día del dispositivo. Los activos no llevan filtro de fecha. */
const TODAY_PANELS: readonly OnlineOrderStatus[] = [
  OnlineOrderStatus.Entregado,
  OnlineOrderStatus.Cancelado,
];

const TRANSITION_MESSAGE_IDS: Record<OnlineOrderStatus, string> = {
  [OnlineOrderStatus.Creado]: '',
  [OnlineOrderStatus.Preparado]: 'ORDERING_ORDERS.TO_PREPARADO',
  [OnlineOrderStatus.Transportando]: 'ORDERING_ORDERS.TO_TRANSPORTANDO',
  [OnlineOrderStatus.Entregado]: 'ORDERING_ORDERS.TO_ENTREGADO',
  [OnlineOrderStatus.Cancelado]: 'ORDERING_ORDERS.CANCEL_ORDER',
};

const INPUT_CLASSES =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary';

/** Día local del dispositivo convertido a los dos instantes UTC que lo delimitan. */
function todayRange(): { from: string; to: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { from: start.toISOString(), to: new Date(end.getTime() - 1).toISOString() };
}

interface PanelState {
  items: OnlineOrderListItem[];
  total: number;
  page: number;
  loading: boolean;
  error: string;
}

type Panels = Record<OnlineOrderStatus, PanelState>;

function emptyPanel(): PanelState {
  return { items: [], total: 0, page: 1, loading: true, error: '' };
}

function emptyPanels(): Panels {
  return {
    [OnlineOrderStatus.Creado]: emptyPanel(),
    [OnlineOrderStatus.Preparado]: emptyPanel(),
    [OnlineOrderStatus.Transportando]: emptyPanel(),
    [OnlineOrderStatus.Entregado]: emptyPanel(),
    [OnlineOrderStatus.Cancelado]: emptyPanel(),
  };
}

export function OrderingOrdersPage() {
  const intl = useIntl();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.selectedStoreId ?? '';
  const hasInventoryModule = user ? hasInventoryModuleAvailable(user) : false;

  const [panels, setPanels] = useState<Panels>(emptyPanels);
  const [openPanels, setOpenPanels] = useState<Record<OnlineOrderStatus, boolean>>({
    [OnlineOrderStatus.Creado]: true,
    [OnlineOrderStatus.Preparado]: true,
    [OnlineOrderStatus.Transportando]: true,
    [OnlineOrderStatus.Entregado]: false,
    [OnlineOrderStatus.Cancelado]: false,
  });
  const [drivers, setDrivers] = useState<DeliveryDriverOption[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<OnlineOrderListItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);

  const loadPanel = useCallback(
    async (status: OnlineOrderStatus, page: number) => {
      setPanels((current) => ({
        ...current,
        [status]: { ...current[status], loading: true, error: '' },
      }));

      const filters: OnlineOrderFilters = { status, page, pageSize: PAGE_SIZE };
      if (TODAY_PANELS.includes(status)) {
        const range = todayRange();
        filters.from = range.from;
        filters.to = range.to;
        filters.exactRange = true;
      }

      try {
        const result = await orderingHttpService.listOrders(filters);
        if (!result.succeeded) {
          setPanels((current) => ({
            ...current,
            [status]: {
              ...current[status],
              loading: false,
              error: intl.formatMessage({ id: 'ORDERING_ORDERS.LOAD_FAILED' }),
            },
          }));
          return;
        }

        setPanels((current) => ({
          ...current,
          [status]: {
            items: result.data.items,
            total: result.data.total,
            page: result.data.page,
            loading: false,
            error: '',
          },
        }));
      } catch (err) {
        setPanels((current) => ({
          ...current,
          [status]: {
            ...current[status],
            loading: false,
            error: intl.formatMessage({ id: httpErrorKey(err, 'ORDERING_ORDERS.LOAD_FAILED') }),
          },
        }));
      }
    },
    [intl],
  );

  useEffect(() => {
    void (async () => {
      const list = await orderingHttpService
        .listActiveDrivers()
        .catch(() => [] as DeliveryDriverOption[]);
      setDrivers(list);
    })();
  }, []);

  useEffect(() => {
    void Promise.all(PANEL_ORDER.map((status) => loadPanel(status, 1)));
  }, [loadPanel]);

  /**
   * Paid web-catalog orders become POS sales here. It is best-effort on purpose: the order
   * panel must keep working offline, and the next load retries whatever could not be written
   * because the idempotency key (`onlineOrderId`) makes a re-run harmless.
   */
  const syncOnlineOrderSales = useCallback(async () => {
    if (!storeId) return;

    try {
      await syncPaidOnlineOrderSales(createOnlineOrderSaleDeps(storeId, hasInventoryModule));
    } catch {
      // Silent: the sale is retried on the next panel load with no duplicate risk.
    }
  }, [storeId, hasInventoryModule]);

  useEffect(() => {
    void syncOnlineOrderSales();
  }, [syncOnlineOrderSales]);

  async function runTransition(
    order: OnlineOrderListItem,
    next: OnlineOrderStatus,
    options: { driverId?: string; cancellationReason?: string } = {},
  ) {
    setBusy(true);
    try {
      const result = await orderingHttpService.updateStatus(order.id, next, options);
      if (!result.succeeded) {
        showBlockingError(
          intl.formatMessage({ id: 'GENERAL.ERROR' }),
          result.errors[0]?.description ?? intl.formatMessage({ id: 'ORDERING_ORDERS.STATUS_FAILED' }),
        );
        return false;
      }

      showToastSuccess(intl.formatMessage({ id: 'ORDERING_ORDERS.STATUS_CHANGED' }));
      await Promise.all(
        PANEL_ORDER.map((status) => loadPanel(status, panels[status].page)),
      );

      // Moving an order to Entregado marks it Paid on the server (delivering IS collecting),
      // so the sale has to be registered right here, not on the next page load.
      void syncOnlineOrderSales();
      return true;
    } catch (err) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        intl.formatMessage({ id: httpErrorKey(err, 'ORDERING_ORDERS.STATUS_FAILED') }),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function confirmCancel() {
    if (!cancelTarget || cancelReason.trim() === '') return;
    const done = await runTransition(cancelTarget, OnlineOrderStatus.Cancelado, {
      cancellationReason: cancelReason.trim(),
    });
    if (done) {
      setCancelTarget(null);
      setCancelReason('');
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-text sm:text-2xl">
            {intl.formatMessage({ id: 'ORDERING_ORDERS.TITLE' })}
          </h1>
          <Link
            className="text-sm font-medium text-primary underline"
            to="/sales/online-orders/history"
          >
            {intl.formatMessage({ id: 'ORDERING_ORDERS.HISTORY_LINK' })}
          </Link>
        </div>
        <p className="text-sm text-text-muted">
          {intl.formatMessage({ id: 'ORDERING_ORDERS.SUBTITLE' })}
        </p>
      </header>

      <div className="flex flex-col gap-3">
        {PANEL_ORDER.map((status) => {
          const panel = panels[status];
          const isOpen = openPanels[status];
          const lastPage = Math.max(1, Math.ceil(panel.total / PAGE_SIZE));

          return (
            <section
              key={status}
              className="rounded-lg border border-border bg-surface"
              data-testid={`order-panel-${OnlineOrderStatus[status]}`}
            >
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
                aria-expanded={isOpen}
                aria-controls={`order-panel-body-${status}`}
                onClick={() => setOpenPanels((current) => ({ ...current, [status]: !isOpen }))}
              >
                <span className="flex items-center gap-2 text-base font-semibold text-text">
                  {statusLabel(intl, status)}
                  <span
                    className="rounded-full bg-primary-light px-2 py-0.5 text-xs font-bold text-primary"
                    data-testid={`order-panel-count-${OnlineOrderStatus[status]}`}
                  >
                    {panel.total}
                  </span>
                  {TODAY_PANELS.includes(status) && (
                    <span className="text-xs font-normal text-text-muted">
                      {intl.formatMessage({ id: 'ORDERING_ORDERS.TODAY_ONLY' })}
                    </span>
                  )}
                </span>
                <span aria-hidden className="text-lg text-text-muted">
                  {isOpen ? '−' : '+'}
                </span>
              </button>

              {isOpen && (
                <div id={`order-panel-body-${status}`} className="flex flex-col gap-2 px-3 pb-3">
                  {panel.loading && (
                    <div className="flex justify-center py-4">
                      <Spinner label={intl.formatMessage({ id: 'GENERAL.LOADING' })} />
                    </div>
                  )}

                  {!panel.loading && panel.error !== '' && (
                    <p className="py-2 text-sm text-danger">{panel.error}</p>
                  )}

                  {!panel.loading && panel.error === '' && panel.items.length === 0 && (
                    <p className="py-2 text-sm text-text-muted">
                      {intl.formatMessage({ id: 'ORDERING_ORDERS.EMPTY' })}
                    </p>
                  )}

                  {panel.items.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      drivers={drivers}
                      busy={busy}
                      onDetails={() => setDetailId(order.id)}
                      onTransition={runTransition}
                      onCancel={() => {
                        setCancelReason('');
                        setCancelTarget(order);
                      }}
                    />
                  ))}

                  {panel.total > PAGE_SIZE && (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <Button
                        variant="outline"
                        disabled={panel.page <= 1 || panel.loading}
                        onClick={() => void loadPanel(status, panel.page - 1)}
                      >
                        {intl.formatMessage({ id: 'ORDERING_ORDERS.PREV_PAGE' })}
                      </Button>
                      <span className="text-xs text-text-muted">
                        {intl.formatMessage(
                          { id: 'ORDERING_ORDERS.PAGE' },
                          { page: panel.page, last: lastPage },
                        )}
                      </span>
                      <Button
                        variant="outline"
                        disabled={panel.page >= lastPage || panel.loading}
                        onClick={() => void loadPanel(status, panel.page + 1)}
                      >
                        {intl.formatMessage({ id: 'ORDERING_ORDERS.NEXT_PAGE' })}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <OrderDetailModal orderId={detailId} onClose={() => setDetailId(null)} />

      <Modal
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        title={intl.formatMessage({ id: 'ORDERING_ORDERS.CANCEL_ORDER' })}
        testId="order-cancel-modal"
      >
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-text">
            {intl.formatMessage({ id: 'ORDERING_ORDERS.CANCEL_REASON_LABEL' })}
            <textarea
              className={`${INPUT_CLASSES} min-h-24`}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              data-testid="order-cancel-reason"
            />
          </label>

          {cancelReason.trim() === '' && (
            <p className="text-sm text-text-muted">
              {intl.formatMessage({ id: 'ORDERING_ORDERS.CANCEL_REASON_REQUIRED' })}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              {intl.formatMessage({ id: 'ORDERING_ORDERS.CANCEL_DISMISS' })}
            </Button>
            <Button
              variant="danger"
              disabled={cancelReason.trim() === '' || busy}
              onClick={() => void confirmCancel()}
              data-testid="order-cancel-confirm"
            >
              {intl.formatMessage({ id: 'ORDERING_ORDERS.CANCEL_CONFIRM' })}
            </Button>
          </div>
        </div>
      </Modal>
    </main>
  );
}

interface OrderCardProps {
  order: OnlineOrderListItem;
  drivers: DeliveryDriverOption[];
  busy: boolean;
  onDetails: () => void;
  onTransition: (
    order: OnlineOrderListItem,
    next: OnlineOrderStatus,
    options?: { driverId?: string; cancellationReason?: string },
  ) => Promise<boolean>;
  onCancel: () => void;
}

function OrderCard({ order, drivers, busy, onDetails, onTransition, onCancel }: OrderCardProps) {
  const intl = useIntl();
  const [driverId, setDriverId] = useState('');
  const transitions = allowedTransitionsFrom(order.status, order.deliveryType);

  return (
    <article
      className="flex flex-col gap-1 rounded-md border border-border p-3"
      data-testid={`order-card-${order.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-bold text-text">
          {order.code ?? intl.formatMessage({ id: 'ORDERING_ORDERS.NO_CODE' })}
        </span>
        <span className="text-sm font-semibold text-text">{formatCurrency(order.total)}</span>
      </div>

      <p className="text-sm text-text">
        {order.customerName ?? intl.formatMessage({ id: 'ORDERING_ORDERS.NO_CUSTOMER' })}
        {order.customerPhone ? ` · ${order.customerPhone}` : ''}
      </p>

      <p className="text-xs text-text-muted">
        {order.deliveryType === OnlineOrderDeliveryType.Delivery
          ? intl.formatMessage({ id: 'ORDERING_ORDERS.DELIVERY_HOME' })
          : intl.formatMessage({ id: 'ORDERING_ORDERS.DELIVERY_PICKUP' })}
        {' · '}
        {formatOrderDate(order.date)}
      </p>

      {transitions.includes(OnlineOrderStatus.Transportando) && (
        <label className="mt-1 flex flex-col gap-1 text-xs font-medium text-text-muted">
          {intl.formatMessage({ id: 'ORDERING_ORDERS.ASSIGN_DRIVER' })}
          <select
            className={INPUT_CLASSES}
            value={driverId}
            onChange={(event) => setDriverId(event.target.value)}
            data-testid={`order-driver-${order.id}`}
          >
            <option value="">{intl.formatMessage({ id: 'ORDERING_ORDERS.NO_DRIVER' })}</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="outline" onClick={onDetails} data-testid={`order-details-${order.id}`}>
          {intl.formatMessage({ id: 'ORDERING_ORDERS.DETAILS' })}
        </Button>

        {transitions
          .filter((next) => next !== OnlineOrderStatus.Cancelado)
          .map((next) => {
            const needsDriver = next === OnlineOrderStatus.Transportando;
            return (
              <Button
                key={next}
                disabled={busy || (needsDriver && driverId === '')}
                onClick={() => void onTransition(order, next, needsDriver ? { driverId } : undefined)}
                data-testid={`order-to-${next}-${order.id}`}
              >
                {intl.formatMessage({ id: TRANSITION_MESSAGE_IDS[next] })}
              </Button>
            );
          })}

        {transitions.includes(OnlineOrderStatus.Cancelado) && (
          <Button variant="danger" disabled={busy} onClick={onCancel}>
            {intl.formatMessage({ id: 'ORDERING_ORDERS.CANCEL_ORDER' })}
          </Button>
        )}
      </div>
    </article>
  );
}
