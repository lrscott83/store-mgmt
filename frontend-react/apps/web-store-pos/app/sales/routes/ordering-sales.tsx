import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { Button } from '~/shared/components/ui/button';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { Spinner } from '~/shared/components/ui/spinner';
import { formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';
import { httpErrorKey } from '~/shared/lib/http/http-error';
import {
  orderingHttpService,
  OnlineOrderDeliveryType,
  OnlineOrderPaymentStatus,
  OnlineOrderStatus,
  type OnlineOrderFilters,
  type OnlineOrderListItem,
  type OnlineOrderStats,
  type OnlineOrderStatsFilters,
} from '../lib/services/ordering-http-service';

/**
 * Mismo gate que la cola de pedidos (F5): `featureLoader([EFeatures.OnlineOrders])` y NO
 * `ownerModuleLoader(EModules.WebCatalog)`. "Ventas" lee la MISMA tabla que "Pedidos" y la opera la
 * misma gente —el dueño y el StoreUser— así que un gate distinto aquí abriría una pantalla con los
 * mismos datos a quien no puede gestionarlos, o cerraría a quien sí trabaja a diario con ellos.
 */
export const clientLoader = featureLoader([EFeatures.OnlineOrders]);

const PAGE_SIZE = 20;

const INPUT_CLASSES =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary';

const SELECT_CLASSES =
  'rounded-md border border-border bg-surface px-2 py-1 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary';

/**
 * Fechas tal como están en los controles: texto vacío = "sin filtrar", no un valor de enum ni un
 * `DateTime` vacío que el servidor no podría analizar.
 */
interface SalesFilterForm {
  status: string;
  paymentStatus: string;
  deliveryType: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: SalesFilterForm = {
  status: '',
  paymentStatus: '',
  deliveryType: '',
  from: '',
  to: '',
};

/**
 * Del control al filtro de la API, y en DOS versiones porque las dos consultas no aceptan lo mismo.
 *
 * El agregado (`GET /stats`) pagina el rango entero en la base: darle `page`/`pageSize` no filtraría
 * nada, y mandarlos sería mandar ruido que el endpoint ni siquiera declara. El histórico sí pagina.
 *
 * Los selects vacíos NO viajan en ninguna de las dos: un `status=` en blanco no es "sin filtro" para
 * el binder de enums del servidor, y un `from=`/`to=` vacío es un `DateTime?` que no se puede
 * analizar. Lo que no se manda, no filtra.
 */
function toStatsFilters(form: SalesFilterForm): OnlineOrderStatsFilters {
  const filters: OnlineOrderStatsFilters = {};
  applySharedFilters(filters, form);
  return filters;
}

function toHistoryFilters(form: SalesFilterForm, page: number): OnlineOrderFilters {
  const filters: OnlineOrderFilters = { page, pageSize: PAGE_SIZE };
  applySharedFilters(filters, form);
  return filters;
}

/** Los cuatro filtros que comparten el agregado y el histórico. */
function applySharedFilters(
  target: { status?: OnlineOrderStatus; paymentStatus?: OnlineOrderPaymentStatus; deliveryType?: OnlineOrderDeliveryType; from?: string; to?: string },
  form: SalesFilterForm,
): void {
  if (form.status !== '') target.status = Number(form.status) as OnlineOrderStatus;
  if (form.paymentStatus !== '')
    target.paymentStatus = Number(form.paymentStatus) as OnlineOrderPaymentStatus;
  if (form.deliveryType !== '')
    target.deliveryType = Number(form.deliveryType) as OnlineOrderDeliveryType;
  if (form.from !== '') target.from = form.from;
  if (form.to !== '') target.to = form.to;
}

/**
 * Vista "Ventas" del panel de Pedidos WhatsApp (`/sales/online-orders/sales`, feature 123, F6).
 *
 * SON DOS LECTURAS y no una: las métricas salen de `GET /v1/online-orders/stats` (un agregado
 * calculado entero en PostgreSQL) y el histórico de `GET /v1/online-orders` (la MISMA paginación y
 * los MISMOS filtros que la cola de F5). No secalcula nada en el cliente: traer el histórico entero
 * para sumar en JavaScript convertiría "abrir el panel de ventas" en una lectura completa de la
 * tabla que más crece sin freno.
 *
 * Y por eso las dos lecturas degradan distinto, a propósito:
 *
 * - El HISTÓRICO es la vista de trabajo. Si falla, se avisa y no se pinta tabla: no hay venta que
 *   gestionar sin los pedidos que la componen.
 * - Las MÉTRICAS son un resumen del mismo conjunto. Si fallan, se avisa en su sitio y el histórico
 *   sigue ahí: quien opera la tienda puede seguir consultando y filtrando pedidos. Un 500 del
 *   agregado no borra los pedidos que lo componen, y treatment a la inversa mentiría.
 */
export function OrderingSalesPage() {
  const intl = useIntl();

  const [filters, setFilters] = useState<SalesFilterForm>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const [stats, setStats] = useState<OnlineOrderStats | null>(null);
  const [statsError, setStatsError] = useState('');
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  const [orders, setOrders] = useState<OnlineOrderListItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [error, setError] = useState('');

  /**
   * El agregado se relee SOLO cuando cambia el rango o un filtro. Paginar el histórico no lo toca:
   * las métricas describen el rango completo, no la página que se está mirando.
   */
  const loadStats = useCallback(
    async (form: SalesFilterForm) => {
      try {
        const result = await orderingHttpService.getSalesStats(toStatsFilters(form));
        if (!result.succeeded) {
          setStats(null);
          setStatsError(intl.formatMessage({ id: 'ORDERING_SALES.STATS_LOAD_FAILED' }));
          return;
        }
        setStats(result.data);
        setStatsError('');
      } catch (err) {
        setStats(null);
        setStatsError(
          intl.formatMessage({ id: httpErrorKey(err, 'ORDERING_SALES.STATS_LOAD_FAILED') }),
        );
      } finally {
        setIsLoadingStats(false);
      }
    },
    [intl],
  );

  const loadOrders = useCallback(
    async (form: SalesFilterForm, requestedPage: number) => {
      try {
        const result = await orderingHttpService.listOrders(toHistoryFilters(form, requestedPage));
        if (!result.succeeded) {
          setError(intl.formatMessage({ id: 'ORDERING_SALES.LOAD_FAILED' }));
          return;
        }
        setOrders(result.data.items);
        setTotal(result.data.total);
        setError('');
      } catch (err) {
        setError(intl.formatMessage({ id: httpErrorKey(err, 'ORDERING_SALES.LOAD_FAILED') }));
      } finally {
        setIsLoadingOrders(false);
      }
    },
    [intl],
  );

  useEffect(() => {
    void loadStats(filters);
  }, [loadStats, filters]);

  useEffect(() => {
    void loadOrders(filters, page);
  }, [loadOrders, filters, page]);

  /**
   * Aplicar un filtro vuelve a la primera página: la página 3 sin filtro no tiene por qué existir
   * con el filtro puesto.
   */
  function update<K extends keyof SalesFilterForm>(key: K, value: SalesFilterForm[K]) {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  }

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <Card
        padding="tight"
        title={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{intl.formatMessage({ id: 'ORDERING_SALES.TITLE' })}</span>
            <Button
              variant="fab"
              onClick={() => {
                void loadStats(filters);
                void loadOrders(filters, page);
              }}
              data-testid="sales-refresh"
            >
              {intl.formatMessage({ id: 'ORDERING_SALES.REFRESH' })}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text-muted">
          {intl.formatMessage({ id: 'ORDERING_SALES.SUBTITLE' })}
        </p>

        {/* Los cinco filtros. Cambian al vuelo: cada uno vuelve a leer el agregado Y el histórico,
            porque las dos consultas comparten exactamente el mismo conjunto de filtros. */}
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            {intl.formatMessage({ id: 'ORDERING_SALES.FILTER_STATUS' })}
            <select
              className={SELECT_CLASSES}
              value={filters.status}
              onChange={(event) => update('status', event.target.value)}
              data-testid="sales-filter-status"
            >
              <option value="">{intl.formatMessage({ id: 'GENERAL.ALL' })}</option>
              {ORDER_STATUS_VALUES.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(intl, status)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-muted">
            {intl.formatMessage({ id: 'ORDERING_SALES.FILTER_PAYMENT' })}
            <select
              className={SELECT_CLASSES}
              value={filters.paymentStatus}
              onChange={(event) => update('paymentStatus', event.target.value)}
              data-testid="sales-filter-payment"
            >
              <option value="">{intl.formatMessage({ id: 'GENERAL.ALL' })}</option>
              <option value={OnlineOrderPaymentStatus.Pending}>
                {paymentLabel(intl, OnlineOrderPaymentStatus.Pending)}
              </option>
              <option value={OnlineOrderPaymentStatus.Paid}>
                {paymentLabel(intl, OnlineOrderPaymentStatus.Paid)}
              </option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-muted">
            {intl.formatMessage({ id: 'ORDERING_SALES.FILTER_DELIVERY_TYPE' })}
            <select
              className={SELECT_CLASSES}
              value={filters.deliveryType}
              onChange={(event) => update('deliveryType', event.target.value)}
              data-testid="sales-filter-delivery"
            >
              <option value="">{intl.formatMessage({ id: 'GENERAL.ALL' })}</option>
              <option value={OnlineOrderDeliveryType.Pickup}>
                {deliveryLabel(intl, OnlineOrderDeliveryType.Pickup)}
              </option>
              <option value={OnlineOrderDeliveryType.Delivery}>
                {deliveryLabel(intl, OnlineOrderDeliveryType.Delivery)}
              </option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-muted">
            {intl.formatMessage({ id: 'ORDERING_SALES.FILTER_FROM' })}
            <input
              type="date"
              className={INPUT_CLASSES}
              value={filters.from}
              onChange={(event) => update('from', event.target.value)}
              data-testid="sales-filter-from"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-muted">
            {intl.formatMessage({ id: 'ORDERING_SALES.FILTER_TO' })}
            <input
              type="date"
              className={INPUT_CLASSES}
              value={filters.to}
              onChange={(event) => update('to', event.target.value)}
              data-testid="sales-filter-to"
            />
          </label>
        </div>
      </Card>

      {statsError && (
        <InfoBox variant="danger" className="text-center">
          <span data-testid="sales-stats-error">{statsError}</span>
        </InfoBox>
      )}

      {isLoadingStats && !stats && (
        <Spinner label={intl.formatMessage({ id: 'GENERAL.LOADING' })} />
      )}

      {stats && <MetricsPanel stats={stats} />}

      {isLoadingOrders && <Spinner label={intl.formatMessage({ id: 'GENERAL.LOADING' })} />}

      {!isLoadingOrders && error && (
        <InfoBox variant="danger" className="text-center">
          <span data-testid="sales-error">{error}</span>
        </InfoBox>
      )}

      {!isLoadingOrders && !error && orders !== null && (
        <Card padding="tight">
          <p className="mb-2 text-xs text-text-muted" data-testid="sales-count">
            {intl.formatMessage({ id: 'ORDERING_SALES.COUNT' }, { count: String(total) })}
          </p>

          {orders.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted" data-testid="sales-empty">
              {intl.formatMessage({ id: 'ORDERING_SALES.EMPTY' })}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-text-muted">
                    <th className="py-2 pr-2">{intl.formatMessage({ id: 'ORDERING_ORDERS.COL_CODE' })}</th>
                    <th className="py-2 pr-2">{intl.formatMessage({ id: 'ORDERING_ORDERS.COL_CUSTOMER' })}</th>
                    <th className="py-2 pr-2">
                      {intl.formatMessage({ id: 'ORDERING_ORDERS.COL_DELIVERY_TYPE' })}
                    </th>
                    <th className="py-2 pr-2 text-right">
                      {intl.formatMessage({ id: 'ORDERING_ORDERS.COL_TOTAL' })}
                    </th>
                    <th className="py-2 pr-2">{intl.formatMessage({ id: 'ORDERING_ORDERS.COL_STATUS' })}</th>
                    <th className="py-2 pr-2">{intl.formatMessage({ id: 'ORDERING_ORDERS.COL_PAYMENT' })}</th>
                    <th className="py-2 pr-2">{intl.formatMessage({ id: 'ORDERING_ORDERS.COL_DRIVER' })}</th>
                    <th className="py-2 pr-2">{intl.formatMessage({ id: 'ORDERING_ORDERS.COL_DATE' })}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <SalesHistoryRow key={order.id} order={order} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-2">
            <Button
              variant="outline"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              data-testid="sales-prev-page"
            >
              {intl.formatMessage({ id: 'ORDERING_SALES.PREV_PAGE' })}
            </Button>
            <span className="text-xs text-text-muted" data-testid="sales-page">
              {intl.formatMessage(
                { id: 'ORDERING_SALES.PAGE' },
                { page: String(page), last: String(lastPage) },
              )}
            </span>
            <Button
              variant="outline"
              onClick={() => setPage((current) => Math.min(lastPage, current + 1))}
              disabled={page >= lastPage}
              data-testid="sales-next-page"
            >
              {intl.formatMessage({ id: 'ORDERING_SALES.NEXT_PAGE' })}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

/**
 * Las cinco tarjetas y los dos desgloses, tal cual los devolvió el servidor: nada se recalcula aquí.
 *
 * Los importes se formatean con LA moneda de la respuesta, no con la de por defecto: un agregado con
 * `currency` de USD pintado como CUP es un número equivocado por el formato, que es peor que no
 * mostrarlo. Los rótulos de estado y modalidad se REUSAN de `ORDERING_ORDERS` porque son los mismos
 * seis estados y las mismas dos modalidades.
 */
function MetricsPanel({ stats }: { stats: OnlineOrderStats }) {
  const intl = useIntl();
  const money = (amount: number) => formatMoneyWithCurrency(amount, stats.currency);

  return (
    <div className="space-y-4" data-testid="sales-metrics">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          label={intl.formatMessage({ id: 'ORDERING_SALES.METRIC_ORDERS' })}
          value={String(stats.ordersCount)}
          valueTestId="sales-metric-orders"
          // El denominador del ticket medio, a la vista: es lo que hace comprobable que la venta
          // total excluye los cancelados sin tener que conocer la regla.
          hint={`${intl.formatMessage({ id: 'ORDERING_SALES.METRIC_NON_CANCELLED' })}: ${stats.nonCancelledCount}`}
          hintTestId="sales-metric-non-cancelled"
        />
        <MetricCard
          label={intl.formatMessage({ id: 'ORDERING_SALES.METRIC_TOTAL' })}
          value={money(stats.totalSales)}
          valueTestId="sales-metric-total"
        />
        <MetricCard
          label={intl.formatMessage({ id: 'ORDERING_SALES.METRIC_AVERAGE' })}
          value={money(stats.averageTicket)}
          valueTestId="sales-metric-average"
        />
        <MetricCard
          label={intl.formatMessage({ id: 'ORDERING_SALES.METRIC_PAID' })}
          value={String(stats.paidCount)}
          valueTestId="sales-metric-paid-count"
          hint={money(stats.paidAmount)}
          hintTestId="sales-metric-paid-amount"
        />
        <MetricCard
          label={intl.formatMessage({ id: 'ORDERING_SALES.METRIC_PENDING' })}
          value={String(stats.pendingCount)}
          valueTestId="sales-metric-pending-count"
          hint={money(stats.pendingAmount)}
          hintTestId="sales-metric-pending-amount"
        />
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        <Breakdown
          title={intl.formatMessage({ id: 'ORDERING_SALES.BREAKDOWN_STATUS' })}
          testId="sales-breakdown-status"
          // El servidor manda la lista COMPLETA en el orden del enum, con ceros incluidos, para que
          // el eje sea fijo. Se recorre la lista del servidor, no una suposición local: si mañana
          // llega un estado nuevo, sale aquí sin tocar esta vista.
          rows={stats.byStatus.map((entry) => ({
            key: entry.status,
            testId: `sales-status-${entry.status}`,
            label: statusLabel(intl, entry.status),
            count: entry.count,
          }))}
        />
        <Breakdown
          title={intl.formatMessage({ id: 'ORDERING_SALES.BREAKDOWN_DELIVERY' })}
          testId="sales-breakdown-delivery"
          rows={stats.byDeliveryType.map((entry) => ({
            key: entry.deliveryType,
            testId: `sales-delivery-${entry.deliveryType}`,
            label: deliveryLabel(intl, entry.deliveryType),
            count: entry.count,
          }))}
        />
      </div>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  valueTestId: string;
  hint?: string;
  hintTestId?: string;
}

function MetricCard({ label, value, valueTestId, hint, hintTestId }: MetricCardProps) {
  return (
    <div className="rounded-lg bg-surface p-3 shadow-card">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="text-lg font-medium text-text" data-testid={valueTestId}>
        {value}
      </div>
      {hint !== undefined && (
        <div className="text-xs text-text-muted" data-testid={hintTestId}>
          {hint}
        </div>
      )}
    </div>
  );
}

interface BreakdownProps {
  title: string;
  testId: string;
  rows: { key: number; testId: string; label: string; count: number }[];
}

/** Un eje FIJO de categorías con su conteo: el mismo bloque para estados y para modalidades. */
function Breakdown({ title, testId, rows }: BreakdownProps) {
  return (
    <div className="rounded-lg bg-surface p-3 shadow-card" data-testid={testId}>
      <div className="mb-2 text-xs text-text-muted">{title}</div>
      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">—</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {rows.map((row) => (
            <li key={row.key} className="flex justify-between" data-testid={row.testId}>
              <span>{row.label}</span>
              <span>{row.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Una fila del HISTÓRICO. Es de solo lectura y por eso no trae los selectores de acción de F5: aquí
 * se consulta lo que se vendió, se opera en "Pedidos". El cancelado se PINTA —es histórico— aunque
 * no sume en las métricas.
 *
 * El repartidor y la fecha salen ya resueltos por el servidor (`driverName`, `date`), igual que en
 * la cola: pintar el nombre exige una segunda consulta por fila y aquí eso se multiplica por página.
 */
function SalesHistoryRow({ order }: { order: OnlineOrderListItem }) {
  const intl = useIntl();

  return (
    <tr className="border-b border-border/60 align-top" data-testid={`sales-row-${order.id}`}>
      <td className="py-2 pr-2 font-medium">
        {order.code ?? intl.formatMessage({ id: 'ORDERING_ORDERS.NO_CODE' })}
      </td>
      <td className="py-2 pr-2">
        <div>{order.customerName ?? intl.formatMessage({ id: 'ORDERING_ORDERS.NO_CUSTOMER' })}</div>
        {order.customerPhone && <div className="text-xs text-text-muted">{order.customerPhone}</div>}
      </td>
      <td className="py-2 pr-2">{deliveryLabel(intl, order.deliveryType)}</td>
      <td className="py-2 pr-2 text-right">{formatMoneyWithCurrency(order.total, order.currency)}</td>
      <td className="py-2 pr-2">{statusLabel(intl, order.status)}</td>
      <td className="py-2 pr-2">{paymentLabel(intl, order.paymentStatus)}</td>
      <td className="py-2 pr-2" data-testid={`sales-row-driver-${order.id}`}>
        {order.driverName ?? intl.formatMessage({ id: 'ORDERING_ORDERS.NO_DRIVER' })}
      </td>
      <td className="py-2 pr-2 text-xs text-text-muted">{formatOrderDate(order.date)}</td>
    </tr>
  );
}

/** Los seis estados en el orden de la D11: el habitual primero en el filtro. */
const ORDER_STATUS_VALUES: readonly OnlineOrderStatus[] = [
  OnlineOrderStatus.New,
  OnlineOrderStatus.Accepted,
  OnlineOrderStatus.Preparing,
  OnlineOrderStatus.Ready,
  OnlineOrderStatus.Delivered,
  OnlineOrderStatus.Cancelled,
];

type Intl = ReturnType<typeof useIntl>;

/**
 * Fecha del pedido. Misma convención que `ordering-orders.tsx`: el backend guarda UTC y el valor
 * puede llegar sin sufijo de zona — sin completarlo el navegador lo leería como hora local.
 */
function formatOrderDate(value: string): string {
  const hasZone = /[zZ]$|[+-]\d{2}:\d{2}$/.test(value);
  return new Date(hasZone ? value : `${value}Z`).toLocaleString('es-ES');
}

/** El número del enum es lo que viaja al servidor; lo que ve quien consulta es el texto de i18n. */
function statusLabel(intl: Intl, status: OnlineOrderStatus): string {
  const ids: Record<OnlineOrderStatus, string> = {
    [OnlineOrderStatus.New]: 'ORDERING_ORDERS.STATUS_NEW',
    [OnlineOrderStatus.Accepted]: 'ORDERING_ORDERS.STATUS_ACCEPTED',
    [OnlineOrderStatus.Preparing]: 'ORDERING_ORDERS.STATUS_PREPARING',
    [OnlineOrderStatus.Ready]: 'ORDERING_ORDERS.STATUS_READY',
    [OnlineOrderStatus.Delivered]: 'ORDERING_ORDERS.STATUS_DELIVERED',
    [OnlineOrderStatus.Cancelled]: 'ORDERING_ORDERS.STATUS_CANCELLED',
  };
  return intl.formatMessage({ id: ids[status] });
}

function paymentLabel(intl: Intl, paymentStatus: OnlineOrderPaymentStatus): string {
  return intl.formatMessage({
    id:
      paymentStatus === OnlineOrderPaymentStatus.Paid
        ? 'ORDERING_ORDERS.PAYMENT_PAID'
        : 'ORDERING_ORDERS.PAYMENT_PENDING',
  });
}

function deliveryLabel(intl: Intl, deliveryType: OnlineOrderDeliveryType): string {
  return intl.formatMessage({
    id:
      deliveryType === OnlineOrderDeliveryType.Delivery
        ? 'ORDERING_ORDERS.DELIVERY_HOME'
        : 'ORDERING_ORDERS.DELIVERY_PICKUP',
  });
}

export default OrderingSalesPage;
