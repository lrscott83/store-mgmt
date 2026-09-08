import { useState } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures, ExpenseType, PaymentType } from '@store-mgmt/domain';
import type { Expense, Order, SaleCredit } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import {
  hasCreditsModuleAvailable,
  hasExpensesModuleAvailable,
} from '~/shared/lib/auth/authorization-service';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { ChevronDownIcon, SearchIcon } from '~/shared/components/ui/icons';
import { formatCurrency } from '~/shared/lib/format-currency';
import { formatLocalDate, addDays, startOfDay, maskDashedDate, parseDashedDate, weekdayNameEs } from '~/shared/lib/date-utils';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { ExpenseOfflineService } from '~/expenses/lib/services/expense-offline-service';
import { SaleCreditOfflineService } from '~/sales/lib/services/sale-credit-offline-service';
import { CategoryStats } from '~/sales/components/category-stats';
import type { CategoryCartItemsView } from '~/sales/lib/category-cart-items-view';

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

const PAYMENT_TYPE_KEYS: Record<PaymentType, string> = {
  [PaymentType.Efectivo]: 'CART.EFECTIVO',
  [PaymentType.Tarjeta]: 'CART.TARJETA',
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
  title: string;
  amount: string;
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
function KpiCard({ title, value }: { title: string; value: string }) {
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
}

/**
 * Cuadre por fechas — range summary view. Two steps:
 * 1. Date pickers (start/end, both days fully included) + "Generar" button.
 * 2. The dashboard's KPI cards (Ventas, Gastos, Ganancias Bruta, Ganancias — no
 *    "Hoy" labels, no trend rows) + a "Cuadre" card with the same five panels
 *    as "Cuadre del día" (Resumen Efectivo, Gastos, Créditos Por Cobrar,
 *    Créditos Pagados, Ventas), aggregated to the selected range.
 *
 * KPI semantics (user decision, option A):
 * - Ganancias Bruta = Σ order profit in range (NO expenses subtracted).
 * - Ganancias = Ganancias Bruta − Gastos.
 */
export function CuadrePorFechasPage() {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const storeId = user?.selectedStoreId ?? '';

  const hasExpensesModule = user ? hasExpensesModuleAvailable(user) : false;
  const hasCreditsModule = user ? hasCreditsModuleAvailable(user) : false;

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [summary, setSummary] = useState<RangeSummary | null>(null);

  function generate() {
    if (!startDate || !endDate) {
      setRangeError(intl.formatMessage({ id: 'CUADRE_FECHAS.EMPTY_DATES' }));
      return;
    }
    // dd-mm-yyyy inputs (user request 2026-09-08): parse with parseDashedDate —
    // returns null for incomplete or impossible dates (day 32, month 13, Feb 29
    // in a non-leap year).
    const parsedStart = parseDashedDate(startDate);
    const parsedEnd = parseDashedDate(endDate);
    if (!parsedStart || !parsedEnd) {
      setRangeError(intl.formatMessage({ id: 'CUADRE_FECHAS.INVALID_FORMAT' }));
      return;
    }
    const start = parsedStart;
    const end = parsedEnd;
    if (start > end) {
      setRangeError(intl.formatMessage({ id: 'CUADRE_FECHAS.INVALID_RANGE' }));
      return;
    }
    setRangeError(null);

    // Both days fully included: [start, end + 1 day). startOfDay re-snaps after
    // addDays so a DST jump cannot shift the exclusive boundary off midnight.
    const rangeStart = startOfDay(start);
    const rangeEnd = startOfDay(addDays(end, 1));

    const orderService = new OrderOfflineService(storeId);
    const salesTotal = orderService.getActiveOrdersPriceBetweenDates(rangeStart, rangeEnd);
    const grossProfit = orderService.getActiveOrdersProfitBetweenDates(rangeStart, rangeEnd);

    const categoriesResponse = orderService.getCategoryCartItemsViewBetweenDates(
      rangeStart,
      rangeEnd,
    );
    const categories = categoriesResponse.succeeded ? categoriesResponse.data : [];

    const activeOrders: Order[] = orderService.getActiveOrdersBetween(rangeStart, rangeEnd);
    const salesCashTotal = activeOrders
      .filter((o) => o.paymentType === PaymentType.Efectivo && !o.isCredit)
      .reduce((acc, o) => acc + o.total, 0);
    const salesCardTotal = activeOrders
      .filter((o) => o.paymentType === PaymentType.Tarjeta && !o.isCredit)
      .reduce((acc, o) => acc + o.total, 0);

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
    });
  }

  /** Día de la semana (es) de la fecha tecleada, o null si aún no es válida. */
  const startWeekday = parseDashedDate(startDate) ? weekdayNameEs(parseDashedDate(startDate)!) : null;
  const endWeekday = parseDashedDate(endDate) ? weekdayNameEs(parseDashedDate(endDate)!) : null;

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

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="border-b border-gray-200 pb-3">
        <h1 className="text-2xl font-semibold">
          {intl.formatMessage({ id: 'CUADRE_FECHAS.HEADER' })}
        </h1>
      </div>

      {/* Date range picker */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor="cuadre-start-date"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            {intl.formatMessage({ id: 'CUADRE_FECHAS.START_DATE' })}
          </label>
          <input
            id="cuadre-start-date"
            data-testid="cuadre-start-date"
            type="text"
            inputMode="numeric"
            placeholder="dd-mm-yyyy"
            value={startDate}
            onChange={(e) => setStartDate(maskDashedDate(e.target.value))}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          {startWeekday && (
            <p data-testid="cuadre-start-weekday" className="mt-1 text-xs font-medium text-gray-600">
              {startWeekday}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="cuadre-end-date" className="mb-1 block text-sm font-medium text-gray-700">
            {intl.formatMessage({ id: 'CUADRE_FECHAS.END_DATE' })}
          </label>
          <input
            id="cuadre-end-date"
            data-testid="cuadre-end-date"
            type="text"
            inputMode="numeric"
            placeholder="dd-mm-yyyy"
            value={endDate}
            onChange={(e) => setEndDate(maskDashedDate(e.target.value))}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          {endWeekday && (
            <p data-testid="cuadre-end-weekday" className="mt-1 text-xs font-medium text-gray-600">
              {endWeekday}
            </p>
          )}
        </div>
        <Button variant="primary" data-testid="cuadre-generate" onClick={generate} className="flex items-center gap-2">
          <span data-testid="cuadre-generate-icon">
            <SearchIcon />
          </span>
          {intl.formatMessage({ id: 'CUADRE_FECHAS.GENERATE' })}
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
              value={formatCurrency(summary.salesTotal)}
            />
            {hasExpensesModule && (
              <KpiCard
                title={intl.formatMessage({ id: 'CUADRE_FECHAS.KPI_EXPENSES' })}
                value={formatCurrency(summary.expensesTotal)}
              />
            )}
            <KpiCard
              title={intl.formatMessage({ id: 'CUADRE_FECHAS.KPI_GROSS_PROFIT' })}
              value={formatCurrency(summary.grossProfit)}
            />
            <KpiCard
              title={intl.formatMessage({ id: 'CUADRE_FECHAS.KPI_NET_PROFIT' })}
              value={formatCurrency(summary.netProfit)}
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
                  {formatCurrency(total)}
                </span>
              </div>
            }
          >
            <div className="divide-y divide-border">
              {/* BEGIN CASH */}
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
              {/* END CASH */}

              {/* BEGIN CARD PAYMENTS */}
              <ExpansionPanel
                title="Pago por Tarjeta"
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
              {/* END CARD PAYMENTS */}

              {/* BEGIN EXPENSES */}
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
                                {intl.formatMessage({ id: PAYMENT_TYPE_KEYS[expense.paymentType] })}
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
                  amount={formatCurrency(creditsTotal)}
                  amountClassName="text-danger"
                >
                  <SaleCreditsTable saleCredits={summary.saleCredits} />
                </ExpansionPanel>
              )}
              {/* END CREDITS */}

              {/* BEGIN PAID CREDITS — literal "(total)" in the header slot, Angular parity. */}
              {hasCreditsModule && (
                <ExpansionPanel
                  title={`Créditos Pagados (${paidSaleCreditsTotal})`}
                  amount={formatCurrency(paidSaleCreditsTotal)}
                  amountClassName="text-success"
                >
                  <SaleCreditsTable saleCredits={summary.paidSaleCredits} />
                </ExpansionPanel>
              )}
              {/* END PAID CREDITS */}

              {/* BEGIN SALES */}
              <ExpansionPanel
                title={`Ventas (${ordersItemsCount} productos)`}
                amount={formatCurrency(summary.categories.reduce((acc, c) => acc + c.total, 0))}
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
