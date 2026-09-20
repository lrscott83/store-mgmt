import { useRef, useState } from 'react';
import { useIntl, type IntlShape } from 'react-intl';
import { EFeatures, ExpenseType, PaymentType, SalePaymentMethod } from '@store-mgmt/domain';
import type { Expense, SaleCredit } from '@store-mgmt/domain';
import { resolvedOrderPaymentMethod } from '~/shared/lib/payment-method-resolved';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { CurrencyTotalAmount } from '~/shared/components/multimonedas/currency-total-amount';
import { hasMultiMonedasAvailable } from '~/shared/components/multimonedas/currency-select';
import {
  hasCreditsModuleAvailable,
  hasExpensesModuleAvailable,
} from '~/shared/lib/auth/authorization-service';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { ChevronDownIcon, SearchIcon } from '~/shared/components/ui/icons';
import { formatCurrency } from '~/shared/lib/format-currency';
import type { CurrencyAmount } from '~/shared/lib/currency-totals';
import { calculateOrderProfit } from '~/inventory/lib/profit-calculator';
import {
  formatLocalDate,
  addDays,
  startOfDay,
  parseDashedDate,
  isoToDashedDate,
  dashedToIsoDate,
} from '~/shared/lib/date-utils';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { ExpenseOfflineService } from '~/expenses/lib/services/expense-offline-service';
import { SaleCreditOfflineService } from '~/sales/lib/services/sale-credit-offline-service';
import { CategoryStats } from '~/sales/components/category-stats';
import type { CategoryCartItemsView } from '~/sales/lib/category-cart-items-view';
import { useMultiStore } from '~/shared/lib/hooks/use-multi-store';
import { MultiStoreSection, MULTISTORE_FULL_BLEED } from '~/shared/components/multistore/multi-store-section';
import {
  computeStoreRangeSummary,
  sumRangeSummaries,
  unwrapStoreDek,
} from '~/shared/lib/multistore/multi-store-aggregator';

export const clientLoader = featureLoader([EFeatures.Dashboard]);

// Angular's expense-list.component.html column 1 (getExpenseTypeText) — same mapping
// duplicated in today-stats.tsx (not exported by expense-list.tsx to avoid coupling).
const EXPENSE_TYPE_KEYS: Record<ExpenseType, string> = {
  [ExpenseType.Salario]: 'EXPENSES.TYPE.SALARIO',
  [ExpenseType.Transporte]: 'EXPENSES.TYPE.TRANSPORTE',
  [ExpenseType.Alquiler]: 'EXPENSES.TYPE.ALQUILER',
  [ExpenseType.Corriente]: 'EXPENSES.TYPE.CORRIENTE',
  [ExpenseType.Agua]: 'EXPENSES.TYPE.AGUA',
  [ExpenseType.Comida]: 'EXPENSES.TYPE.COMIDA',
  [ExpenseType.Operaciones]: 'EXPENSES.TYPE.OPERACIONES',
  [ExpenseType.Viaje]: 'EXPENSES.TYPE.VIAJE',
  [ExpenseType.Divisa]: 'EXPENSES.TYPE.DIVISA',
  [ExpenseType.Impuesto]: 'EXPENSES.TYPE.IMPUESTO',
  [ExpenseType.Otro]: 'EXPENSES.TYPE.OTRO',
};

// payment-methods-percent-tax (plan 2026-09-17): los históricos Tarjeta se
// muestran/agrupan como Transferencia (CUP).
const EXPENSE_PAYMENT_KEYS: Record<PaymentType, string> = {
  [PaymentType.Efectivo]: 'CART.EFECTIVO',
  [PaymentType.Tarjeta]: 'CART.TRANSFERENCIA_CUP',
  [PaymentType.Zelle]: 'CART.ZELLE',
};

function valueClassName(value: number): string {
  return value > 0 ? 'text-success' : value < 0 ? 'text-danger' : 'text-text';
}

/**
 * Same collapsible panel as today-stats.tsx (Angular mat-expansion-panel parity).
 */
function ExpansionPanel({
  title,
  amount,
  amountClassName,
  children,
}: {
  title: React.ReactNode;
  amount: React.ReactNode;
  amountClassName: string;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full cursor-pointer items-center justify-between p-2 text-left text-sm font-medium text-text hover:bg-primary-light/40"
        aria-expanded={isOpen}
      >
        <span>{title}</span>
        <span className="flex items-center gap-2">
          <span className={`whitespace-nowrap ${amountClassName}`}>{amount}</span>
          <ChevronDownIcon isExpanded={isOpen} className="text-text-muted" />
        </span>
      </button>
      {isOpen && <div className="p-2">{children}</div>}
    </div>
  );
}

/**
 * KPI card — dashboard.tsx's KpiCard without the trend row (no "Hoy", no ▲/▼).
 */
