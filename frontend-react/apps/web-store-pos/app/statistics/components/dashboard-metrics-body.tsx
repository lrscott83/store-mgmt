import { useState } from 'react';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';
import type { Currency, Expense } from '@store-mgmt/domain';
import { DEFAULT_CURRENCY, PaymentType } from '@store-mgmt/domain';
import { Modal } from '~/shared/components/ui/modal';
import { addDays, formatLocalDate } from '~/shared/lib/date-utils';
import { currencyLabel } from '~/shared/lib/format-money-with-currency';
import type { CurrencyTotal } from '~/shared/lib/currency-totals';
import type {
  CurrencyRangeBucket,
  CurrencyRangeMetrics,
  DashboardRangeMetrics,
  RangeBucket,
} from '../lib/dashboard-range-aggregator';
import { localDaySpan } from '../lib/dashboard-range-aggregator';
import {
  categoryBreakdown,
  formatBucketLabel,
  orderCurrencies,
  paymentBreakdown,
  topProductsByProfit,
  topProductsByQuantity,
} from '../lib/dashboard-breakdowns';
import { DonutChart } from './donut-chart';
import { KpiCard } from './kpi-card';
import { ProfitChart } from './profit-chart';
import { SalesChart } from './sales-chart';

/**
 * The owner dashboard's metrics body for ONE store (or the merged general view):
 * the 8 KPI cards, the two range charts, the two per-currency donuts and the two
 * top-product tables — plus their detail popups. The route owns the date filter,
 * the data loading and the multi-store panel scaffolding; this component only
 * renders one `DashboardRangeMetrics` snapshot.
 *
 * All amounts follow the currency rule: values are grouped per currency and the
 * primary follows the display order (USD → EUR → CUP → highest amount). With 2+
 * currencies the card shows a "+" that opens the full per-currency breakdown.
 */

type KpiKey =
  | 'sales'
  | 'expenses'
  | 'grossProfit'
  | 'netProfit'
  | 'marginPct'
  | 'avgPerTxn'
  | 'unitsPerTxn'
  | 'credits';

type KpiValueKind = 'money' | 'percent' | 'count';

interface KpiDefinition {
  key: KpiKey;
  title: string;
  valueOf: (group: CurrencyRangeMetrics) => number;
  bucketValueOf: (bucket: CurrencyRangeBucket) => number;
  kind: KpiValueKind;
  color: string;
}

/** The seven order-derived cards, in render order (Créditos is handled apart). */
const KPI_DEFINITIONS: readonly KpiDefinition[] = [
  {
    key: 'sales',
    title: 'Ventas',
    valueOf: (group) => group.salesTotal,
    bucketValueOf: (bucket) => bucket.salesTotal,
    kind: 'money',
    color: '#2563eb',
  },
  {
    key: 'expenses',
    title: 'Gastos',
    valueOf: (group) => group.expensesTotal,
    bucketValueOf: (bucket) => bucket.expensesTotal,
    kind: 'money',
    color: '#dc2626',
  },
  {
    key: 'grossProfit',
    title: 'Ganancias Bruta',
    valueOf: (group) => group.grossProfit,
    bucketValueOf: (bucket) => bucket.grossProfit,
    kind: 'money',
    color: '#16a34a',
  },
  {
    key: 'netProfit',
    title: 'Ganancias',
    valueOf: (group) => group.netProfit,
    bucketValueOf: (bucket) => bucket.netProfit,
    kind: 'money',
    color: '#0891b2',
  },
  {
    key: 'marginPct',
    title: 'Margen %',
    valueOf: (group) => group.marginPct,
    bucketValueOf: (bucket) => bucket.marginPct,
    kind: 'percent',
    color: '#7c3aed',
  },
  {
    key: 'avgPerTxn',
    title: 'Promedio por transacción',
    valueOf: (group) => group.avgPerTxn,
    bucketValueOf: (bucket) => bucket.avgPerTxn,
    kind: 'money',
    color: '#d97706',
  },
  {
    key: 'unitsPerTxn',
    title: 'Unidades/transacción',
    valueOf: (group) => group.unitsPerTxn,
    bucketValueOf: (bucket) => bucket.unitsPerTxn,
    kind: 'count',
    color: '#db2777',
  },
];

const CREDITS_TITLE = 'Créditos por cobrar';

/** All order types mixed into these numbers (visible note requirement). */
const ALL_ORDER_TYPES_NOTE =
  'Incluye todos los tipos de venta (normal, mayorista, merma, ajuste, otro)';

