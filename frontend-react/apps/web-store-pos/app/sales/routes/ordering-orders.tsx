import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { Button } from '~/shared/components/ui/button';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { Spinner } from '~/shared/components/ui/spinner';
import { showBlockingError } from '~/shared/lib/blocking-alert';
import { httpErrorKey } from '~/shared/lib/http/http-error';
import { showToastSuccess } from '~/shared/lib/toast';
import {
  orderingHttpService,
  ORDER_STATUS_TRANSITIONS,
  OnlineOrderDeliveryType,
  OnlineOrderPaymentStatus,
  OnlineOrderStatus,
  type DeliveryDriverOption,
  type OnlineOrderFilters,
  type OnlineOrderListItem,
} from '../lib/services/ordering-http-service';

/**
 * La gestión de pedidos NO es `ownerModuleLoader(EModules.WebCatalog)` como la CONFIGURACIÓN (F1):
 * su feature es `OnlineOrdersAdmin` (123), que además del OwnerAdmin incluye al StoreUser (D15) —
 * atender un pedido es trabajo del día a día de la tienda, no del dueño. `featureLoader` con el
 * bypass de SuperAdmin/OwnerAdmin replica exactamente ese conjunto de roles del backend
 * (`[HasPermission(StoreRoleFeatures.OnlineOrdersAdmin)]`).
 */
export const clientLoader = featureLoader([EFeatures.OnlineOrders]);

const PAGE_SIZE = 20;

const INPUT_CLASSES =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary';

const SELECT_CLASSES =
  'rounded-md border border-border bg-surface px-2 py-1 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary';

/**
 * Fecha del pedido. Misma convención que `ordering-settings.tsx`: el backend guarda UTC y el valor
 * puede llegar sin sufijo de zona — sin completarlo el navegador lo leería como hora local.
 */
function formatOrderDate(value: string): string {
  const hasZone = /[zZ]$|[+-]\d{2}:\d{2}$/.test(value);
  return new Date(hasZone ? value : `${value}Z`).toLocaleString('es-ES');
}

/**
 * Filtros tal como están en los controles: texto vacío = "sin filtrar", no un valor de enum.
 *
 * La búsqueda NO vive aquí: es un campo aparte (`search`) porque se aplica al ENVIAR el formulario,
 * no al teclear. Meterla en estos filtros haría que cada tecla recargara el histórico entero.
 */
