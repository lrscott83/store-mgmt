import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Button } from '~/shared/components/ui/button';
import { InfoBox } from '~/shared/components/ui/info-box';
import { Modal } from '~/shared/components/ui/modal';
import { formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';
import {
  catalogHttpService,
  PublicOrderDeliveryType,
  PublicOrderPaymentStatus,
  PublicOrderStatusKind,
} from '~/sales/lib/services/catalog-http-service';
import type { PublicOrderCreated, PublicOrderStatus } from '~/sales/lib/services/catalog-http-service';

const INPUT_CLASSES =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary';

const PHONE_MIN_DIGITS = 7;

/**
 * ¿El fallo es el veredicto del servidor sobre ESE código? Solo el 404 lo es (y es uniforme a
 * propósito, así que el mensaje no dice por qué). Cualquier otra cosa —red caída, `5xx`, `429`— es
 * la consulta fallando, no el pedido sin existir.
 *
 * `http-error.ts` NO tiene un helper de status (`isNetworkError`/`httpErrorKey` distinguen offline
 * del resto, que aquí sobra: sin red el catálogo tampoco está), así que se lee `response.status`
 * igual que `auth-store.ts` lo hace para el mismo propósito de separar veredicto de incidente.
 */
function isNotFound(err: unknown): boolean {
  return (err as { response?: { status?: number } } | null)?.response?.status === 404;
}

/**
 * Consulta pública del estado de un pedido (F3, T6): código + teléfono, sin cuenta y sin login
 * (D4). El teléfono es el segundo factor débil que exige el backend —código y teléfono tienen que
 * coincidir los dos—.
 *
 * El `404` se muestra como "no encontramos ese pedido" SIN distinguir el motivo, porque el backend
 * responde UNIFORME (código inexistente, de otra tienda o teléfono que no cuadra) para no servir de
 * oráculo de qué códigos existen (F3-R3). Todo lo demás —red caída, `5xx`, `429`— es un FALLO de la
 * consulta, no un veredicto sobre el código, y se dice como tal: pintar "no encontrado" por un
 * `500` le dice al cliente que su pedido no existe, que es mentira, y lo Invite a reescribir el
 * código en vez de a reintentar la consulta.
 */
export function StorefrontOrderStatus({
  open,
  onClose,
  storeSlug,
  createdOrder,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly storeSlug: string;
  /**
   * Pedido recién creado por el checkout, si lo hubo. Se pinta ANTES del formulario porque es la
   * respuesta a "¿ya está?": el código es lo único que el cliente necesita apuntar (y con él más
   * su teléfono puede volver a consultar el estado cuando quiera, sin cuenta).
   */
  readonly createdOrder?: PublicOrderCreated | null;
}) {
  const intl = useIntl();
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [order, setOrder] = useState<PublicOrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  async function search() {
    if (!code.trim()) {
      setError(intl.formatMessage({ id: 'ORDER.STATUS_ERROR_CODE' }));
      return;
    }
    if (phone.replace(/\D/g, '').length < PHONE_MIN_DIGITS) {
      setError(intl.formatMessage({ id: 'ORDER.STATUS_ERROR_PHONE' }));
      return;
    }

    setError(null);
    setSearching(true);
    try {
      const result = await catalogHttpService.getPublicOrderStatus(
        storeSlug,
        code.trim(),
        phone.trim(),
      );
      if (!result.succeeded) {
        setOrder(null);
        setError(intl.formatMessage({ id: 'ORDER.STATUS_NOT_FOUND' }));
        return;
      }
      setOrder(result.data);
    } catch (err) {
      setOrder(null);
      // Espejo del patrón de `public-catalog.tsx` (404 = veredicto del servidor, el resto es otra
      // cosa): aquí el 404 se muestra como "no encontrado" y CUALQUIER otro fallo como fallo de la
      // consulta. `ORDER.STATUS_FAILED` existía sin usarse; una red caída o un 500 tienen que decir
      // "reintenta", no "ese pedido no existe".
      setError(
        intl.formatMessage({
          id: isNotFound(err) ? 'ORDER.STATUS_NOT_FOUND' : 'ORDER.STATUS_FAILED',
        }),
      );
    } finally {
      setSearching(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={intl.formatMessage({ id: 'ORDER.STATUS_TITLE' })}
      testId="catalog-order-status-modal"
    >
      <div className="space-y-4">
        {createdOrder && (
          <div className="rounded-md border border-primary/20 bg-primary-light p-3">
            <h3 className="text-sm font-semibold text-primary" data-testid="order-created-title">
              {intl.formatMessage({ id: 'ORDER.CREATED_TITLE' })}
            </h3>
            <p className="mt-1 text-xs text-text">
              {intl.formatMessage({ id: 'ORDER.CREATED_LEAD' })}
            </p>
            <p className="mt-2 text-center">
              <span className="block text-xs text-text-muted">
                {intl.formatMessage({ id: 'ORDER.CODE_LABEL' })}
              </span>
              <span
                className="font-mono text-2xl font-bold tracking-wider text-text"
                data-testid="order-code"
              >
                {createdOrder.code}
              </span>
            </p>
            <p className="mt-2 text-right text-sm text-text">
              <span className="text-xs text-text-muted">
                {intl.formatMessage({ id: 'ORDER.TOTAL' })}
              </span>{' '}
              <span className="font-bold text-primary">
                {formatMoneyWithCurrency(createdOrder.total, createdOrder.currency)}
              </span>
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <label
              className="mb-1 block text-xs font-medium text-text-muted"
              htmlFor="order-status-code"
            >
              {intl.formatMessage({ id: 'ORDER.STATUS_CODE' })}
            </label>
            <input
              id="order-status-code"
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder={intl.formatMessage({ id: 'ORDER.STATUS_CODE_PLACEHOLDER' })}
              className={INPUT_CLASSES}
              data-testid="order-status-code"
            />
          </div>
          <div className="flex-1">
            <label
              className="mb-1 block text-xs font-medium text-text-muted"
              htmlFor="order-status-phone"
            >
              {intl.formatMessage({ id: 'ORDER.STATUS_PHONE' })}
            </label>
            <input
              id="order-status-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className={INPUT_CLASSES}
              data-testid="order-status-phone"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={() => void search()}
            disabled={searching}
            data-testid="order-status-submit"
          >
            {intl.formatMessage({
              id: searching ? 'ORDER.STATUS_SEARCHING' : 'ORDER.STATUS_SEARCH',
            })}
          </Button>
        </div>

        {error && (
          <div data-testid="order-status-error">
            <InfoBox variant="danger">{error}</InfoBox>
          </div>
        )}

        {order && (
          <div className="space-y-3 rounded-md border border-border bg-surface-hover p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-text-muted">
                {intl.formatMessage({ id: 'ORDER.CODE_LABEL' })}
              </span>
              <span className="font-mono text-sm font-bold text-text" data-testid="order-status-code-value">
                {order.code}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-text-muted">
                {intl.formatMessage({ id: 'ORDER.STATUS_LABEL' })}
              </span>
              <span className="text-sm text-text" data-testid="order-status-state">
                {intl.formatMessage({ id: STATUS_MESSAGE_IDS[order.status] ?? 'ORDER.STATUS_NEW' })}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-text-muted">
                {intl.formatMessage({ id: 'ORDER.PAYMENT_LABEL' })}
              </span>
              <span className="text-sm text-text" data-testid="order-status-payment">
                {intl.formatMessage({
                  id: PAYMENT_MESSAGE_IDS[order.paymentStatus] ?? 'ORDER.PAYMENT_PENDING',
                })}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-text-muted">
                {intl.formatMessage({ id: 'CHECKOUT.DELIVERY_TYPE' })}
              </span>
              <span className="text-sm text-text" data-testid="order-status-delivery-type">
                {intl.formatMessage({
                  id: DELIVERY_MESSAGE_IDS[order.deliveryType] ?? 'ORDER.DELIVERY_PICKUP',
                })}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-text-muted">
                {intl.formatMessage({ id: 'ORDER.TOTAL' })}
              </span>
              <span className="text-sm font-bold text-primary" data-testid="order-status-total">
                {formatMoneyWithCurrency(order.total, order.currency)}
              </span>
            </div>

            <div>
              <span className="text-xs font-medium text-text-muted">
                {intl.formatMessage({ id: 'ORDER.ITEMS_LABEL' })}
              </span>
              <ul className="mt-1 space-y-1" data-testid="order-status-items">
                {order.items.map((item) => (
                  <li key={`${item.name}-${item.quantity}`} className="flex justify-between gap-2 text-sm">
                    <span className="min-w-0 break-words text-text">
                      {item.name} × {item.quantity}
                    </span>
                    <span className="shrink-0 text-text-muted">
                      {formatMoneyWithCurrency(item.price * item.quantity, order.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * El estado, el pago y la modalidad viajan como NÚMERO (serialización por defecto de
 * `System.Text.Json`), así que aquí se mapean a su clave de traducción. Una clave ausente cae al
 * valor legible por defecto en vez de romperse: un enum nuevo del backend no puede dejar la carta
 * sin pintar.
 */
const STATUS_MESSAGE_IDS: Record<number, string> = {
  [PublicOrderStatusKind.New]: 'ORDER.STATUS_NEW',
  [PublicOrderStatusKind.Accepted]: 'ORDER.STATUS_ACCEPTED',
  [PublicOrderStatusKind.Preparing]: 'ORDER.STATUS_PREPARING',
  [PublicOrderStatusKind.Ready]: 'ORDER.STATUS_READY',
  [PublicOrderStatusKind.Delivered]: 'ORDER.STATUS_DELIVERED',
  [PublicOrderStatusKind.Cancelled]: 'ORDER.STATUS_CANCELLED',
};

const PAYMENT_MESSAGE_IDS: Record<number, string> = {
  [PublicOrderPaymentStatus.Pending]: 'ORDER.PAYMENT_PENDING',
  [PublicOrderPaymentStatus.Paid]: 'ORDER.PAYMENT_PAID',
};

const DELIVERY_MESSAGE_IDS: Record<number, string> = {
  [PublicOrderDeliveryType.Pickup]: 'ORDER.DELIVERY_PICKUP',
  [PublicOrderDeliveryType.Delivery]: 'ORDER.DELIVERY_DELIVERY',
};