const PAYMENT_LABEL_IDS: Record<number, string> = {
  [PaymentType.Efectivo]: 'CART.EFECTIVO',
  [PaymentType.Tarjeta]: 'CART.TARJETA',
  [PaymentType.Zelle]: 'CART.ZELLE',
};

/** Zero-valued fallback group so the cards render without data (all "0"). */
function emptyGroup(): CurrencyRangeMetrics {
  return {
    currency: DEFAULT_CURRENCY,
    salesTotal: 0,
    expensesTotal: 0,
    grossProfit: 0,
    netProfit: 0,
    marginPct: 0,
    txnCount: 0,
    avgPerTxn: 0,
    unitsPerTxn: 0,
  };
}

function amountOf(totals: readonly CurrencyTotal[], currency: Currency): number {
  return totals.find((total) => total.currency === currency)?.amount ?? 0;
}

function byDateDesc<T extends { date: Date }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export interface DashboardMetricsBodyProps {
  metrics: DashboardRangeMetrics;
  hasExpensesModule: boolean;
  hasCreditsModule: boolean;
  /** Formats an amount in its own currency (legacy rate conversion when MultiMonedas is off). */
  formatAmount: (amount: number, currency: Currency) => string;
  /** `8/9 – 14/9` label of the selected range (tables subtitle). */
  rangeLabel: string;
  loadingMessage: string;
  emptyMessage: string;
}