interface OrderFilterForm {
  status: string;
  paymentStatus: string;
  deliveryType: string;
  driverId: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: OrderFilterForm = {
  status: '',
  paymentStatus: '',
  deliveryType: '',
  driverId: '',
  from: '',
  to: '',
};

/**
 * Del control al filtro de la API. Los selects vacíos NO viajan: un `status=` en blanco no es "sin
 * filtro" para el binder de enums del servidor, y un `from=`/`to=` vacío es un `DateTime?` que no
 * se puede analizar. Se omiten y el backend no filtra por ellos.
 */
function toFilters(form: OrderFilterForm, search: string, page: number): OnlineOrderFilters {
  const filters: OnlineOrderFilters = { page, pageSize: PAGE_SIZE };
  if (form.status !== '') filters.status = Number(form.status) as OnlineOrderStatus;
  if (form.paymentStatus !== '')
    filters.paymentStatus = Number(form.paymentStatus) as OnlineOrderPaymentStatus;
  if (form.deliveryType !== '')
    filters.deliveryType = Number(form.deliveryType) as OnlineOrderDeliveryType;
  if (form.driverId !== '') filters.driverId = form.driverId;
  if (form.from !== '') filters.from = form.from;
  if (form.to !== '') filters.to = form.to;
  // El servidor ya limpia el blanco (`NormalizeSearch`), pero ni siquiera se envía: una búsqueda
  // vacía no debe costar un recorrido del histórico en cada tecla.
  if (search.trim() !== '') filters.search = search.trim();
  return filters;
}

/**
 * Vista "Pedidos" del panel de Pedidos WhatsApp (`/sales/online-orders`, feature 123, F5).
 *
 * La lectura es SIEMPRE contra el servidor: no hay caché local ni estado optimista. Tras cualquier
 * acción (cambiar estado, marcar pago, asignar repartidor) se vuelve a listar, porque quien opera
 * la tienda necesita ver lo que el servidor guardó de verdad, no lo que el botón suponía.
 *
 * Las transiciones de estado se OFRECEN filtradas por `ORDER_STATUS_TRANSITIONS`, la misma tabla
 * que `Order.AllowedTransitionsFrom` en el dominio: un botón que el servidor va a rechazar con un
 * 400 es una trampa. El servidor sigue siendo la autoridad y su mensaje de rechazo es el que se
 * muestra cuando algo se escapa a la tabla.
 */
export function OrderingOrdersPage() {
  const intl = useIntl();

  const [filters, setFilters] = useState<OrderFilterForm>(EMPTY_FILTERS);
  /** Lo que hay en el campo de búsqueda (se aplica al enviar) y lo que ya está aplicado. */
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<OnlineOrderListItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [drivers, setDrivers] = useState<DeliveryDriverOption[]>([]);
  const [driversUnavailable, setDriversUnavailable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOrders = useCallback(
    async (form: OrderFilterForm, searchTerm: string, requestedPage: number) => {
      try {
        const result = await orderingHttpService.listOrders(
          toFilters(form, searchTerm, requestedPage),
        );
        if (!result.succeeded) {
          setError(intl.formatMessage({ id: 'ORDERING_ORDERS.LOAD_FAILED' }));
          return;
        }
        setOrders(result.data.items);
        setTotal(result.data.total);
        setError('');
      } catch (err) {
        setError(intl.formatMessage({ id: httpErrorKey(err, 'ORDERING_ORDERS.LOAD_FAILED') }));
      } finally {
        setIsLoading(false);
      }
    },
    [intl],
  );

  // El reparto vive en otra feature (F7) y puede no existir todavía: su fallo degrada el SELECTOR
  // (que queda en "Sin asignar"), nunca la página. Pedirlo una vez al montar y no en cada recarga
  // evita repetir una petición cuyo resultado no cambia entre páginas.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // El servicio ya devuelve lista vacía ante un fallo, pero esta vista NO depende de esa
      // garantía: si `listActiveDrivers` llega a rechazar, el catch deja el selector vacío en vez
      // de convertir un endpoint opcional en un error sin manejar que tumba la página entera.
      const list = await orderingHttpService.listActiveDrivers().catch(() => [] as DeliveryDriverOption[]);
      if (cancelled) return;
      setDrivers(list);
      setDriversUnavailable(list.length === 0);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void loadOrders(filters, search, page);
  }, [loadOrders, filters, search, page]);

  /**
   * Aplicar un filtro o cambiar de página vuelve a la primera cuando cambia el filtro: la página 3
   * sin filtro no tiene por qué existir con el filtro puesto.
   */
  function update<K extends keyof OrderFilterForm>(key: K, value: OrderFilterForm[K]) {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  }

