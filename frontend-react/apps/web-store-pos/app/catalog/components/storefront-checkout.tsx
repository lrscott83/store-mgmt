import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Button } from '~/shared/components/ui/button';
import { InfoBox } from '~/shared/components/ui/info-box';
import { Modal } from '~/shared/components/ui/modal';
import { currencyFromCode, formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';
import type { StorefrontCartLine } from '~/catalog/lib/storefront-cart-store';
import { catalogHttpService } from '~/sales/lib/services/catalog-http-service';
import type {
  PublicOrderingConfig,
  PublicOrderCreated,
} from '~/sales/lib/services/catalog-http-service';
import { PublicOrderDeliveryType } from '~/sales/lib/services/catalog-http-service';

const INPUT_CLASSES =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary';

/** Mínimo de dígitos que se aceptan como teléfono: 7 es el más corto que existe en la práctica. */
const PHONE_MIN_DIGITS = 7;

interface StorefrontCheckoutProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly storeSlug: string;
  readonly config: PublicOrderingConfig;
  readonly lines: readonly StorefrontCartLine[];
  /** Se llama con la orden creada para que el padre la pinte y vacíe el carrito. */
  readonly onCreated: (order: PublicOrderCreated) => void;
}

/**
 * Checkout del cliente anónimo (F3): nombre, teléfono, modalidad, dirección (solo si es
 * domicilio) y notas. Sin cuenta, sin login (D4).
 *
 * Valida EN CLIENTE para no gastar el límite de tasa del servidor (`OnlineOrderPolicy`, 20 pedidos
 * por IP y 10 min) con formularios a medio llenar, pero la validación que manda es la del backend:
 * esta se puede saltar desde el navegador.
 */
