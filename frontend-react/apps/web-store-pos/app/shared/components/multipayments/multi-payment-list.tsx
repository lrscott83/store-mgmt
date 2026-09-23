import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import {
  convertPaymentAmount,
  channelKey,
  isValidChannel,
  paymentMethodOptionsForCurrency,
  salePaymentMethodLabel,
  summarizePayments,
  Currency,
  PAYMENT_CHANNELS,
  SalePaymentMethod,
} from '@store-mgmt/domain';
import type { BaseError, ChannelRate, PaymentChannel } from '@store-mgmt/domain';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { hasMultiPaymentsModuleAvailable } from '~/shared/lib/auth/authorization-service';
import { currencyLabel, formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';
import { ChannelRateOfflineService } from '~/management/channel-rates/lib/services/channel-rate-offline-service';
import { hasMultiMonedasAvailable } from '~/shared/components/multimonedas/currency-select';
import { Modal } from '~/shared/components/ui/modal';
import { TrashIcon } from '~/shared/components/ui/icons';
import {
  DEFAULT_ENABLED_PAYMENT_METHODS,
  StorePaymentMethodsConfigService,
  applyStorePaymentMethodsConfig,
} from '~/shared/lib/payment-methods/store-payment-methods-config-service';

/**
 * multipayments (T7) — controlled multi-payment list. Self-contained: it owns
 * no state and no submit path, so a later wiring step mounts it and feeds the
 * rows back to the order.
 *
 * UNIT BOUNDARY (crossed exactly once, in this file): the domain helpers work
 * in INTEGER CENTS, while the amount the user types in this UI is in currency
 * UNITS. `amount * 100` converts on the way in (`convertPaymentAmount`,
 * `summarizePayments`) and `cents / 100` converts on the way out when
 * formatting. No other money math happens here.
 *
 * Module 16 gate: without the MultiPayments module the component renders
 * nothing, mirroring `CartCurrencySelect`. Non-positive rows are filtered out
 * before the tally because `summarizePayments` rejects them (typed
 * `PaymentTallyErrors.NonPositiveAmount`) instead of ignoring them.
 */

/** One editable payment row. Amount is in `currency` units, NOT cents. */
export interface MultiPaymentRow {
  id: string;
  method: SalePaymentMethod;
  currency: Currency;
  /** Amount typed by the user, in `currency` units (not cents). */
  amount: number;
}

interface MultiPaymentListProps {
  /** Controlled rows — the caller owns the state and receives a fresh array per edit. */
  payments: readonly MultiPaymentRow[];
  onChange: (payments: MultiPaymentRow[]) => void;
  /** Currency the order total and every converted amount are expressed in. */
  orderCurrency: Currency;
  /** Order total in `orderCurrency` units. */
  total: number;
  testId?: string;
}

/** A row evaluated against the channel-rate register for the current sale. */
interface EvaluatedRow {
  row: MultiPaymentRow;
  /** Converted amount in order-currency CENTS; null when skipped or unconvertible. */
  convertedCents: number | null;
  /** Non-positive amount: excluded from the tally, never sent to the domain tally. */
  skipped: boolean;
  /** Typed conversion error (e.g. RateNotFound); null means no error. */
  error: BaseError | null;
}

/** All currencies offered per channel, mirroring the rate register's catalogue. */
const CURRENCY_OPTIONS: Currency[] = [
  Currency.CUP,
  Currency.USD,
  Currency.EUR,
  Currency.MLC,
  Currency.CLA,
  Currency.CAD,
  Currency.MXN,
];

/** Stable row id, exported so the caller can seed the default row. */
export function newPaymentRowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `payment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Builds a payment row with a fresh id. Exported so the cart can seed the
 * default Efectivo row without duplicating the id strategy.
 */
export function createPaymentRow(
  method: SalePaymentMethod,
  currency: Currency,
  amount: number,
): MultiPaymentRow {
  return { id: newPaymentRowId(), method, currency, amount };
}

/**
 * Controlled multi-payment list (module 16). Renders nothing without the
 * module; with it, each row is a channel (method + currency) plus an amount,
 * converted to the order currency through the frozen channel-rate cascade.
 */
export function MultiPaymentList({
  payments,
  onChange,
  orderCurrency,
  total,
  testId,
}: MultiPaymentListProps) {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const storeId = user?.selectedStoreId ?? '';
  const available = hasMultiPaymentsModuleAvailable(user);
  // T6: the "Agregar pago" popup picks a channel from the canonical catalogue;
  // `addChannelKey` is the `channelKey` of the pending selection.
  const [addOpen, setAddOpen] = useState(false);
  const [addChannelKey, setAddChannelKey] = useState('');

  // store-payment-methods-config: métodos habilitados de la tienda activa
  // (default: todos on — no-regresión). SSR: sin window se usa el default y la
  // hidratación lee localStorage. Instancia fresca por memo (cache por instancia).
  const enabledMethods = useMemo(() => {
    if (typeof window === 'undefined' || !storeId) {
      return [...DEFAULT_ENABLED_PAYMENT_METHODS];
    }
    return new StorePaymentMethodsConfigService(storeId).getEnabledMethods(storeId);
  }, [storeId]);

  // T6: canales válidos ofrecidos por el popup = catálogo canónico del dominio
  // (`PAYMENT_CHANNELS`) → gate de plan (sin MultiMonedas no hay Zelle) →
  // config por-tienda (métodos que la tienda deshabilitó fuera). Así el popup
  // nunca puede agregar una combinación que no exista (p. ej. Zelle+CUP).
  const channels = useMemo<PaymentChannel[]>(() => {
    const planGated = PAYMENT_CHANNELS.filter(
      (channel) => hasMultiMonedasAvailable(user) || channel.method !== SalePaymentMethod.Zelle,
    );
    return planGated.filter(
      (channel) => applyStorePaymentMethodsConfig([channel.method], enabledMethods).length > 0,
    );
  }, [user, enabledMethods]);

  // Rates are read once per store. Skipped during SSR/empty store, where there
  // is no local register to read from.
  const rates = useMemo<ChannelRate[]>(() => {
    if (typeof window === 'undefined' || !storeId) return [];
    return new ChannelRateOfflineService(storeId).getStorageChannelRates();
  }, [storeId]);

  const evaluated = useMemo<EvaluatedRow[]>(() => {
    const at = new Date();
    return payments.map<EvaluatedRow>((row) => {
      if (!Number.isFinite(row.amount) || row.amount <= 0) {
        return { row, convertedCents: null, skipped: true, error: null };
      }
      // Inbound boundary: units -> cents.
      const result = convertPaymentAmount(
        Math.round(row.amount * 100),
        row.method,
        row.currency,
        orderCurrency,
        rates,
        at,
      );
      if (!result.succeeded || result.data === undefined) {
        // A missing cross-currency rate is a typed error, NEVER a silent 0.
        return { row, convertedCents: null, skipped: false, error: result.errors[0] ?? null };
      }
      return { row, convertedCents: result.data, skipped: false, error: null };
    });
  }, [payments, orderCurrency, rates]);

  const totalCents = Math.round(total * 100);
  const tallyInput = evaluated
    .filter(
      (entry) =>
        !entry.skipped &&
        entry.error === null &&
        entry.convertedCents !== null &&
        entry.convertedCents > 0,
    )
    .map((entry) => ({ amountInOrderCurrency: entry.convertedCents as number }));

  const summary = summarizePayments(totalCents, tallyInput);
  const firstError = evaluated.find((entry) => entry.error !== null)?.error ?? null;
  const hasConversionError = firstError !== null;
  const underpaid = summary.remaining > 0;
  const blocked = hasConversionError || underpaid;
  const blockReason = hasConversionError ? 'conversion_error' : underpaid ? 'underpaid' : 'none';

  if (!available) {
    return null;
  }

  const money = (units: number) => formatMoneyWithCurrency(units, orderCurrency);

  function convertedLabel(entry: EvaluatedRow): string {
    if (entry.convertedCents !== null) return money(entry.convertedCents / 100);
    if (entry.skipped) return '—';
    return '';
  }

  function blockMessage(): string {
    if (hasConversionError) return firstError?.description ?? '';
    if (underpaid) {
      return intl.formatMessage({ id: 'SHOPPING_CART.DON_NOT_PAY_LESS_THAN_CART_TOTAL' });
    }
    return '';
  }

  /**
   * Catálogo de métodos de una fila: catálogo por moneda → gate de plan
   * (sin MultiMonedas no hay Zelle) → config por-tienda (métodos que la tienda
   * deshabilitó fuera). Efectivo queda siempre: si el resultado fuera vacío
   * (MLC/CLA con Transferencia desactivada), se ofrece Efectivo para que el
   * select de la fila siga siendo válido.
   */
  function methodOptionsFor(currency: Currency): SalePaymentMethod[] {
    const base = paymentMethodOptionsForCurrency(currency);
    const planGate = hasMultiMonedasAvailable(user)
      ? base
      : base.filter((m) => m !== SalePaymentMethod.Zelle);
    const composed = applyStorePaymentMethodsConfig(planGate, enabledMethods);
    return composed.length > 0 ? composed : [SalePaymentMethod.Efectivo];
  }

  function updateRow(id: string, patch: Partial<MultiPaymentRow>) {
    onChange(payments.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function changeCurrency(id: string, currency: Currency) {
    // A currency change re-pins the method to that currency's first option so
    // the row never keeps a method its new channel cannot offer.
    const options = methodOptionsFor(currency);
    updateRow(id, { currency, method: options[0] ?? SalePaymentMethod.Efectivo });
  }

  function removeRow(id: string) {
    onChange(payments.filter((row) => row.id !== id));
  }

  /**
   * T6: opens the channel popup. The pending selection defaults to the first
   * valid channel of the catalogue for the current sale context.
   */
  function openAddDialog() {
    const first = channels[0];
    setAddChannelKey(first ? channelKey(first.method, first.currency) : '');
    setAddOpen(true);
  }

  /**
   * T6: appends the chosen channel. Starting amount = the remaining amount to
   * cover (in sale-currency units) when the channel is in the sale currency;
   * otherwise 0, because a cross-currency amount cannot be prefilled without a
   * rate. The user edits it afterwards.
   */
  function confirmAddChannel() {
    const selected =
      channels.find((channel) => channelKey(channel.method, channel.currency) === addChannelKey) ??
      channels[0];
    if (!selected || !isValidChannel(selected.method, selected.currency)) return;
    const sameCurrency = Number(selected.currency) === Number(orderCurrency);
    const startingAmount = sameCurrency && summary.remaining > 0 ? summary.remaining / 100 : 0;
    onChange([...payments, createPaymentRow(selected.method, selected.currency, startingAmount)]);
    setAddOpen(false);
  }

  return (
    <div
      className="border-b border-border px-4 py-3 space-y-3"
      data-testid={testId ?? 'multi-payment-list'}
    >
      <h3 className="text-sm font-semibold text-text">
        {intl.formatMessage({ id: 'SHOPPING_CART.MULTI_PAYMENT_TITLE' })}
      </h3>

      <div className="space-y-2" data-testid="multi-payment-rows">
        {evaluated.map((entry) => {
          const { row } = entry;
          const methodOptions = methodOptionsFor(row.currency);
          return (
            <div
              key={row.id}
              className="rounded-md border border-border p-2 space-y-2"
              data-testid="multi-payment-row"
            >
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-text-muted">
                    {intl.formatMessage({ id: 'SHOPPING_CART.MULTI_PAYMENT_METHOD_LABEL' })}
                  </span>
                  <select
                    value={row.method}
                    onChange={(e) =>
                      updateRow(row.id, { method: Number(e.target.value) as SalePaymentMethod })
                    }
                    className="w-full rounded-md border border-border px-2 py-1 text-sm"
                    data-testid="multi-payment-method"
                  >
                    {methodOptions.map((method) => (
                      <option key={method} value={method}>
                        {salePaymentMethodLabel(method, row.currency)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-text-muted">
                    {intl.formatMessage({ id: 'SHOPPING_CART.MULTI_PAYMENT_CURRENCY_LABEL' })}
                  </span>
                  <select
                    value={row.currency}
                    onChange={(e) => changeCurrency(row.id, Number(e.target.value) as Currency)}
                    className="w-full rounded-md border border-border px-2 py-1 text-sm"
                    data-testid="multi-payment-currency"
                  >
                    {CURRENCY_OPTIONS.map((currency) => (
                      <option key={currency} value={currency}>
                        {currencyLabel(currency)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-text-muted">
                    {intl.formatMessage({ id: 'SHOPPING_CART.MULTI_PAYMENT_AMOUNT_LABEL' })}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.amount}
                    onChange={(e) => updateRow(row.id, { amount: Number(e.target.value) })}
                    className="w-full rounded-md border border-border px-2 py-1 text-sm"
                    data-testid="multi-payment-amount"
                  />
                </label>
              </div>

              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-text-muted" data-testid="multi-payment-converted">
                  <span className="font-medium">
                    {intl.formatMessage({ id: 'SHOPPING_CART.MULTI_PAYMENT_CONVERTED_LABEL' })}
                  </span>{' '}
                  {convertedLabel(entry)}
                </p>
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  aria-label={intl.formatMessage({ id: 'SHOPPING_CART.MULTI_PAYMENT_REMOVE' })}
                  className="rounded-md border border-border p-1 text-red-600 hover:bg-surface-hover"
                  data-testid="multi-payment-remove"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>

              {entry.error && (
                <p
                  className="text-xs text-red-600"
                  role="alert"
                  data-testid="multi-payment-row-error"
                  data-error-code={entry.error.code}
                >
                  {entry.error.description}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={openAddDialog}
        className="rounded-md border border-border px-3 py-1 text-xs text-text"
        data-testid="multi-payment-add"
      >
        {intl.formatMessage({ id: 'SHOPPING_CART.MULTI_PAYMENT_ADD' })}
      </button>

      <dl
        className="grid grid-cols-3 gap-2 rounded-md bg-gray-50 p-2 text-sm"
        data-testid="multi-payment-summary"
      >
        <div>
          <dt className="text-xs text-text-muted">
            {intl.formatMessage({ id: 'SHOPPING_CART.MULTI_PAYMENT_PAID_LABEL' })}
          </dt>
          <dd className="font-semibold text-text" data-testid="multi-payment-paid">
            {money(summary.paid / 100)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">
            {intl.formatMessage({ id: 'SHOPPING_CART.MULTI_PAYMENT_REMAINING_LABEL' })}
          </dt>
          <dd className="font-semibold text-text" data-testid="multi-payment-remaining">
            {money(summary.remaining / 100)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">
            {intl.formatMessage({ id: 'SHOPPING_CART.MULTI_PAYMENT_CHANGE_LABEL' })}
          </dt>
          <dd className="font-semibold text-text" data-testid="multi-payment-change">
            {money(summary.change / 100)}
          </dd>
        </div>
      </dl>

      {/* T5: el motivo de bloqueo solo se pinta cuando hay un bloqueo real
        (subpago o error de conversión); sin bloqueo no se renderiza vacío. */}
      {blocked && (
        <p
          className="text-xs text-red-600"
          role="alert"
          data-testid="multi-payment-block-reason"
          data-block-reason={blockReason}
        >
          {blockMessage()}
        </p>
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={intl.formatMessage({ id: 'SHOPPING_CART.MULTI_PAYMENT_ADD_TITLE' })}
        testId="multi-payment-add-dialog"
      >
        {channels.length === 0 ? (
          <p className="text-sm text-text-muted" data-testid="multi-payment-add-empty">
            {intl.formatMessage({ id: 'SHOPPING_CART.MULTI_PAYMENT_ADD_NO_CHANNELS' })}
          </p>
        ) : (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text-muted">
              {intl.formatMessage({ id: 'SHOPPING_CART.MULTI_PAYMENT_ADD_CHANNEL_LABEL' })}
            </span>
            <select
              value={addChannelKey}
              onChange={(e) => setAddChannelKey(e.target.value)}
              className="w-full rounded-md border border-border px-2 py-1 text-sm"
              data-testid="multi-payment-add-channel"
            >
              {channels.map((channel) => (
                <option
                  key={channelKey(channel.method, channel.currency)}
                  value={channelKey(channel.method, channel.currency)}
                >
                  {salePaymentMethodLabel(channel.method, channel.currency)}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={confirmAddChannel}
            disabled={channels.length === 0}
            className="rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="multi-payment-add-confirm"
          >
            {intl.formatMessage({ id: 'SHOPPING_CART.MULTI_PAYMENT_ADD_CONFIRM' })}
          </button>
        </div>
      </Modal>
    </div>
  );
}