  /** Envía el cambio y recarga; el mensaje de rechazo del servidor es el que se muestra. */
  async function runAction(
    action: Promise<{ succeeded: boolean; errors: { description: string }[] }>,
    successMessageId: string,
    failureMessageId: string,
  ) {
    try {
      const result = await action;
      if (!result.succeeded) {
        showBlockingError(
          intl.formatMessage({ id: 'GENERAL.ERROR' }),
          result.errors[0]?.description ?? intl.formatMessage({ id: failureMessageId }),
        );
        return false;
      }
      showToastSuccess(intl.formatMessage({ id: successMessageId }));
      return true;
    } catch (err) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        intl.formatMessage({ id: httpErrorKey(err, failureMessageId) }),
      );
      return false;
    }
  }

  async function handleStatusChange(order: OnlineOrderListItem, status: OnlineOrderStatus) {
    const changed = await runAction(
      orderingHttpService.updateStatus(order.id, status),
      'ORDERING_ORDERS.STATUS_CHANGED',
      'ORDERING_ORDERS.STATUS_FAILED',
    );
    if (changed) await loadOrders(filters, search, page);
  }

  async function handlePaymentToggle(order: OnlineOrderListItem) {
    // El pago es un eje INDEPENDIENTE del estado (D3/D12): alternar Pending ↔ Paid no mueve el pedido.
    const next =
      order.paymentStatus === OnlineOrderPaymentStatus.Paid
        ? OnlineOrderPaymentStatus.Pending
        : OnlineOrderPaymentStatus.Paid;
    const changed = await runAction(
      orderingHttpService.updatePayment(order.id, next),
      'ORDERING_ORDERS.PAYMENT_CHANGED',
      'ORDERING_ORDERS.PAYMENT_FAILED',
    );
    if (changed) await loadOrders(filters, search, page);
  }

  async function handleDriverChange(order: OnlineOrderListItem, value: string) {
    // La opción vacía es "desasignar": viaja como null, nunca como cadena en blanco (el servidor
    // espera un Guid? y no valida el texto).
    const driverId = value === '' ? null : value;
    const changed = await runAction(
      orderingHttpService.assignDriver(order.id, driverId),
      'ORDERING_ORDERS.DRIVER_CHANGED',
      'ORDERING_ORDERS.DRIVER_FAILED',
    );
    if (changed) await loadOrders(filters, search, page);
  }

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <Card
        padding="tight"
        title={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{intl.formatMessage({ id: 'ORDERING_ORDERS.TITLE' })}</span>
            <Button
              variant="fab"
              onClick={() => void loadOrders(filters, search, page)}
              data-testid="order-refresh"
            >
              {intl.formatMessage({ id: 'ORDERING_ORDERS.REFRESH' })}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text-muted">
          {intl.formatMessage({ id: 'ORDERING_ORDERS.SUBTITLE' })}
        </p>

        {/* Los seis filtros del listado más la búsqueda. Un `<form>` de verdad: al buscar se
            pulsa Enter igual que se pulsa el botón, y los selects cambian al vuelo. */}
        <form
          className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            // La búsqueda se APLICA aquí, no en cada tecla: escribir no dispara peticiones.
            setSearch(searchInput);
            setPage(1);
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            {intl.formatMessage({ id: 'ORDERING_ORDERS.FILTER_STATUS' })}
            <select
              className={SELECT_CLASSES}
              value={filters.status}
              onChange={(event) => update('status', event.target.value)}
              data-testid="order-filter-status"
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
            {intl.formatMessage({ id: 'ORDERING_ORDERS.FILTER_PAYMENT' })}
            <select
              className={SELECT_CLASSES}
              value={filters.paymentStatus}
              onChange={(event) => update('paymentStatus', event.target.value)}
              data-testid="order-filter-payment"
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
            {intl.formatMessage({ id: 'ORDERING_ORDERS.FILTER_DELIVERY_TYPE' })}
            <select
              className={SELECT_CLASSES}
              value={filters.deliveryType}
              onChange={(event) => update('deliveryType', event.target.value)}
              data-testid="order-filter-delivery"
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
            {intl.formatMessage({ id: 'ORDERING_ORDERS.FILTER_DRIVER' })}
            <select
              className={SELECT_CLASSES}
              value={filters.driverId}
              onChange={(event) => update('driverId', event.target.value)}
              data-testid="order-filter-driver"
            >
              <option value="">{intl.formatMessage({ id: 'GENERAL.ALL' })}</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-muted">
            {intl.formatMessage({ id: 'ORDERING_ORDERS.FILTER_FROM' })}
            <input
              type="date"
              className={INPUT_CLASSES}
              value={filters.from}
              onChange={(event) => update('from', event.target.value)}
              data-testid="order-filter-from"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-muted">
            {intl.formatMessage({ id: 'ORDERING_ORDERS.FILTER_TO' })}
            <input
              type="date"
              className={INPUT_CLASSES}
              value={filters.to}
              onChange={(event) => update('to', event.target.value)}
              data-testid="order-filter-to"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-muted sm:col-span-2 lg:col-span-3">
            {intl.formatMessage({ id: 'ORDERING_ORDERS.SEARCH_LABEL' })}
            <div className="flex gap-2">
              <input
                type="search"
                className={INPUT_CLASSES}
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={intl.formatMessage({ id: 'ORDERING_ORDERS.SEARCH_PLACEHOLDER' })}
                data-testid="order-search"
              />
              <Button type="submit" data-testid="order-search-submit">
                {intl.formatMessage({ id: 'GENERAL.SEARCH' })}
              </Button>
            </div>
          </label>
        </form>
      </Card>

      {/* Un 404 aquí significa que el catálogo de repartidores (F7) no está desplegado todavía: la
          tabla y el resto de filtros siguen sirviendo, solo no se puede asignar a nadie. */}
      {driversUnavailable && (
        <InfoBox variant="info">
          <span data-testid="order-drivers-unavailable">
            {intl.formatMessage({ id: 'ORDERING_ORDERS.DRIVERS_UNAVAILABLE' })}
          </span>
        </InfoBox>
      )}

      {isLoading && <Spinner label={intl.formatMessage({ id: 'GENERAL.LOADING' })} />}

      {!isLoading && error && (
        <InfoBox variant="danger" className="text-center">
          <span data-testid="order-error">{error}</span>
        </InfoBox>
      )}

      {!isLoading && !error && orders !== null && (
        <Card padding="tight">
          <p className="mb-2 text-xs text-text-muted" data-testid="order-count">
            {intl.formatMessage(
              { id: 'ORDERING_ORDERS.COUNT' },
              { count: String(total) },
            )}
          </p>

          {orders.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted" data-testid="order-empty">
              {intl.formatMessage({ id: 'ORDERING_ORDERS.EMPTY' })}
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
                    <OrderRow
                      key={order.id}
                      order={order}
                      drivers={drivers}
                      onStatusChange={handleStatusChange}
                      onPaymentToggle={handlePaymentToggle}
                      onDriverChange={handleDriverChange}
                    />
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
              data-testid="order-prev-page"
            >
              {intl.formatMessage({ id: 'ORDERING_ORDERS.PREV_PAGE' })}
            </Button>
            <span className="text-xs text-text-muted" data-testid="order-page">
              {intl.formatMessage(
                { id: 'ORDERING_ORDERS.PAGE' },
                { page: String(page), last: String(lastPage) },
              )}
            </span>
            <Button
              variant="outline"
              onClick={() => setPage((current) => Math.min(lastPage, current + 1))}
              disabled={page >= lastPage}
              data-testid="order-next-page"
            >
              {intl.formatMessage({ id: 'ORDERING_ORDERS.NEXT_PAGE' })}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

interface OrderRowProps {
  order: OnlineOrderListItem;
  drivers: DeliveryDriverOption[];
  onStatusChange: (order: OnlineOrderListItem, status: OnlineOrderStatus) => Promise<void>;
  onPaymentToggle: (order: OnlineOrderListItem) => Promise<void>;
  onDriverChange: (order: OnlineOrderListItem, value: string) => Promise<void>;
}

/**
 * Una fila con sus tres acciones. Las transiciones válidas vienen de la tabla compartida: un estado
 * terminal (entregado, cancelado) no pinta selector de estado, porque no hay nada a lo que llegar.
 */
function OrderRow({ order, drivers, onStatusChange, onPaymentToggle, onDriverChange }: OrderRowProps) {
  const intl = useIntl();
  const transitions = ORDER_STATUS_TRANSITIONS[order.status];

  return (
    <tr className="border-b border-border/60 align-top" data-testid={`order-row-${order.id}`}>
      <td className="py-2 pr-2 font-medium">{order.code ?? intl.formatMessage({ id: 'ORDERING_ORDERS.NO_CODE' })}</td>
      <td className="py-2 pr-2">
        <div>{order.customerName ?? intl.formatMessage({ id: 'ORDERING_ORDERS.NO_CUSTOMER' })}</div>
        {order.customerPhone && <div className="text-xs text-text-muted">{order.customerPhone}</div>}
      </td>
      <td className="py-2 pr-2">{deliveryLabel(intl, order.deliveryType)}</td>
      <td className="py-2 pr-2 text-right">{order.total}</td>
      <td className="py-2 pr-2">
        <div className="mb-1">{statusLabel(intl, order.status)}</div>
        {transitions.length > 0 && (
          <select
            className={SELECT_CLASSES}
            value=""
            onChange={(event) => {
              const next = event.target.value;
              if (next !== '') void onStatusChange(order, Number(next) as OnlineOrderStatus);
              // Se vacía para que volver a elegir la MISMA transición la dispare otra vez.
              event.target.value = '';
            }}
            aria-label={intl.formatMessage({ id: 'ORDERING_ORDERS.CHANGE_STATUS' })}
            data-testid={`order-status-${order.id}`}
          >
            <option value="">{intl.formatMessage({ id: 'ORDERING_ORDERS.CHANGE_STATUS' })}</option>
            {transitions.map((status) => (
              <option key={status} value={status}>
                {statusLabel(intl, status)}
              </option>
            ))}
          </select>
        )}
      </td>
      <td className="py-2 pr-2">
        <div className="mb-1">{paymentLabel(intl, order.paymentStatus)}</div>
        <Button
          variant="outline"
          onClick={() => void onPaymentToggle(order)}
          data-testid={`order-payment-${order.id}`}
        >
          {order.paymentStatus === OnlineOrderPaymentStatus.Paid
            ? intl.formatMessage({ id: 'ORDERING_ORDERS.MARK_UNPAID' })
            : intl.formatMessage({ id: 'ORDERING_ORDERS.MARK_PAID' })}
        </Button>
      </td>
      <td className="py-2 pr-2">
        <div className="mb-1" data-testid={`order-driver-name-${order.id}`}>
          {order.driverName ?? intl.formatMessage({ id: 'ORDERING_ORDERS.NO_DRIVER' })}
        </div>
        <select
          className={SELECT_CLASSES}
          value={order.driverId ?? ''}
          onChange={(event) => void onDriverChange(order, event.target.value)}
          aria-label={intl.formatMessage({ id: 'ORDERING_ORDERS.ASSIGN_DRIVER' })}
          data-testid={`order-driver-${order.id}`}
        >
          <option value="">{intl.formatMessage({ id: 'ORDERING_ORDERS.NO_DRIVER' })}</option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.name}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 pr-2 text-xs text-text-muted">{formatOrderDate(order.date)}</td>
    </tr>
  );
}

/** Los seis estados en el orden de la D11: el que se ofrece primero en el filtro es el habitual. */
const ORDER_STATUS_VALUES: readonly OnlineOrderStatus[] = [
  OnlineOrderStatus.New,
  OnlineOrderStatus.Accepted,
  OnlineOrderStatus.Preparing,
  OnlineOrderStatus.Ready,
  OnlineOrderStatus.Delivered,
  OnlineOrderStatus.Cancelled,
];

type Intl = ReturnType<typeof useIntl>;

/** El número del enum es lo que viaja al servidor; lo que ve quien opera es el texto de i18n. */
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

export default OrderingOrdersPage;