export function StorefrontCheckout({
  open,
  onClose,
  storeSlug,
  config,
  lines,
  onCreated,
}: StorefrontCheckoutProps) {
  const intl = useIntl();
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [deliveryType, setDeliveryType] = useState<PublicOrderDeliveryType>(() =>
    config.deliveryEnabled && !config.pickupEnabled
      ? PublicOrderDeliveryType.Delivery
      : PublicOrderDeliveryType.Pickup,
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const deliverySelected = deliveryType === PublicOrderDeliveryType.Delivery;

  function validate(): string | null {
    if (lines.length === 0) return intl.formatMessage({ id: 'CHECKOUT.ERROR_EMPTY' });
    if (!customerName.trim()) return intl.formatMessage({ id: 'CHECKOUT.ERROR_NAME' });
    if (customerPhone.replace(/\D/g, '').length < PHONE_MIN_DIGITS) {
      return intl.formatMessage({ id: 'CHECKOUT.ERROR_PHONE' });
    }
    if (deliverySelected && !deliveryAddress.trim()) {
      return intl.formatMessage({ id: 'CHECKOUT.ERROR_ADDRESS' });
    }
    return null;
  }

  async function submit() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      // Solo `productId` + `quantity`: ni precio, ni total, ni moneda. El servidor los recalcula
      // con el catálogo publicado, y la dirección solo viaja con domicilio (con recogida el
      // backend la ignora y el cliente no la escribe porque ni la ve).
      const result = await catalogHttpService.createPublicOrder(storeSlug, {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        deliveryType,
        ...(deliverySelected ? { deliveryAddress: deliveryAddress.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
      });

      if (!result.succeeded) {
        setError(intl.formatMessage({ id: 'CHECKOUT.FAILED' }));
        return;
      }
      onCreated(result.data);
    } catch {
      setError(intl.formatMessage({ id: 'CHECKOUT.FAILED' }));
    } finally {
      setSubmitting(false);
    }
  }

  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const currency = lines[0]?.currency;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={intl.formatMessage({ id: 'CHECKOUT.TITLE' })}
      testId="catalog-checkout-modal"
    >
      <div className="space-y-4">
        <div className="rounded-md border border-border bg-surface-hover p-3">
          <span className="text-xs font-medium text-text-muted">
            {intl.formatMessage({ id: 'CHECKOUT.SUMMARY' })}
          </span>
          <ul className="mt-1 space-y-1" data-testid="checkout-summary">
            {lines.map((line) => (
              <li key={line.productId} className="flex justify-between gap-2 text-sm text-text">
                <span className="min-w-0 break-words">
                  {line.name} × {line.quantity}
                </span>
                <span className="shrink-0 text-text-muted">
                  {formatMoneyWithCurrency(line.unitPrice * line.quantity, currencyFromCode(line.currency))}
                </span>
              </li>
            ))}
          </ul>
          {deliverySelected && config.deliveryFee > 0 && (
            <p className="mt-2 text-xs text-text-muted" data-testid="checkout-delivery-fee">
              {intl.formatMessage({ id: 'CHECKOUT.DELIVERY_FEE' })}:{' '}
              {formatMoneyWithCurrency(config.deliveryFee, currencyFromCode(currency))}
            </p>
          )}
          {config.minimumOrderAmount > 0 && (
            <p className="mt-1 text-xs text-text-muted" data-testid="checkout-minimum">
              {intl.formatMessage({ id: 'CHECKOUT.MINIMUM_ORDER' })}:{' '}
              {formatMoneyWithCurrency(config.minimumOrderAmount, currencyFromCode(currency))}
            </p>
          )}
          <p className="mt-2 border-t border-border pt-2 text-sm">
            <span className="font-medium text-text">
              {intl.formatMessage({ id: 'CATALOG_PUBLIC.CART_SUBTOTAL' })}
            </span>{' '}
            <span className="font-bold text-primary" data-testid="checkout-subtotal">
              {formatMoneyWithCurrency(subtotal, currencyFromCode(currency))}
            </span>
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted" htmlFor="checkout-name">
            {intl.formatMessage({ id: 'CHECKOUT.NAME' })}
          </label>
          <input
            id="checkout-name"
            type="text"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            placeholder={intl.formatMessage({ id: 'CHECKOUT.NAME_PLACEHOLDER' })}
            className={INPUT_CLASSES}
            data-testid="checkout-name"
          />
        </div>

        <div>
          <label
            className="mb-1 block text-xs font-medium text-text-muted"
            htmlFor="checkout-phone"
          >
            {intl.formatMessage({ id: 'CHECKOUT.PHONE' })}
          </label>
          <input
            id="checkout-phone"
            type="tel"
            inputMode="tel"
            value={customerPhone}
            onChange={(event) => setCustomerPhone(event.target.value)}
            placeholder={intl.formatMessage({ id: 'CHECKOUT.PHONE_PLACEHOLDER' })}
            className={INPUT_CLASSES}
            data-testid="checkout-phone"
          />
        </div>

        {/* La modalidad la manda la CONFIG de la tienda: si solo admite una, no se ofrece la
            otra. Con ninguna disponible el propio config llega `enabled: false` y este flujo no
            se abre. */}
        {(config.pickupEnabled || config.deliveryEnabled) && (
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-text-muted">
              {intl.formatMessage({ id: 'CHECKOUT.DELIVERY_TYPE' })}
            </legend>
            <div className="space-y-1">
              {config.pickupEnabled && (
                <label className="flex items-center gap-2 text-sm text-text">
                  <input
                    type="radio"
                    name="delivery-type"
                    value={PublicOrderDeliveryType.Pickup}
                    checked={deliveryType === PublicOrderDeliveryType.Pickup}
                    onChange={() => setDeliveryType(PublicOrderDeliveryType.Pickup)}
                    data-testid="checkout-pickup"
                  />
                  {intl.formatMessage({ id: 'CHECKOUT.PICKUP' })}
                </label>
              )}
              {config.deliveryEnabled && (
                <label className="flex items-center gap-2 text-sm text-text">
                  <input
                    type="radio"
                    name="delivery-type"
                    value={PublicOrderDeliveryType.Delivery}
                    checked={deliveryType === PublicOrderDeliveryType.Delivery}
                    onChange={() => setDeliveryType(PublicOrderDeliveryType.Delivery)}
                    data-testid="checkout-delivery"
                  />
                  {intl.formatMessage({ id: 'CHECKOUT.DELIVERY' })}
                </label>
              )}
            </div>
          </fieldset>
        )}

        {/* La dirección SOLO con domicilio: con recogida ni se pide ni viaja. */}
        {deliverySelected && (
          <div data-testid="checkout-address-field">
            <label
              className="mb-1 block text-xs font-medium text-text-muted"
              htmlFor="checkout-address"
            >
              {intl.formatMessage({ id: 'CHECKOUT.ADDRESS' })}
            </label>
            <input
              id="checkout-address"
              type="text"
              value={deliveryAddress}
              onChange={(event) => setDeliveryAddress(event.target.value)}
              placeholder={intl.formatMessage({ id: 'CHECKOUT.ADDRESS_PLACEHOLDER' })}
              className={INPUT_CLASSES}
              data-testid="checkout-address"
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted" htmlFor="checkout-notes">
            {intl.formatMessage({ id: 'CHECKOUT.NOTES' })}
          </label>
          <textarea
            id="checkout-notes"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={intl.formatMessage({ id: 'CHECKOUT.NOTES_PLACEHOLDER' })}
            className={INPUT_CLASSES}
            data-testid="checkout-notes"
          />
        </div>

        {error && (
          <div data-testid="checkout-error">
            <InfoBox variant="danger">{error}</InfoBox>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            onClick={() => void submit()}
            disabled={submitting}
            data-testid="checkout-submit"
          >
            {intl.formatMessage({
              id: submitting ? 'CHECKOUT.SUBMITTING' : 'CHECKOUT.SUBMIT',
            })}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
