import { useIntl } from 'react-intl';
import { Modal } from '~/shared/components/ui/modal';
import { formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';
import type { PublicOrderCreated } from '~/sales/lib/services/catalog-http-service';

/*
 * ─── SEGUNDA PARTE COMENTADA: consulta pública del estado del pedido ─────────────────────────
 * A petición: se comenta TODO lo relativo a consultar el estado del pedido (formulario código +
 * teléfono, botón de búsqueda, errores y bloque de resultado), y también el texto de la tarjeta
 * que invitaba a consultar el código. La tarjeta del pedido recién creado se queda como estaba:
 * título, código y total. El código original se deja comentado, tal cual, para poder restaurarlo.
 *
 * import { useState } from 'react';
 * import { Button } from '~/shared/components/ui/button';
 * import { InfoBox } from '~/shared/components/ui/info-box';
 * import {
 *   catalogHttpService,
 *   PublicOrderDeliveryType,
 *   PublicOrderPaymentStatus,
 *   PublicOrderStatusKind,
 * } from '~/sales/lib/services/catalog-http-service';
 * import type { PublicOrderStatus } from '~/sales/lib/services/catalog-http-service';
 *
 * const INPUT_CLASSES =
 *   'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary';
 *
 * const PHONE_MIN_DIGITS = 7;
 *
 * function isNotFound(err: unknown): boolean {
 *   return (err as { response?: { status?: number } } | null)?.response?.status === 404;
 * }
 *
 * const STATUS_MESSAGE_IDS: Record<number, string> = {
 *   [PublicOrderStatusKind.New]: 'ORDER.STATUS_NEW',
 *   [PublicOrderStatusKind.Accepted]: 'ORDER.STATUS_ACCEPTED',
 *   [PublicOrderStatusKind.Preparing]: 'ORDER.STATUS_PREPARING',
 *   [PublicOrderStatusKind.Ready]: 'ORDER.STATUS_READY',
 *   [PublicOrderStatusKind.Delivered]: 'ORDER.STATUS_DELIVERED',
 *   [PublicOrderStatusKind.Cancelled]: 'ORDER.STATUS_CANCELLED',
 * };
 *
 * const PAYMENT_MESSAGE_IDS: Record<number, string> = {
 *   [PublicOrderPaymentStatus.Pending]: 'ORDER.PAYMENT_PENDING',
 *   [PublicOrderPaymentStatus.Paid]: 'ORDER.PAYMENT_PAID',
 * };
 *
 * const DELIVERY_MESSAGE_IDS: Record<number, string> = {
 *   [PublicOrderDeliveryType.Pickup]: 'ORDER.DELIVERY_PICKUP',
 *   [PublicOrderDeliveryType.Delivery]: 'ORDER.DELIVERY_DELIVERY',
 * };
 */

/**
 * Confirmación del pedido recién creado: la TARJETA se mantiene como estaba (título, código y
 * total). La consulta pública del estado del pedido (código + teléfono) está comentada en esta
 * vista a petición: nada relativo a consultar el estado se muestra aquí — y por eso también se
 * comenta el texto de la tarjeta que invitaba a consultar el código.
 */
export function StorefrontOrderStatus({
  open,
  onClose,
  storeSlug,
  storeName,
  createdOrder,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly storeSlug: string;
  /**
   * Nombre de la tienda para el encabezado del modal. Opcional: si quien lo abre no lo pasa, se
   * usa el slug, que al menos dice de qué tienda es el pedido. Sustituye al antiguo título
   * "Consultar mi pedido", que ya no aplica: la consulta de estado está comentada.
   */
  readonly storeName?: string | null;
  /**
   * Pedido recién creado por el checkout, si lo hubo. Se pinta para que el cliente apunte el
   * código: con él —y su teléfono— podía volver a consultar el estado, pero esa consulta está
   * comentada en esta vista.
   */
  readonly createdOrder?: PublicOrderCreated | null;
}) {
  const intl = useIntl();

  /*
   * ─── Estado y búsqueda de la SEGUNDA PARTE (comentados) ─────────────────────────────────────
   * const [code, setCode] = useState('');
   * const [phone, setPhone] = useState('');
   * const [order, setOrder] = useState<PublicOrderStatus | null>(null);
   * const [error, setError] = useState<string | null>(null);
   * const [searching, setSearching] = useState(false);
   *
   * async function search() {
   *   if (!code.trim()) {
   *     setError(intl.formatMessage({ id: 'ORDER.STATUS_ERROR_CODE' }));
   *     return;
   *   }
   *   if (phone.replace(/\D/g, '').length < PHONE_MIN_DIGITS) {
   *     setError(intl.formatMessage({ id: 'ORDER.STATUS_ERROR_PHONE' }));
   *     return;
   *   }
   *
   *   setError(null);
   *   setSearching(true);
   *   try {
   *     const result = await catalogHttpService.getPublicOrderStatus(
   *       storeSlug,
   *       code.trim(),
   *       phone.trim(),
   *     );
   *     if (!result.succeeded) {
   *       setOrder(null);
   *       setError(intl.formatMessage({ id: 'ORDER.STATUS_NOT_FOUND' }));
   *       return;
   *     }
   *     setOrder(result.data);
   *   } catch (err) {
   *     setOrder(null);
   *     setError(
   *       intl.formatMessage({
   *         id: isNotFound(err) ? 'ORDER.STATUS_NOT_FOUND' : 'ORDER.STATUS_FAILED',
   *       }),
   *     );
   *   } finally {
   *     setSearching(false);
   *   }
   * }
   */

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={storeName?.trim() || storeSlug}
      testId="catalog-order-status-modal"
    >
      <div className="space-y-4">
        {createdOrder && (
          <div className="rounded-md border border-primary/20 bg-primary-light p-3">
            <h3 className="text-sm font-semibold text-primary" data-testid="order-created-title">
              {intl.formatMessage({ id: 'ORDER.CREATED_TITLE' })}
            </h3>
            {/*
            ─── Texto que invita a CONSULTAR el pedido: comentado junto con la consulta ──────────
            <p className="mt-1 text-xs text-text">
              {intl.formatMessage({ id: 'ORDER.CREATED_LEAD' })}
            </p>
            */}
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

        {/*
        ─── SEGUNDA PARTE COMENTADA: consulta del estado del pedido ────────────────────────────
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
        */}
      </div>
    </Modal>
  );
}