export function DashboardMetricsBody({
  metrics,
  hasExpensesModule,
  hasCreditsModule,
  formatAmount,
  rangeLabel,
  loadingMessage,
  emptyMessage,
}: DashboardMetricsBodyProps) {
  const intl = useIntl();
  const [popup, setPopup] = useState<{
    key: KpiKey;
    kind: 'detail' | 'trend' | 'currencies';
  } | null>(null);
  const [breakdownSelection, setBreakdownSelection] = useState<Currency | null>(null);

  const primary = metrics.primary ?? emptyGroup();
  const primaryCurrency = primary.currency;
  const daysInWindow = localDaySpan(metrics.window);

  // Currency chips of the order breakdowns (donuts/tables): display order, only
  // currencies actually present in the window's orders.
  const breakdownCurrencies = orderCurrencies(metrics.orders);
  const activeBreakdownCurrency =
    breakdownSelection !== null && breakdownCurrencies.includes(breakdownSelection)
      ? breakdownSelection
      : (breakdownCurrencies[0] ?? primaryCurrency);

  const definitions = KPI_DEFINITIONS.filter(
    (definition) => definition.key !== 'expenses' || hasExpensesModule,
  );

  const paymentLabel = (paymentType: PaymentType): string =>
    intl.formatMessage({ id: PAYMENT_LABEL_IDS[paymentType] ?? 'CART.EFECTIVO' });

  function formatKpiValue(definition: KpiDefinition, group: CurrencyRangeMetrics): string {
    const value = definition.valueOf(group);
    if (definition.kind === 'money') return formatAmount(value, group.currency);
    if (definition.kind === 'percent') return `${value.toFixed(2)} %`;
    return value.toFixed(2);
  }

  function currencyTotalsOf(definition: KpiDefinition): CurrencyTotal[] {
    return metrics.groups.map((group) => ({
      currency: group.currency,
      label: currencyLabel(group.currency),
      amount: definition.valueOf(group),
    }));
  }

  function previousValueOf(definition: KpiDefinition): number {
    const previous = metrics.previousGroups.find((group) => group.currency === primaryCurrency);
    return previous ? definition.valueOf(previous) : 0;
  }

  function sparklineValuesOf(definition: KpiDefinition): number[] {
    const series = metrics.series.find((entry) => entry.currency === primaryCurrency);
    // Without data every card still shows its (flat, zero) sparkline.
    if (!series) return metrics.buckets.map(() => 0);
    return series.buckets.map(definition.bucketValueOf);
  }

  const creditsCurrency = metrics.creditsReceivablePrimary?.currency ?? primaryCurrency;
  const creditsSeries = metrics.creditsSeries.find((entry) => entry.currency === creditsCurrency);
  const creditsValues = creditsSeries
    ? creditsSeries.buckets.map((bucket) => bucket.balance)
    : metrics.buckets.map(() => 0);
  const creditsPrevious = amountOf(metrics.previousCreditsReceivable, creditsCurrency);

  // ─── Charts (primary currency; labels per the plan's X-axis rules) ─────────

  const primarySeries = metrics.series.find((entry) => entry.currency === primaryCurrency);
  const bucketLabel = (bucket: RangeBucket): string =>
    formatBucketLabel(bucket, metrics.granularity, daysInWindow);
  const chartPoints = (valueOf: (bucket: CurrencyRangeBucket) => number) =>
    (primarySeries?.buckets ?? []).map((bucket) => ({
      label: bucketLabel(bucket),
      value: valueOf(bucket),
    }));
  const formatChartValue = (value: number): string => formatAmount(value, primaryCurrency);

  // ─── Popups ────────────────────────────────────────────────────────────────

  function popupTitle(): string {
    if (!popup) return '';
    const title =
      popup.key === 'credits'
        ? CREDITS_TITLE
        : (KPI_DEFINITIONS.find((definition) => definition.key === popup.key)?.title ?? '');
    if (popup.kind === 'trend') return `${title} — vs anterior`;
    if (popup.kind === 'currencies') return `${title} — monedas`;
    return title;
  }

  function expenseRows(): ReactNode {
    const expenses = byDateDesc(metrics.expenses);
    if (expenses.length === 0) {
      return <p className="text-sm text-text-muted">{emptyMessage}</p>;
    }
    return expenses.map((expense) => (
      <AmountRow
        key={expense.id}
        label={expenseLabel(expense)}
        value={formatAmount(expense.total, expense.currency ?? DEFAULT_CURRENCY)}
      />
    ));
  }

  function expenseLabel(expense: Expense): string {
    const note = expense.note ? ` · ${expense.note}` : '';
    return `${formatLocalDate(expense.date)}${note}`;
  }

  function creditRows(): ReactNode {
    const credits = byDateDesc(metrics.unpaidCredits);
    if (credits.length === 0) {
      return <p className="text-sm text-text-muted">{emptyMessage}</p>;
    }
    return credits.map((credit) => (
      <AmountRow
        key={credit.id}
        label={`${formatLocalDate(credit.date)} · ${credit.client}`}
        value={formatAmount(credit.total, credit.currency ?? DEFAULT_CURRENCY)}
      />
    ));
  }

  function detailContent(): ReactNode {
    if (!popup) return null;

    if (popup.key === 'sales') {
      return metrics.groups.map((group) => {
        const slices = paymentBreakdown(metrics.orders, group.currency, paymentLabel);
        return (
          <PopupCard
            key={group.currency}
            title={`Método de pago — ${currencyLabel(group.currency)}`}
          >
            {slices.length === 0 ? (
              <p className="text-sm text-text-muted">{emptyMessage}</p>
            ) : (
              slices.map((slice) => (
                <AmountRow
                  key={slice.id}
                  label={slice.name}
                  value={formatAmount(slice.value, group.currency)}
                  secondary={`${share(slice.value, group.salesTotal)}%`}
                />
              ))
            )}
          </PopupCard>
        );
      });
    }

    if (popup.key === 'expenses') {
      return [
        ...metrics.groups
          .filter((group) => group.expensesTotal !== 0)
          .map((group) => (
            <PopupCard
              key={group.currency}
              title={`Total gastos — ${currencyLabel(group.currency)}`}
            >
              <AmountRow label="Gastos" value={formatAmount(group.expensesTotal, group.currency)} />
            </PopupCard>
          )),
        <PopupCard key="expense-rows" title="Gastos del rango">
          {expenseRows()}
        </PopupCard>,
      ];
    }

    if (popup.key === 'grossProfit') {
      return metrics.groups.map((group) => (
        <PopupCard key={group.currency} title={currencyLabel(group.currency)}>
          <AmountRow label="Ventas" value={formatAmount(group.salesTotal, group.currency)} />
          <AmountRow
            label="Costo"
            value={formatAmount(group.salesTotal - group.grossProfit, group.currency)}
          />
          <AmountRow
            label="Ganancia bruta"
            value={formatAmount(group.grossProfit, group.currency)}
          />
        </PopupCard>
      ));
    }

    if (popup.key === 'netProfit') {
      return metrics.groups.map((group) => (
        <PopupCard key={group.currency} title={currencyLabel(group.currency)}>
          <AmountRow
            label="Ganancia bruta"
            value={formatAmount(group.grossProfit, group.currency)}
          />
          <AmountRow label="Gastos" value={formatAmount(group.expensesTotal, group.currency)} />
          <AmountRow label="Ganancias" value={formatAmount(group.netProfit, group.currency)} />
        </PopupCard>
      ));
    }

    if (popup.key === 'marginPct') {
      return metrics.groups.map((group) => (
        <PopupCard key={group.currency} title={currencyLabel(group.currency)}>
          <AmountRow
            label="Margen %"
            value={`${formatAmount(group.grossProfit, group.currency)} ÷ ${formatAmount(
              group.salesTotal,
              group.currency,
            )} × 100 = ${group.marginPct.toFixed(2)} %`}
          />
        </PopupCard>
      ));
    }

    if (popup.key === 'avgPerTxn') {
      return metrics.groups.map((group) => (
        <PopupCard key={group.currency} title={currencyLabel(group.currency)}>
          <AmountRow label="Transacciones" value={String(group.txnCount)} />
          <AmountRow
            label="Promedio por transacción"
            value={`${formatAmount(group.salesTotal, group.currency)} ÷ ${group.txnCount} = ${formatAmount(
              group.avgPerTxn,
              group.currency,
            )}`}
          />
        </PopupCard>
      ));
    }

    if (popup.key === 'unitsPerTxn') {
      return metrics.groups.map((group) => (
        <PopupCard key={group.currency} title={currencyLabel(group.currency)}>
          <AmountRow label="Transacciones" value={String(group.txnCount)} />
          <AmountRow
            label="Unidades/transacción"
            value={`${(group.unitsPerTxn * group.txnCount).toFixed(2)} unidades ÷ ${
              group.txnCount
            } = ${group.unitsPerTxn.toFixed(2)}`}
          />
        </PopupCard>
      ));
    }

    // Créditos por cobrar: global balance (no date filter) + the unpaid list.
    return [
      <PopupCard key="credit-totals" title="Saldo por moneda">
        {metrics.creditsReceivable.map((total) => (
          <AmountRow
            key={total.currency}
            label={`Saldo — ${total.label}`}
            value={formatAmount(total.amount, total.currency)}
          />
        ))}
        <p className="mt-1 text-xs text-text-muted">
          Saldo global de créditos activos no pagados; no depende del rango de fechas.
        </p>
      </PopupCard>,
      <PopupCard key="credit-rows" title="Créditos sin pagar">
        {creditRows()}
      </PopupCard>,
    ];
  }

  function trendContent(): ReactNode {
    if (!popup) return null;
    if (popup.key === 'credits') {
      return (
        <div className="space-y-2 text-sm">
          <p>
            Compara el saldo global actual con el saldo al inicio del rango (fin del periodo
            anterior).
          </p>
          <AmountRow
            label="Rango anterior"
            value={`${formatLocalDate(metrics.previousWindow.start)} – ${formatLocalDate(
              addDays(metrics.previousWindow.end, -1),
            )}`}
          />
          <AmountRow
            label="Saldo al inicio del rango"
            value={formatAmount(creditsPrevious, creditsCurrency)}
          />
          <AmountRow
            label="Saldo actual"
            value={formatAmount(
              amountOf(metrics.creditsReceivable, creditsCurrency),
              creditsCurrency,
            )}
          />
        </div>
      );
    }
    const definition = KPI_DEFINITIONS.find((entry) => entry.key === popup.key);
    if (!definition) return null;
    return (
      <div className="space-y-2 text-sm">
        <p>
          Compara {definition.title.toLowerCase()} del periodo seleccionado con el periodo anterior,
          de la misma duración.
        </p>
        <AmountRow
          label="Rango anterior"
          value={`${formatLocalDate(metrics.previousWindow.start)} – ${formatLocalDate(
            addDays(metrics.previousWindow.end, -1),
          )}`}
        />
        <AmountRow label="Rango seleccionado" value={rangeLabel} />
        <AmountRow label="Anterior" value={formatKpiValue(definition, previousGroup())} />
        <AmountRow label="Actual" value={formatKpiValue(definition, primary)} />
      </div>
    );
  }

  /** Previous-window counterpart of the primary currency (zeros when absent). */
  function previousGroup(): CurrencyRangeMetrics {
    return (
      metrics.previousGroups.find((group) => group.currency === primaryCurrency) ?? {
        ...emptyGroup(),
        currency: primaryCurrency,
      }
    );
  }

  function currenciesContent(): ReactNode {
    if (!popup) return null;
    const totals =
      popup.key === 'credits'
        ? metrics.creditsReceivable
        : currencyTotalsOf(definitionOf(popup.key));
    return (
      <div className="space-y-2 text-sm">
        <p>Montos por moneda del periodo (sin conversión; las monedas no se suman entre sí).</p>
        {totals.map((total) => (
          <AmountRow
            key={total.currency}
            label={total.label}
            value={formatAmount(total.amount, total.currency)}
          />
        ))}
      </div>
    );
  }

  function definitionOf(key: KpiKey): KpiDefinition {
    return KPI_DEFINITIONS.find((entry) => entry.key === key) ?? KPI_DEFINITIONS[0];
  }

  function share(value: number, total: number): number {
    return total === 0 ? 0 : Math.round((value / total) * 100);
  }

  return (
    <div className="space-y-6">
      {/* KPI cards — two columns, mobile friendly. */}
      <div className="grid grid-cols-2 gap-4">
        {definitions.map((definition) => (
          <KpiCard
            key={definition.key}
            title={definition.title}
            valueText={formatKpiValue(definition, primary)}
            currencyTotals={currencyTotalsOf(definition)}
            actual={definition.valueOf(primary)}
            previous={previousValueOf(definition)}
            sparklineValues={sparklineValuesOf(definition)}
            sparklineColor={definition.color}
            testId={`kpi-${definition.key}`}
            onOpenDetail={() => setPopup({ key: definition.key, kind: 'detail' })}
            onOpenTrend={() => setPopup({ key: definition.key, kind: 'trend' })}
            onOpenCurrencies={() => setPopup({ key: definition.key, kind: 'currencies' })}
          />
        ))}
        {hasCreditsModule && (
          <KpiCard
            title={CREDITS_TITLE}
            valueText={formatAmount(
              amountOf(metrics.creditsReceivable, creditsCurrency),
              creditsCurrency,
            )}
            currencyTotals={metrics.creditsReceivable}
            actual={amountOf(metrics.creditsReceivable, creditsCurrency)}
            previous={creditsPrevious}
            sparklineValues={creditsValues}
            sparklineColor="#dc2626"
            testId="kpi-credits"
            onOpenDetail={() => setPopup({ key: 'credits', kind: 'detail' })}
            onOpenTrend={() => setPopup({ key: 'credits', kind: 'trend' })}
            onOpenCurrencies={() => setPopup({ key: 'credits', kind: 'currencies' })}
          />
        )}
      </div>

      {/* Charts — primary currency, adaptive buckets. */}
      <section className="rounded border bg-white p-4 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-700">
          {intl.formatMessage({ id: 'STATISTICS.SALES.TITLE' })}
          <span className="text-xs font-normal text-text-muted">
            {currencyLabel(primaryCurrency)}
          </span>
        </h2>
        <SalesChart
          data={chartPoints((bucket) => bucket.salesTotal)}
          loadingMessage={loadingMessage}
          emptyMessage={emptyMessage}
          formatValue={formatChartValue}
          seriesName={intl.formatMessage({ id: 'STATISTICS.SALES.TITLE' })}
        />
      </section>

      <section className="rounded border bg-white p-4 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-700">
          {intl.formatMessage({ id: 'STATISTICS.PROFIT.TITLE' })}
          <span className="text-xs font-normal text-text-muted">
            {currencyLabel(primaryCurrency)}
          </span>
        </h2>
        <ProfitChart
          data={chartPoints((bucket) => bucket.grossProfit)}
          loadingMessage={loadingMessage}
          emptyMessage={emptyMessage}
          formatValue={formatChartValue}
          seriesName={intl.formatMessage({ id: 'STATISTICS.PROFIT.TITLE' })}
        />
      </section>

      {/* Donuts — per currency, with the chips inside each card. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="rounded border bg-white p-4 shadow-sm">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h5 className="text-base font-semibold text-gray-700">
              Distribución por método de pago
            </h5>
            <CurrencyChips
              currencies={breakdownCurrencies}
              value={activeBreakdownCurrency}
              onChange={setBreakdownSelection}
            />
          </div>
          <DonutChart
            slices={paymentBreakdown(metrics.orders, activeBreakdownCurrency, paymentLabel)}
            loadingMessage={loadingMessage}
            emptyMessage={emptyMessage}
            formatValue={(value) => formatAmount(value, activeBreakdownCurrency)}
            testId="donut-payment"
          />
        </section>

        <section className="rounded border bg-white p-4 shadow-sm">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h5 className="text-base font-semibold text-gray-700">Distribución por categoría</h5>
            <CurrencyChips
              currencies={breakdownCurrencies}
              value={activeBreakdownCurrency}
              onChange={setBreakdownSelection}
            />
          </div>
          <DonutChart
            slices={categoryBreakdown(metrics.orders, activeBreakdownCurrency)}
            loadingMessage={loadingMessage}
            emptyMessage={emptyMessage}
            formatValue={(value) => formatAmount(value, activeBreakdownCurrency)}
            testId="donut-category"
          />
        </section>
      </div>

      {/* Top-product tables — same lists, for the selected range. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TopProductsCard
          title="Productos mayor ganancias"
          rangeLabel={rangeLabel}
          currency={activeBreakdownCurrency}
          currencies={breakdownCurrencies}
          onCurrencyChange={setBreakdownSelection}
          rows={topProductsByProfit(metrics.orders, activeBreakdownCurrency)}
          formatValue={(value) => formatAmount(value, activeBreakdownCurrency)}
          emptyMessage={emptyMessage}
        />
        <TopProductsCard
          title="Productos más vendidos"
          rangeLabel={rangeLabel}
          currency={activeBreakdownCurrency}
          currencies={breakdownCurrencies}
          onCurrencyChange={setBreakdownSelection}
          rows={topProductsByQuantity(metrics.orders, activeBreakdownCurrency)}
          formatValue={(value) => value.toFixed(2)}
          emptyMessage={emptyMessage}
        />
      </div>

      <Modal
        open={popup !== null}
        onClose={() => setPopup(null)}
        title={popupTitle()}
        testId="dashboard-popup"
      >
        {popup?.kind === 'detail' && detailContent()}
        {popup?.kind === 'trend' && trendContent()}
        {popup?.kind === 'currencies' && currenciesContent()}
      </Modal>
    </div>
  );
}

// ─── Small presentational pieces ──────────────────────────────────────────────

function PopupCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-3 rounded-lg border border-border bg-surface p-3">
      <h6 className="mb-2 text-sm font-semibold text-text">{title}</h6>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function AmountRow({
  label,
  value,
  secondary,
}: {
  label: string;
  value: string;
  secondary?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="min-w-0 text-text-muted">{label}</span>
      <span className="whitespace-nowrap text-right font-medium text-text">
        {value} {secondary !== undefined && <span className="text-text-muted">({secondary})</span>}
      </span>
    </div>
  );
}

function CurrencyChips({
  currencies,
  value,
  onChange,
}: {
  currencies: readonly Currency[];
  value: Currency;
  onChange: (currency: Currency) => void;
}) {
  if (currencies.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Moneda">
      {currencies.map((currency) => (
        <button
          key={currency}
          type="button"
          onClick={() => onChange(currency)}
          aria-pressed={currency === value}
          className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
            currency === value
              ? 'border-cyan-600 bg-cyan-50 text-cyan-700'
              : 'border-border text-text-muted hover:bg-surface-hover'
          }`}
        >
          {currencyLabel(currency)}
        </button>
      ))}
    </div>
  );
}

function TopProductsCard({
  title,
  rangeLabel,
  currency,
  currencies,
  onCurrencyChange,
  rows,
  formatValue,
  emptyMessage,
}: {
  title: string;
  rangeLabel: string;
  currency: Currency;
  currencies: readonly Currency[];
  onCurrencyChange: (currency: Currency) => void;
  rows: { id: string; name: string; value: number }[];
  formatValue: (value: number) => string;
  emptyMessage: string;
}) {
  return (
    <section className="rounded border bg-white p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h5 className="flex items-baseline gap-2 text-base font-semibold text-gray-700">
          {title}
          <span className="text-xs font-normal text-text-muted">{rangeLabel}</span>
        </h5>
        <CurrencyChips currencies={currencies} value={currency} onChange={onCurrencyChange} />
      </div>
      {rows.length === 0 ? (
        <p className="py-2 text-sm text-text-muted">{emptyMessage}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map((row) => (
            <li key={row.id} className="flex justify-between gap-2 py-1 text-sm">
              <span className="min-w-0 truncate">{row.name}</span>
              <span className="whitespace-nowrap font-medium">{formatValue(row.value)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-text-muted">{ALL_ORDER_TYPES_NOTE}</p>
    </section>
  );
}
