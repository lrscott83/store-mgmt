import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link } from 'react-router';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { DateRangeFilter } from '~/shared/components/date-range-filter/date-range-filter';
import { Button } from '~/shared/components/ui/button';
import { Spinner } from '~/shared/components/ui/spinner';
import { formatCurrency } from '~/shared/lib/format-currency';
import { httpErrorKey } from '~/shared/lib/http/http-error';
import { OrderDetailModal, formatOrderDate } from '../components/ordering/order-detail-modal';
import { paymentLabel, statusLabel } from '../lib/ordering-labels';
import {
  orderingHttpService,
  OnlineOrderDeliveryType,
  OnlineOrderStatus,
  type OnlineOrderFilters,
  type OnlineOrderListItem,
} from '../lib/services/ordering-http-service';

export const clientLoader = featureLoader([EFeatures.OnlineOrders]);

const PAGE_SIZE = 20;
const DEFAULT_DAYS = 30;

const STATUS_VALUES: readonly OnlineOrderStatus[] = [
  OnlineOrderStatus.Creado,
  OnlineOrderStatus.Preparado,
  OnlineOrderStatus.Transportando,
  OnlineOrderStatus.Entregado,
  OnlineOrderStatus.Cancelado,
];

const SELECT_CLASSES =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary';

interface Range {
  start: Date | null;
  end: Date | null;
}

function defaultRange(): Range {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - (DEFAULT_DAYS - 1));
  return { start, end };
}

/** Los dos extremos son días LOCALES completos; viajan como los instantes UTC que los delimitan. */
function rangeFilters(range: Range): Pick<OnlineOrderFilters, 'from' | 'to' | 'exactRange'> {
  if (range.start === null || range.end === null) return {};

  const from = new Date(range.start);
  from.setHours(0, 0, 0, 0);
  const endExclusive = new Date(range.end);
  endExclusive.setHours(0, 0, 0, 0);
  endExclusive.setDate(endExclusive.getDate() + 1);

  return {
    from: from.toISOString(),
    to: new Date(endExclusive.getTime() - 1).toISOString(),
    exactRange: true,
  };
}

export function OrderingHistoryPage() {
  const intl = useIntl();

  const [range, setRange] = useState<Range>(defaultRange);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<OnlineOrderListItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(
    async (currentRange: Range, currentStatus: string, currentPage: number) => {
      setLoading(true);
      const filters: OnlineOrderFilters = {
        page: currentPage,
        pageSize: PAGE_SIZE,
        ...rangeFilters(currentRange),
      };
      if (currentStatus !== '') filters.status = Number(currentStatus) as OnlineOrderStatus;

      try {
        const result = await orderingHttpService.listOrders(filters);
        if (!result.succeeded) {
          setError(intl.formatMessage({ id: 'ORDERING_ORDERS.LOAD_FAILED' }));
          return;
        }
        setItems(result.data.items);
        setTotal(result.data.total);
        setError('');
      } catch (err) {
        setError(intl.formatMessage({ id: httpErrorKey(err, 'ORDERING_ORDERS.LOAD_FAILED') }));
      } finally {
        setLoading(false);
      }
    },
    [intl],
  );

  useEffect(() => {
    void load(range, status, page);
  }, [load, range, status, page]);

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-text sm:text-2xl">
            {intl.formatMessage({ id: 'ORDERING_ORDERS.HISTORY_TITLE' })}
          </h1>
          <Link className="text-sm font-medium text-primary underline" to="/sales/online-orders">
            {intl.formatMessage({ id: 'ORDERING_ORDERS.TITLE' })}
          </Link>
        </div>
        <p className="text-sm text-text-muted">
          {intl.formatMessage({ id: 'ORDERING_ORDERS.HISTORY_SUBTITLE' })}
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-text">
          {intl.formatMessage({ id: 'ORDERING_ORDERS.FILTER_STATUS' })}
          <select
            className={SELECT_CLASSES}
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value);
            }}
            data-testid="history-status"
          >
            <option value="">{intl.formatMessage({ id: 'ORDERING_ORDERS.FILTER_ALL' })}</option>
            {STATUS_VALUES.map((value) => (
              <option key={value} value={value}>
                {statusLabel(intl, value)}
              </option>
            ))}
          </select>
        </label>

        <div className="sm:pb-1">
          <DateRangeFilter
            value={range}
            onApply={(next) => {
              setPage(1);
              setRange(next);
            }}
          />
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-6">
          <Spinner label={intl.formatMessage({ id: 'GENERAL.LOADING' })} />
        </div>
      )}

      {!loading && error !== '' && <p className="text-sm text-danger">{error}</p>}

      {!loading && error === '' && items?.length === 0 && (
        <p className="text-sm text-text-muted">
          {intl.formatMessage({ id: 'ORDERING_ORDERS.EMPTY' })}
        </p>
      )}

      {!loading && items && items.length > 0 && (
        <div className="flex flex-col gap-2">
          {items.map((order) => (
            <article
              key={order.id}
              className="flex flex-col gap-1 rounded-md border border-border bg-surface p-3"
              data-testid={`history-card-${order.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-bold text-text">
                  {order.code ?? intl.formatMessage({ id: 'ORDERING_ORDERS.NO_CODE' })}
                </span>
                <span className="text-sm font-semibold text-text">
                  {formatCurrency(order.total)}
                </span>
              </div>

              <p className="text-sm text-text">
                {order.customerName ?? intl.formatMessage({ id: 'ORDERING_ORDERS.NO_CUSTOMER' })}
              </p>

              <p className="text-xs text-text-muted">
                {statusLabel(intl, order.status)} · {paymentLabel(intl, order.paymentStatus)} ·{' '}
                {order.deliveryType === OnlineOrderDeliveryType.Delivery
                  ? intl.formatMessage({ id: 'ORDERING_ORDERS.DELIVERY_HOME' })
                  : intl.formatMessage({ id: 'ORDERING_ORDERS.DELIVERY_PICKUP' })}
                {' · '}
                {formatOrderDate(order.date)}
              </p>

              <div>
                <Button
                  variant="outline"
                  onClick={() => setDetailId(order.id)}
                  data-testid={`history-details-${order.id}`}
                >
                  {intl.formatMessage({ id: 'ORDERING_ORDERS.DETAILS' })}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
            {intl.formatMessage({ id: 'ORDERING_ORDERS.PREV_PAGE' })}
          </Button>
          <span className="text-xs text-text-muted">
            {intl.formatMessage({ id: 'ORDERING_ORDERS.PAGE' }, { page, last: lastPage })}
          </span>
          <Button
            variant="outline"
            disabled={page >= lastPage || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            {intl.formatMessage({ id: 'ORDERING_ORDERS.NEXT_PAGE' })}
          </Button>
        </div>
      )}

      <OrderDetailModal orderId={detailId} onClose={() => setDetailId(null)} />
    </main>
  );
}
