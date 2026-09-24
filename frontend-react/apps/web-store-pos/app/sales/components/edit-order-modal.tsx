import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import type { Order } from '@store-mgmt/domain';
import {
  Currency,
  PaymentType,
  SalePaymentMethod,
  salePaymentMethodLabel,
  salePaymentMethodToLegacyPaymentType,
} from '@store-mgmt/domain';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { CloseIcon, EditIcon } from '~/shared/components/ui/icons';
import { showBlockingError } from '~/shared/lib/blocking-alert';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { normalizedOrderPaymentMethod } from '~/shared/lib/payment-method-resolved';
import {
  DEFAULT_ENABLED_PAYMENT_METHODS,
  StorePaymentMethodsConfigService,
  applyStorePaymentMethodsConfig,
} from '~/shared/lib/payment-methods/store-payment-methods-config-service';

interface EditOrderModalProps {
  order: Order;
  isOpen: boolean;
  onClose: () => void;
  /** Returns `true` on success, `false` on failure — mirrors Angular's
   * `orderService.updateTodayOrder(...)` returning a `DataResult` with `succeeded`. */
  onUpdate: (orderId: string, paymentType: PaymentType) => boolean;
}

/** Opción del radio: método real + valor legacy persistido + etiqueta visible. */
interface PaymentOption {
  method: SalePaymentMethod;
  value: PaymentType;
  label: string;
}

/**
 * Compone el catálogo de formas de pago de la orden. T9
 * (payment-channels-and-multipayment): una orden ya REGISTRADA se edita con el
 * catálogo NORMALIZADO — Efectivo y Transferencia (CUP); Zelle y las
 * Transferencias de otras monedas se presentan como Transferencia (CUP). Se
 * conserva el gate por config de tienda (Transferencia desactivable; Efectivo
 * siempre). Si el método actual quedara fuera del catálogo, se mantiene visible
 * al final para que el radio nunca pierda su valor.
 */

/**
 * Matches Angular's `edit-order-modal.component.html` 1:1: title is literally
 * `SALE_CREDIT.PAYMENT_CREDIT` ("Venta por Cobrar") in Angular's source — not
 * an order-specific title, no order metadata/items list is shown here (that
 * lives in `order-item-list`). Only a payment-type radio group + Cerrar/
 * Actualizar actions.
 */
export function EditOrderModal({ order, isOpen, onClose, onUpdate }: EditOrderModalProps) {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const storeId = user?.selectedStoreId ?? '';
  // T9: el valor legacy del radio se expresa SIEMPRE contra CUP (el catálogo
  // normalizado) — así el método normalizado coincide con una opción del radio.
  const [paymentType, setPaymentType] = useState<PaymentType>(() =>
    salePaymentMethodToLegacyPaymentType(normalizedOrderPaymentMethod(order), Currency.CUP),
  );

  // store-payment-methods-config: métodos habilitados de la tienda activa
  // (default: todos on — no-regresión). SSR: sin window se usa el default y la
  // hidratación lee localStorage. Instancia fresca por memo (cache por instancia).
  const enabledMethods = useMemo(() => {
    if (typeof window === 'undefined' || !storeId) {
      return [...DEFAULT_ENABLED_PAYMENT_METHODS];
    }
    return new StorePaymentMethodsConfigService(storeId).getEnabledMethods(storeId);
  }, [storeId]);

  const paymentOptions = useMemo<PaymentOption[]>(() => {
    const catalog = applyStorePaymentMethodsConfig(
      [SalePaymentMethod.Efectivo, SalePaymentMethod.Transferencia],
      enabledMethods,
    ).map((method) => ({
      method,
      value: salePaymentMethodToLegacyPaymentType(method, Currency.CUP),
      label: salePaymentMethodLabel(method, Currency.CUP),
    }));
    const current = normalizedOrderPaymentMethod(order);
    if (catalog.some((o) => o.method === current)) return catalog;
    return [
      ...catalog,
      {
        method: current,
        value: salePaymentMethodToLegacyPaymentType(current, Currency.CUP),
        label: salePaymentMethodLabel(current, Currency.CUP),
      },
    ];
  }, [order, enabledMethods]);

  if (!isOpen) return null;

  // Angular: edit-order-modal.component.ts:39-54 — on failure, Swal.fire({ icon: 'error',
  // title: GENERAL.ERROR, text: dataEntry.errors[0].description }); modal stays open.
  // `updateTodayOrder` has exactly one failure branch (record not found ->
  // OrderErrors.NotExists), so the "dynamic" description is always this static literal.
  function handleSubmit() {
    if (!order?.id) return;
    const succeeded = onUpdate(order.id, paymentType);
    if (succeeded) {
      onClose();
    } else {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        intl.formatMessage({ id: 'ORDER_ERRORS.NOT_EXISTS' }),
      );
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg">
        <Card
          title={
            <div className="flex items-center justify-between">
              {/* SALE_CREDIT.PAYMENT_CREDIT (Angular's literal modal title) */}
              <span>{intl.formatMessage({ id: 'SALE_CREDIT.PAYMENT_CREDIT' })}</span>
              <button
                onClick={onClose}
                className="text-text-muted hover:text-text"
                aria-label={intl.formatMessage({ id: 'GENERAL.CLOSE' })}
              >
                <CloseIcon />
              </button>
            </div>
          }
        >
          <fieldset className="space-y-2">
            {paymentOptions.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-sm text-text">
                <input
                  type="radio"
                  name="paymentType"
                  value={opt.value}
                  checked={paymentType === opt.value}
                  onChange={() => setPaymentType(opt.value)}
                  className="accent-primary"
                />
                {opt.label}
              </label>
            ))}
          </fieldset>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="fab" onClick={onClose} data-testid="edit-order-close-button">
              <CloseIcon />
              {/* GENERAL.CLOSE */}
              {intl.formatMessage({ id: 'GENERAL.CLOSE' })}
            </Button>
            <Button variant="fab" onClick={handleSubmit} data-testid="edit-order-update-button">
              <EditIcon />
              {/* GENERAL.UPDATE */}
              {intl.formatMessage({ id: 'GENERAL.UPDATE' })}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
