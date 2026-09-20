import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import {
  convertPaymentAmount,
  defaultPaymentMethodForCurrency,
  paymentMethodOptionsForCurrency,
  salePaymentMethodLabel,
  summarizePayments,
  Currency,
  SalePaymentMethod,
} from '@store-mgmt/domain';
import type { BaseError, ChannelRate } from '@store-mgmt/domain';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { hasMultiPaymentsModuleAvailable } from '~/shared/lib/auth/authorization-service';
import { currencyLabel, formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';
import { ChannelRateOfflineService } from '~/management/channel-rates/lib/services/channel-rate-offline-service';

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

function newRowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `payment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

  function updateRow(id: string, patch: Partial<MultiPaymentRow>) {
    onChange(payments.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function changeCurrency(id: string, currency: Currency) {
    // A currency change re-pins the method to that currency's first option so
    // the row never keeps a method its new channel cannot offer.
    updateRow(id, { currency, method: defaultPaymentMethodForCurrency(currency) });
  }

  function removeRow(id: string) {
    onChange(payments.filter((row) => row.id !== id));
  }

  function addRow() {
    onChange([
      ...payments,
      {
        id: newRowId(),
        method: defaultPaymentMethodForCurrency(orderCurrency),
        currency: orderCurrency,
        amount: 0,
      },
    ]);
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
          const methodOptions = paymentMethodOptionsForCurrency(row.currency);
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
                  className="rounded-md border border-border px-2 py-1 text-xs text-red-600"
                  data-testid="multi-payment-remove"
                >
                  {intl.formatMessage({ id: 'SHOPPING_CART.MULTI_PAYMENT_REMOVE' })}
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
        onClick={addRow}
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

      <p
        className={blocked ? 'text-xs text-red-600' : 'text-xs text-text-muted'}
        role={blocked ? 'alert' : undefined}
        data-testid="multi-payment-block-reason"
        data-block-reason={blockReason}
      >
        {blockMessage()}
      </p>

      <button
        type="button"
        disabled={blocked}
        data-testid="multi-payment-settle"
        data-blocked={blocked ? 'true' : 'false'}
        data-block-reason={blockReason}
        className="w-full rounded-md bg-cyan-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {intl.formatMessage({ id: 'SHOPPING_CART.MULTI_PAYMENT_SETTLE' })}
      </button>
    </div>
  );
}