function KpiCard({ title, value }: { title: string; value: React.ReactNode }) {
  return (
    <div className="rounded border bg-white p-4 shadow-sm">
      <h5 className="text-sm font-medium text-gray-700">{title}</h5>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

interface RangeSummary {
  salesTotal: number;
  expensesTotal: number;
  grossProfit: number;
  netProfit: number;
  categories: CategoryCartItemsView[];
  expenses: Expense[];
  saleCredits: SaleCredit[];
  paidSaleCredits: SaleCredit[];
  salesCashTotal: number;
  salesCardTotal: number;
  expensesCashTotal: number;
  paidCreditsCashTotal: number;
  /** Per-currency entries — only rendered when MultiMonedas is active. */
  salesEntries: CurrencyAmount[];
  grossProfitEntries: CurrencyAmount[];
  salesCashEntries: CurrencyAmount[];
  salesCardEntries: CurrencyAmount[];
}

/**
 * Cuadre por fechas — range summary view. Two steps:
 * 1. Date pickers (start/end, both days fully included) + "Generar" button.
 * 2. The dashboard's KPI cards (Ventas, Gastos, Ganancias Bruta, Ganancias — no
 *    "Hoy" labels, no trend rows) + a "Cuadre" card with the same five panels
 *    as "Cuadre del día" (Resumen Efectivo, Pago por Tarjeta, Gastos, Créditos Por Cobrar,
 *    Créditos Pagados, Ventas), aggregated to the selected range.
 *
 * KPI semantics (user decision, option A):
 * - Ganancias Bruta = Σ order profit in range (NO expenses subtracted).
 * - Ganancias = Ganancias Bruta − Gastos.
 *
 * multi-store-panels: el rango de fechas + Generar son GLOBALES (una vez,
 * fuera de los paneles); KPIs generales agregados fuera; un panel colapsable
 * por tienda con el mismo cuadre completo de esa tienda. Sin MultiStores la
 * vista es idéntica a la original.
 */
export function CuadrePorFechasPage() {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const storeId = user?.selectedStoreId ?? '';

  const hasExpensesModule = user ? hasExpensesModuleAvailable(user) : false;
  const hasCreditsModule = user ? hasCreditsModuleAvailable(user) : false;
  const multiMonedas = hasMultiMonedasAvailable(user);
  const { enabled: multiStoreEnabled, stores: multiStoreStores } = useMultiStore();

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [summary, setSummary] = useState<RangeSummary | null>(null);
  const [storeSummaries, setStoreSummaries] = useState<Map<string, RangeSummary> | null>(null);
  const [selectedMultiStoreId, setSelectedMultiStoreId] = useState<string | null>(null);

  const startDateInputRef = useRef<HTMLInputElement>(null);
  const endDateInputRef = useRef<HTMLInputElement>(null);

  /**
   * Open the native date picker explicitly. Some engines do not open the
   * picker popup when the type="date" input is invisible (opacity 0), so the
   * tap handler uses the platform API (showPicker) instead of relying on the
   * click landing on the input.
   */
  function openStartPicker() {
    try {
      startDateInputRef.current?.showPicker();
    } catch {
      startDateInputRef.current?.focus();
    }
  }
  function openEndPicker() {
    try {
      endDateInputRef.current?.showPicker();
    } catch {
      endDateInputRef.current?.focus();
    }
  }

  function parseRange(): { start: Date; end: Date } | null {
    if (!startDate || !endDate) {
      setRangeError(intl.formatMessage({ id: 'CUADRE_FECHAS.EMPTY_DATES' }));
      return null;
    }
    // dd-mm-yyyy inputs (user request 2026-09-08): parse with parseDashedDate —
    // returns null for incomplete or impossible dates (day 32, month 13, Feb 29
    // in a non-leap year).
    const parsedStart = parseDashedDate(startDate);
    const parsedEnd = parseDashedDate(endDate);
    if (!parsedStart || !parsedEnd) {
      setRangeError(intl.formatMessage({ id: 'CUADRE_FECHAS.INVALID_FORMAT' }));
      return null;
    }
    const start = parsedStart;
    const end = parsedEnd;
    if (start > end) {
      setRangeError(intl.formatMessage({ id: 'CUADRE_FECHAS.INVALID_RANGE' }));
      return null;
    }
    setRangeError(null);
    // Both days fully included: [start, end + 1 day). startOfDay re-snaps after
    // addDays so a DST jump cannot shift the exclusive boundary off midnight.
    return { start, end };
  }

  function generate() {
    const parsed = parseRange();
    if (!parsed) {
      setStoreSummaries(null);
      setSummary(null);
      return;
    }

    const { start, end } = parsed;
    const rangeStart = startOfDay(start);
    const rangeEnd = startOfDay(addDays(end, 1));

    // ─── multi-store mode: per-store summaries from read-only local data ───
    if (multiStoreEnabled) {
      void (async () => {
        const entries = await Promise.all(
          multiStoreStores.map(async (store) => {
            const dek = await unwrapStoreDek(store.id);
            return [
              store.id,
              computeStoreRangeSummary(
                store.id,
                dek,
                rangeStart,
                rangeEnd,
                hasExpensesModule,
                hasCreditsModule,
              ),
            ] as const;
          }),
        );
        setStoreSummaries(new Map(entries));
      })();
      return;
    }

    const orderService = new OrderOfflineService(storeId);
    const salesTotal = orderService.getActiveOrdersPriceBetweenDates(rangeStart, rangeEnd);
    const grossProfit = orderService.getActiveOrdersProfitBetweenDates(rangeStart, rangeEnd);

    const categoriesResponse = orderService.getCategoryCartItemsViewBetweenDates(
      rangeStart,
      rangeEnd,
    );
    const categories = categoriesResponse.succeeded ? categoriesResponse.data : [];

    const activeOrders = orderService.getActiveOrdersBetween(rangeStart, rangeEnd);
    const salesCashTotal = activeOrders
      .filter((o) => o.paymentType === PaymentType.Efectivo && !o.isCredit)
      .reduce((acc, o) => acc + o.total, 0);
    const salesCardTotal = activeOrders
      .filter(
        (o) => resolvedOrderPaymentMethod(o) === SalePaymentMethod.Transferencia && !o.isCredit,
      )
      .reduce((acc, o) => acc + o.total, 0);

    // Per-currency entries (rendered only with MultiMonedas active): every amount
    // keeps its own currency, so no view ever sums different currencies.
    const salesEntries: CurrencyAmount[] = activeOrders.map((o) => ({
      amount: o.total,
      currency: o.currency,
    }));
    const grossProfitEntries: CurrencyAmount[] = activeOrders.flatMap((o) =>
      o.orderItems.map((item) => ({
        amount: calculateOrderProfit(item).profit,
        currency: item.currency ?? o.currency,
      })),
    );
    const salesCashEntries: CurrencyAmount[] = activeOrders
      .filter((o) => o.paymentType === PaymentType.Efectivo && !o.isCredit)
      .map((o) => ({ amount: o.total, currency: o.currency }));
    const salesCardEntries: CurrencyAmount[] = activeOrders
      .filter(
        (o) => resolvedOrderPaymentMethod(o) === SalePaymentMethod.Transferencia && !o.isCredit,
      )
      .map((o) => ({ amount: o.total, currency: o.currency }));

    let expenses: Expense[] = [];
    let expensesTotal = 0;
    let expensesCashTotal = 0;
    if (hasExpensesModule) {
      const expenseService = new ExpenseOfflineService(storeId);
      expenses = expenseService.getActiveExpensesBetween(rangeStart, rangeEnd);
      expensesTotal = expenses.reduce((acc, e) => acc + e.total, 0);
      expensesCashTotal = expenses
        .filter((e) => e.paymentType === PaymentType.Efectivo)
        .reduce((acc, e) => acc + e.total, 0);
    }

    let saleCredits: SaleCredit[] = [];
    let paidSaleCredits: SaleCredit[] = [];
    let paidCreditsCashTotal = 0;
    if (hasCreditsModule) {
      const creditService = new SaleCreditOfflineService(storeId);
      saleCredits = creditService.getUnPaidSaleCreditsBetween(rangeStart, rangeEnd);
      paidSaleCredits = creditService.getPaidSaleCreditsBetween(rangeStart, rangeEnd);
      paidCreditsCashTotal = paidSaleCredits
        .filter((c) => c.paidType === PaymentType.Efectivo)
        .reduce((acc, c) => acc + c.total, 0);
    }

    const netProfit = grossProfit - expensesTotal;

    setSummary({
      salesTotal,
      expensesTotal,
      grossProfit,
      netProfit,
      categories,
      expenses,
      saleCredits,
      paidSaleCredits,
      salesCashTotal,
      salesCardTotal,
      expensesCashTotal,
      paidCreditsCashTotal,
      salesEntries,
      grossProfitEntries,
      salesCashEntries,
      salesCardEntries,
    });
  }

  const total = summary
    ? summary.categories.reduce((acc, c) => acc + c.total, 0) +
      summary.paidSaleCredits.reduce((acc, c) => acc + c.total, 0) -
      summary.saleCredits.reduce((acc, c) => acc + c.total, 0) -
      summary.expenses.reduce((acc, e) => acc + e.total, 0)
    : 0;
  const cashTotal = summary
    ? summary.salesCashTotal + summary.paidCreditsCashTotal - summary.expensesCashTotal
    : 0;
  const ordersItemsCount = summary
    ? summary.categories.reduce((acc, c) => acc + c.itemsCount, 0)
    : 0;
  const creditsCount = summary ? summary.saleCredits.length : 0;
  const creditsTotal = summary ? summary.saleCredits.reduce((acc, c) => acc + c.total, 0) : 0;
  const paidSaleCreditsTotal = summary
    ? summary.paidSaleCredits.reduce((acc, c) => acc + c.total, 0)
    : 0;
  const expensesCount = summary ? summary.expenses.length : 0;

  // Per-currency entries for the single-store view (used only with MultiMonedas).
  const expensesEntries: CurrencyAmount[] = summary
    ? summary.expenses.map((e) => ({ amount: e.total, currency: e.currency }))
    : [];
  const creditsEntries: CurrencyAmount[] = summary
    ? summary.saleCredits.map((c) => ({ amount: c.total, currency: c.currency }))
    : [];
  const paidCreditsEntries: CurrencyAmount[] = summary
    ? summary.paidSaleCredits.map((c) => ({ amount: c.total, currency: c.currency }))
    : [];
  const expensesCashEntries: CurrencyAmount[] = summary
    ? summary.expenses
        .filter((e) => e.paymentType === PaymentType.Efectivo)
        .map((e) => ({ amount: e.total, currency: e.currency }))
    : [];
  const paidCreditsCashEntries: CurrencyAmount[] = summary
    ? summary.paidSaleCredits
        .filter((c) => c.paidType === PaymentType.Efectivo)
        .map((c) => ({ amount: c.total, currency: c.currency }))
    : [];
  const salesEntries: CurrencyAmount[] = summary ? summary.salesEntries : [];
  const totalEntries: CurrencyAmount[] = summary
    ? [
        ...summary.salesEntries,
        ...paidCreditsEntries,
        ...creditsEntries.map((e) => ({ ...e, amount: -e.amount })),
        ...expensesEntries.map((e) => ({ ...e, amount: -e.amount })),
      ]
    : [];
  const netProfitEntries: CurrencyAmount[] = summary
    ? [
        ...summary.grossProfitEntries,
        ...expensesEntries.map((e) => ({ ...e, amount: -e.amount })),
      ]
    : [];
  const cashEntries: CurrencyAmount[] = [
    ...(summary ? summary.salesCashEntries : []),
    ...paidCreditsCashEntries,
    ...expensesCashEntries.map((e) => ({ ...e, amount: -e.amount })),
  ];

  // ─── multi-store mode ────────────────────────────────────────────────────
  if (multiStoreEnabled) {
    return (
      <div className={`space-y-6 p-4 ${MULTISTORE_FULL_BLEED}`}>
        <div className="border-b border-gray-200 pb-3">
          <h1 className="text-2xl font-semibold">
            {intl.formatMessage({ id: 'CUADRE_FECHAS.HEADER' })}
          </h1>
        </div>

        {/* Date range + generate — GLOBAL (outside the panels), same widgets as the single-store view. */}
        <MultiStoreDateRangeFields
          intl={intl}
          startDate={startDate}
          endDate={endDate}
          rangeError={rangeError}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          openStartPicker={openStartPicker}
          openEndPicker={openEndPicker}
          startDateInputRef={startDateInputRef}
          endDateInputRef={endDateInputRef}
          onGenerate={generate}
        />

        {storeSummaries && (
          <>
            {/* General (aggregated) KPIs — outside the panels. */}
            <MultiStoreKpis summaries={[...storeSummaries.values()]} />

            <MultiStoreSection
              stores={multiStoreStores}
              selectedStoreId={selectedMultiStoreId ?? null}
              onSelectedStoreIdChange={setSelectedMultiStoreId}
              totals={
                <span className="text-sm">
                  <span className="text-text-muted">Ganancias: </span>
                  <span className="font-semibold text-text">
                    {formatCurrency(sumRangeSummaries([...storeSummaries.values()]).netProfit)}
                  </span>
                </span>
              }
              renderStoreTotals={(store) => {
                const s = storeSummaries.get(store.id);
                return (
                  <span className="text-xs whitespace-nowrap">
                    <span className="text-text-muted">Ganancias: </span>
                    <span className={`font-semibold ${valueClassName(s ? s.netProfit : 0)}`}>
                      {formatCurrency(s ? s.netProfit : 0)}
                    </span>
                  </span>
                );
              }}
            >
              {(store) => {
                const s = storeSummaries.get(store.id);
                if (!s) {
                  return (
                    <div className="py-4 text-center text-text-muted">
                      {intl.formatMessage({ id: 'MULTISTORE.NO_LOCAL_DATA' })}
                    </div>
                  );
                }
                return <MultiStoreCuadreBody summary={s} intl={intl} hasExpensesModule={hasExpensesModule} hasCreditsModule={hasCreditsModule} />;
              }}
            </MultiStoreSection>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="border-b border-gray-200 pb-3">
        <h1 className="text-2xl font-semibold">
          {intl.formatMessage({ id: 'CUADRE_FECHAS.HEADER' })}
        </h1>
      </div>

      {/* Date range picker — native type="date" input over a dd-mm-yyyy display
          (tap opens the native picker; the visible text keeps the dd-mm-yyyy
          format from the 2026-09-08 request). Compact so the two fields and
          the icon-only generate button fit on one mobile line. */}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label
            htmlFor="cuadre-start-date"
            className="mb-1 block text-xs font-medium text-gray-700"
          >
            {intl.formatMessage({ id: 'CUADRE_FECHAS.START_DATE' })}
          </label>
          <div
            data-testid="cuadre-start-field"
            onClick={openStartPicker}
            className="relative w-32 cursor-pointer rounded border border-gray-300 bg-white focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30"
          >
            <input
              ref={startDateInputRef}
              id="cuadre-start-date"
              data-testid="cuadre-start-date"
              type="date"
              aria-label={intl.formatMessage({ id: 'CUADRE_FECHAS.START_DATE' })}
              className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
              value={dashedToIsoDate(startDate)}
              onChange={(e) => setStartDate(isoToDashedDate(e.target.value))}
            />
            <input
              type="text"
              readOnly
              tabIndex={-1}
              placeholder="dd-mm-yyyy"
              aria-hidden="true"
              data-testid="cuadre-start-display"
              value={startDate}
              className="w-full rounded bg-transparent px-2 py-1 text-sm"
            />
          </div>
        </div>
        <div>
          <label htmlFor="cuadre-end-date" className="mb-1 block text-xs font-medium text-gray-700">
            {intl.formatMessage({ id: 'CUADRE_FECHAS.END_DATE' })}
          </label>
          <div
            data-testid="cuadre-end-field"
            onClick={openEndPicker}
            className="relative w-32 cursor-pointer rounded border border-gray-300 bg-white focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30"
          >
            <input
              ref={endDateInputRef}
              id="cuadre-end-date"
              data-testid="cuadre-end-date"
              type="date"
              aria-label={intl.formatMessage({ id: 'CUADRE_FECHAS.END_DATE' })}
              className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
              value={dashedToIsoDate(endDate)}
              onChange={(e) => setEndDate(isoToDashedDate(e.target.value))}
            />
            <input
              type="text"
              readOnly
              tabIndex={-1}
              placeholder="dd-mm-yyyy"
              aria-hidden="true"
              data-testid="cuadre-end-display"
              value={endDate}
              className="w-full rounded bg-transparent px-2 py-1 text-sm"
            />
          </div>
        </div>
        <Button
          variant="primary"
          data-testid="cuadre-generate"
          onClick={generate}
          aria-label={intl.formatMessage({ id: 'CUADRE_FECHAS.GENERATE' })}
          title={intl.formatMessage({ id: 'CUADRE_FECHAS.GENERATE' })}
          className="h-8 w-8 shrink-0 justify-center p-0"
        >
          <span data-testid="cuadre-generate-icon">
            <SearchIcon />
          </span>
        </Button>
        {rangeError && (
          <p data-testid="cuadre-range-error" className="text-sm font-medium text-danger">
            {rangeError}
          </p>
        )}
      </div>

      {summary && (
        <>
          {/* KPI cards — same card chrome as the dashboard, no trend row.
              Layout: grid-cols-2 like the dashboard's two-per-row layout. */}
          <div className="grid grid-cols-2 gap-4">
            <KpiCard
              title={intl.formatMessage({ id: 'CUADRE_FECHAS.KPI_SALES' })}
              value={
                <CurrencyTotalAmount
                  legacyTotal={summary.salesTotal}
                  entries={salesEntries}
                  multiMonedas={multiMonedas}
                />
              }
            />
            {hasExpensesModule && (
              <KpiCard
                title={intl.formatMessage({ id: 'CUADRE_FECHAS.KPI_EXPENSES' })}
                value={
                  <CurrencyTotalAmount
                    legacyTotal={summary.expensesTotal}
                    entries={expensesEntries}
                    multiMonedas={multiMonedas}
                  />
                }
              />
            )}
            <KpiCard
              title={intl.formatMessage({ id: 'CUADRE_FECHAS.KPI_GROSS_PROFIT' })}
              value={
                <CurrencyTotalAmount
                  legacyTotal={summary.grossProfit}
                  entries={summary.grossProfitEntries}
                  multiMonedas={multiMonedas}
                />
              }
            />
            <KpiCard
              title={intl.formatMessage({ id: 'CUADRE_FECHAS.KPI_NET_PROFIT' })}
              value={
                <CurrencyTotalAmount
                  legacyTotal={summary.netProfit}
                  entries={netProfitEntries}
                  multiMonedas={multiMonedas}
                />
              }
            />
          </div>

          {/* Cuadre card — same five panels as "Cuadre del día", aggregated to the range */}
          <Card
            padding="tight"
            title={
              <div className="flex items-center justify-between">
                <span data-testid="cuadre-card-title">
                  {intl.formatMessage({ id: 'CUADRE_FECHAS.CUADRE' })}
                </span>
                <span className={`text-lg font-bold whitespace-nowrap ${valueClassName(total)}`}>
                  <CurrencyTotalAmount
                    legacyTotal={total}
                    entries={totalEntries}
                    multiMonedas={multiMonedas}
                  />
                </span>
              </div>
            }
          >
            <div className="divide-y divide-border">
              {/* BEGIN CASH */}
              <ExpansionPanel
                title="Resumen Efectivo"
                amount={
                  <CurrencyTotalAmount
                    legacyTotal={cashTotal}
                    entries={cashEntries}
                    multiMonedas={multiMonedas}
                  />
                }
                amountClassName={valueClassName(cashTotal)}
              >
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-border last:border-0">
                      <td className="p-1">
                        <span className="font-bold text-text">Ventas</span>
                      </td>
                      <td className="p-1 text-right">
                        <span className="font-bold text-success whitespace-nowrap">
                          <CurrencyTotalAmount
                            legacyTotal={summary.salesCashTotal}
                            entries={summary.salesCashEntries}
                            multiMonedas={multiMonedas}
                          />
                        </span>
                      </td>
                    </tr>
                    {hasCreditsModule && (
                      <tr className="border-b border-border last:border-0">
                        <td className="p-1">
                          <span className="font-bold text-text">Créditos Pagados</span>
                        </td>
                        <td className="p-1 text-right">
                          <span className="font-bold text-success whitespace-nowrap">
                            <CurrencyTotalAmount
                              legacyTotal={summary.paidCreditsCashTotal}
                              entries={paidCreditsCashEntries}
                              multiMonedas={multiMonedas}
                            />
                          </span>
                        </td>
                      </tr>
                    )}
                    {hasExpensesModule && (
                      <tr className="border-b border-border last:border-0">
                        <td className="p-1">
                          <span className="font-bold text-text">Gastos</span>
                        </td>
                        <td className="p-1 text-right">
                          <span className="font-bold text-danger whitespace-nowrap">
                            <CurrencyTotalAmount
                              legacyTotal={summary.expensesCashTotal}
                              entries={expensesCashEntries}
                              multiMonedas={multiMonedas}
                            />
                          </span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </ExpansionPanel>
              {/* END CASH */}

              {/* BEGIN CARD PAYMENTS */}
              <ExpansionPanel
                title="Pago por Transferencia"
                amount={
                  <CurrencyTotalAmount
                    legacyTotal={summary.salesCardTotal}
                    entries={summary.salesCardEntries}
                    multiMonedas={multiMonedas}
                  />
                }
                amountClassName={valueClassName(summary.salesCardTotal)}
              >
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-border last:border-0">
                      <td className="p-1">
                        <span className="font-bold text-text">Ventas</span>
                      </td>
                      <td className="p-1 text-right">
                        <span className="font-bold text-success whitespace-nowrap">
                          <CurrencyTotalAmount
                            legacyTotal={summary.salesCardTotal}
                            entries={summary.salesCardEntries}
                            multiMonedas={multiMonedas}
                          />
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </ExpansionPanel>
              {/* END CARD PAYMENTS */}

              {/* BEGIN EXPENSES */}
              {hasExpensesModule && (
                <ExpansionPanel
                  title={`Gastos (${expensesCount})`}
                  amount={
                    <CurrencyTotalAmount
                      legacyTotal={summary.expensesTotal}
                      entries={expensesEntries}
                      multiMonedas={multiMonedas}
                    />
                  }
                  amountClassName="text-danger"
                >
                  {summary.expenses.length === 0 ? (
                    <p className="py-4 text-center text-sm text-text-muted">
                      {intl.formatMessage({ id: 'TODAY_STATS.NO_EXPENSE_FOUND' })}
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <tbody>
                        {summary.expenses.map((expense) => (
                          <tr key={expense.id} className="border-b border-border last:border-0">
                            <td className="p-1 text-text">
                              {formatLocalDate(expense.date)} —{' '}
                              {intl.formatMessage({ id: EXPENSE_TYPE_KEYS[expense.type] })}
                            </td>
                            <td className="p-1 text-right text-danger">
                              <span className="whitespace-nowrap">
                                {formatCurrency(expense.total)}
                              </span>
                            </td>
                            <td className="p-1 text-right">
                              <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                                {intl.formatMessage({ id: EXPENSE_PAYMENT_KEYS[expense.paymentType] })}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </ExpansionPanel>
              )}
              {/* END EXPENSES */}

              {/* BEGIN CREDITS */}
              {hasCreditsModule && (
                <ExpansionPanel
                  title={`Créditos Por Cobrar (${creditsCount})`}
                  amount={
                    <CurrencyTotalAmount
                      legacyTotal={creditsTotal}
                      entries={creditsEntries}
                      multiMonedas={multiMonedas}
                    />
                  }
                  amountClassName="text-danger"
                >
                  <SaleCreditsTable saleCredits={summary.saleCredits} />
                </ExpansionPanel>
              )}
              {/* END CREDITS */}

              {/* BEGIN PAID CREDITS — literal "(total)" in the header slot, Angular parity. */}
              {hasCreditsModule && (
                <ExpansionPanel
                  title={
                    multiMonedas ? (
                      <>
                        Créditos Pagados (
                        <CurrencyTotalAmount
                          legacyTotal={paidSaleCreditsTotal}
                          entries={paidCreditsEntries}
                          multiMonedas={multiMonedas}
                        />
                        )
                      </>
                    ) : (
                      `Créditos Pagados (${paidSaleCreditsTotal})`
                    )
                  }
                  amount={
                    <CurrencyTotalAmount
                      legacyTotal={paidSaleCreditsTotal}
                      entries={paidCreditsEntries}
                      multiMonedas={multiMonedas}
                    />
                  }
                  amountClassName="text-success"
                >
                  <SaleCreditsTable saleCredits={summary.paidSaleCredits} />
                </ExpansionPanel>
              )}
              {/* END PAID CREDITS */}

              {/* BEGIN SALES */}
              <ExpansionPanel
                title={`Ventas (${ordersItemsCount} productos)`}
                amount={
                  <CurrencyTotalAmount
                    legacyTotal={summary.categories.reduce((acc, c) => acc + c.total, 0)}
                    entries={salesEntries}
                    multiMonedas={multiMonedas}
                  />
                }
                amountClassName="text-success"
              >
                {summary.categories.map((category) => (
                  <CategoryStats key={category.id} category={category} />
                ))}
              </ExpansionPanel>
              {/* END SALES */}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

/**
 * multi-store-panels: the same date-range widget set as the single-store
 * view, reused for the global (outside-panels) controls.
 */
function MultiStoreDateRangeFields({
  intl,
  startDate,
  endDate,
  rangeError,
  onStartDateChange,
  onEndDateChange,
  openStartPicker,
  openEndPicker,
  startDateInputRef,
  endDateInputRef,
  onGenerate,
}: {
  intl: IntlShape;
  startDate: string;
  endDate: string;
  rangeError: string | null;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  openStartPicker: () => void;
  openEndPicker: () => void;
  startDateInputRef: React.RefObject<HTMLInputElement | null>;
  endDateInputRef: React.RefObject<HTMLInputElement | null>;
  onGenerate: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor="cuadre-start-date" className="mb-1 block text-xs font-medium text-gray-700">
          {intl.formatMessage({ id: 'CUADRE_FECHAS.START_DATE' })}
        </label>
        <div
          data-testid="cuadre-start-field"
          onClick={openStartPicker}
          className="relative w-32 cursor-pointer rounded border border-gray-300 bg-white focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30"
        >
          <input
            ref={startDateInputRef}
            id="cuadre-start-date"
            data-testid="cuadre-start-date"
            type="date"
            aria-label={intl.formatMessage({ id: 'CUADRE_FECHAS.START_DATE' })}
            className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
            value={dashedToIsoDate(startDate)}
            onChange={(e) => onStartDateChange(isoToDashedDate(e.target.value))}
          />
          <input
            type="text"
            readOnly
            tabIndex={-1}
            placeholder="dd-mm-yyyy"
            aria-hidden="true"
            data-testid="cuadre-start-display"
            value={startDate}
            className="w-full rounded bg-transparent px-2 py-1 text-sm"
          />
        </div>
      </div>
      <div>
        <label htmlFor="cuadre-end-date" className="mb-1 block text-xs font-medium text-gray-700">
          {intl.formatMessage({ id: 'CUADRE_FECHAS.END_DATE' })}
        </label>
        <div
          data-testid="cuadre-end-field"
          onClick={openEndPicker}
          className="relative w-32 cursor-pointer rounded border border-gray-300 bg-white focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30"
        >
          <input
            ref={endDateInputRef}
            id="cuadre-end-date"
            data-testid="cuadre-end-date"
            type="date"
            aria-label={intl.formatMessage({ id: 'CUADRE_FECHAS.END_DATE' })}
            className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
            value={dashedToIsoDate(endDate)}
            onChange={(e) => onEndDateChange(isoToDashedDate(e.target.value))}
          />
          <input
            type="text"
            readOnly
            tabIndex={-1}
            placeholder="dd-mm-yyyy"
            aria-hidden="true"
            data-testid="cuadre-end-display"
            value={endDate}
            className="w-full rounded bg-transparent px-2 py-1 text-sm"
          />
        </div>
      </div>
      <Button
        variant="primary"
        data-testid="cuadre-generate"
        onClick={onGenerate}
        aria-label={intl.formatMessage({ id: 'CUADRE_FECHAS.GENERATE' })}
        title={intl.formatMessage({ id: 'CUADRE_FECHAS.GENERATE' })}
        className="h-8 w-8 shrink-0 justify-center p-0"
      >
        <span data-testid="cuadre-generate-icon">
          <SearchIcon />
        </span>
      </Button>
      {rangeError && (
        <p data-testid="cuadre-range-error" className="text-sm font-medium text-danger">
          {rangeError}
        </p>
      )}
    </div>
  );
}

/** multi-store-panels: aggregated general KPIs — same four cards as the single-store view. */
function MultiStoreKpis({ summaries }: { summaries: RangeSummary[] }) {
  const intl = useIntl();
  const totals = sumRangeSummaries(summaries);
  return (
    <div className="grid grid-cols-2 gap-4">
      <KpiCard
        title={intl.formatMessage({ id: 'CUADRE_FECHAS.KPI_SALES' })}
        value={formatCurrency(totals.salesTotal)}
      />
      <KpiCard
        title={intl.formatMessage({ id: 'CUADRE_FECHAS.KPI_EXPENSES' })}
        value={formatCurrency(totals.expensesTotal)}
      />
      <KpiCard
        title={intl.formatMessage({ id: 'CUADRE_FECHAS.KPI_GROSS_PROFIT' })}
        value={formatCurrency(totals.grossProfit)}
      />
      <KpiCard
        title={intl.formatMessage({ id: 'CUADRE_FECHAS.KPI_NET_PROFIT' })}
        value={formatCurrency(totals.netProfit)}
      />
    </div>
  );
}

/** multi-store-panels: the full cuadre card body for ONE store inside its panel. */
function MultiStoreCuadreBody({
  summary,
  intl,
  hasExpensesModule,
  hasCreditsModule,
}: {
  summary: RangeSummary;
  intl: IntlShape;
  hasExpensesModule: boolean;
  hasCreditsModule: boolean;
}) {
  const cashTotal = summary.salesCashTotal + summary.paidCreditsCashTotal - summary.expensesCashTotal;
  const ordersItemsCount = summary.categories.reduce((acc, c) => acc + c.itemsCount, 0);
  const creditsCount = summary.saleCredits.length;
  const creditsTotal = summary.saleCredits.reduce((acc, c) => acc + c.total, 0);
  const paidSaleCreditsTotal = summary.paidSaleCredits.reduce((acc, c) => acc + c.total, 0);
  const expensesCount = summary.expenses.length;

  return (
    <div className="divide-y divide-border">
      <ExpansionPanel
        title="Resumen Efectivo"
        amount={formatCurrency(cashTotal)}
        amountClassName={valueClassName(cashTotal)}
      >
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-border last:border-0">
              <td className="p-1">
                <span className="font-bold text-text">Ventas</span>
              </td>
              <td className="p-1 text-right">
                <span className="font-bold text-success whitespace-nowrap">
                  {formatCurrency(summary.salesCashTotal)}
                </span>
              </td>
            </tr>
            {hasCreditsModule && (
              <tr className="border-b border-border last:border-0">
                <td className="p-1">
                  <span className="font-bold text-text">Créditos Pagados</span>
                </td>
                <td className="p-1 text-right">
                  <span className="font-bold text-success whitespace-nowrap">
                    {formatCurrency(summary.paidCreditsCashTotal)}
                  </span>
                </td>
              </tr>
            )}
            {hasExpensesModule && (
              <tr className="border-b border-border last:border-0">
                <td className="p-1">
                  <span className="font-bold text-text">Gastos</span>
                </td>
                <td className="p-1 text-right">
                  <span className="font-bold text-danger whitespace-nowrap">
                    {formatCurrency(summary.expensesCashTotal)}
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ExpansionPanel>

      <ExpansionPanel
        title="Pago por Transferencia"
        amount={formatCurrency(summary.salesCardTotal)}
        amountClassName={valueClassName(summary.salesCardTotal)}
      >
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-border last:border-0">
              <td className="p-1">
                <span className="font-bold text-text">Ventas</span>
              </td>
              <td className="p-1 text-right">
                <span className="font-bold text-success whitespace-nowrap">
                  {formatCurrency(summary.salesCardTotal)}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </ExpansionPanel>

      {hasExpensesModule && (
        <ExpansionPanel
          title={`Gastos (${expensesCount})`}
          amount={formatCurrency(summary.expensesTotal)}
          amountClassName="text-danger"
        >
          {summary.expenses.length === 0 ? (
            <p className="py-4 text-center text-sm text-text-muted">
              {intl.formatMessage({ id: 'TODAY_STATS.NO_EXPENSE_FOUND' })}
            </p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {summary.expenses.map((expense) => (
                  <tr key={expense.id} className="border-b border-border last:border-0">
                    <td className="p-1 text-text">
                      {formatLocalDate(expense.date)} —{' '}
                      {intl.formatMessage({ id: EXPENSE_TYPE_KEYS[expense.type] })}
                    </td>
                    <td className="p-1 text-right text-danger">
                      <span className="whitespace-nowrap">
                        {formatCurrency(expense.total)}
                      </span>
                    </td>
                    <td className="p-1 text-right">
                      <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                        {intl.formatMessage({ id: EXPENSE_PAYMENT_KEYS[expense.paymentType] })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ExpansionPanel>
      )}

      {hasCreditsModule && (
        <ExpansionPanel
          title={`Créditos Por Cobrar (${creditsCount})`}
          amount={formatCurrency(creditsTotal)}
          amountClassName="text-danger"
        >
          <SaleCreditsTable saleCredits={summary.saleCredits} />
        </ExpansionPanel>
      )}

      {hasCreditsModule && (
        <ExpansionPanel
          title={`Créditos Pagados (${paidSaleCreditsTotal})`}
          amount={formatCurrency(paidSaleCreditsTotal)}
          amountClassName="text-success"
        >
          <SaleCreditsTable saleCredits={summary.paidSaleCredits} />
        </ExpansionPanel>
      )}

      <ExpansionPanel
        title={`Ventas (${ordersItemsCount} productos)`}
        amount={formatCurrency(summary.categories.reduce((acc, c) => acc + c.total, 0))}
        amountClassName="text-success"
      >
        {summary.categories.map((category) => (
          <CategoryStats key={category.id} category={category} />
        ))}
      </ExpansionPanel>
    </div>
  );
}

/**
 * Same read-only credits table as today-stats.tsx.
 */
function SaleCreditsTable({ saleCredits }: { saleCredits: SaleCredit[] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {saleCredits.map((saleCredit) => (
          <tr key={saleCredit.id} className="border-b border-border last:border-0">
            <td className="p-1">
              <span className="text-text">{saleCredit.client}</span>
            </td>
            <td className="p-1 text-right">
              <span
                className={`whitespace-nowrap ${saleCredit.isPaid ? 'text-success' : 'text-danger'}`}
              >
                {formatCurrency(saleCredit.total)}
              </span>
            </td>
            <td className="p-1 text-right">
              {saleCredit.isPaid && (
                <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                  {formatLocalDate(saleCredit.paidDate)}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default CuadrePorFechasPage;
