import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures, ExpenseType, PaymentType } from '@store-mgmt/domain';
import type { Expense, Order, SaleCredit } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { hasCreditsModuleAvailable, hasExpensesModuleAvailable } from '~/shared/lib/auth/authorization-service';
import { Card } from '~/shared/components/ui/card';
import { ChevronDownIcon, PaymentMethodIcon } from '~/shared/components/ui/icons';
import { getPaymentTypeIconKind } from '~/shared/lib/payment-type-icon';
import { OrderOfflineService } from '../lib/services/order-offline-service';
import { ExpenseOfflineService } from '~/expenses/lib/services/expense-offline-service';
import { SaleCreditOfflineService } from '../lib/services/sale-credit-offline-service';
import { CategoryStats } from '../components/category-stats';
import type { CategoryCartItemsView } from '../lib/category-cart-items-view';

export const clientLoader = featureLoader([EFeatures.Sale]);

// Angular's expense-list.component.html column 1 (getExpenseTypeText) — 1:1 mapping,
// duplicated here (not exported by app/expenses/components/expense-list.tsx) to avoid
// coupling the Sales module to the Expenses module's presentational component.
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
 * Controlled panel matching Angular Material's `mat-expansion-panel` (collapsed by default,
 * `[expanded]="false"` in every panel on this view). Converted from an uncontrolled
 * `<details>/<summary>` to a `div + button(aria-expanded) + conditional body` pattern —
 * matching the other 6 list-screen panels — so it can host the shared rotating
 * `ChevronDownIcon` (collapsible-panel-chevron-parity). Each instance owns its own
 * `isOpen` state, so multiple panels toggle independently.
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
          <span className={amountClassName}>{amount}</span>
          <ChevronDownIcon isExpanded={isOpen} className="text-text-muted" />
        </span>
      </button>
      {isOpen && <div className="p-2">{children}</div>}
    </div>
  );
}

/**
 * 1:1 port of Angular's `today-stats.component.html` ("Cuadre del día"): a card with the
 * running total in the toolbar, and an accordion of collapsed-by-default panels — Resumen
 * Efectivo (always), Gastos (if hasExpensesModuleAvailable), Créditos Por Cobrar (if
 * hasCreditsModuleAvailable), Créditos Pagados (if hasCreditsModuleAvailable), and Ventas
 * (always, rendering one CategoryStats row per category).
 */
export function TodayStatsPage() {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const storeId = user?.selectedStoreId ?? '';

  const hasExpensesModule = user ? hasExpensesModuleAvailable(user) : false;
  const hasCreditsModule = user ? hasCreditsModuleAvailable(user) : false;

  const [categories, setCategories] = useState<CategoryCartItemsView[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [saleCredits, setSaleCredits] = useState<SaleCredit[]>([]);
  const [paidSaleCredits, setPaidSaleCredits] = useState<SaleCredit[]>([]);
  const [salesCashTotal, setSalesCashTotal] = useState(0);

  useEffect(() => {
    const orderService = new OrderOfflineService(storeId);
    setCategories(orderService.getCategoryCartItemsView(new Date()).data);

    const activeOrders: Order[] = orderService.getActiveOrdersInDay(new Date());
    setSalesCashTotal(
      activeOrders
        .filter((o) => o.paymentType === PaymentType.Efectivo && !o.isCredit)
        .reduce((acc, o) => acc + o.total, 0),
    );

    if (hasExpensesModule) {
      // Angular parity (today-stats.component.ts:79): loads today's expenses via
      // getExpensesInDayObservable(new Date()) and unwraps the BaseResponseModel `.data`.
      const expenseService = new ExpenseOfflineService(storeId);
      void expenseService
        .getExpensesInDayObservable(new Date())
        .then((response) => setExpenses(response.data));
    }

    if (hasCreditsModule) {
      // Angular parity (today-stats.component.ts:92,102): loads via
      // getUnPaidSaleCreditsInDayObservable/getPaidSaleCreditsInDayObservable and unwraps
      // the BaseResponseModel `.data` (flagged mismatch #3).
      const creditService = new SaleCreditOfflineService(storeId);
      void creditService
        .getUnPaidSaleCreditsInDayObservable(new Date())
        .then((response) => setSaleCredits(response.data));
      void creditService
        .getPaidSaleCreditsInDayObservable(new Date())
        .then((response) => setPaidSaleCredits(response.data));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, hasExpensesModule, hasCreditsModule]);

  const expensesCashTotal = expenses
    .filter((e) => e.paymentType === PaymentType.Efectivo)
    .reduce((acc, e) => acc + e.total, 0);
  const paidCreditsCashTotal = paidSaleCredits
    .filter((c) => c.paidType === PaymentType.Efectivo)
    .reduce((acc, c) => acc + c.total, 0);

  const ordersTotal = categories.reduce((acc, c) => acc + c.total, 0);
  const ordersItemsCount = categories.reduce((acc, c) => acc + c.itemsCount, 0);
  const expensesTotal = expenses.reduce((acc, e) => acc + e.total, 0);
  const expensesCount = expenses.length;
  const paidSaleCreditsTotal = paidSaleCredits.reduce((acc, c) => acc + c.total, 0);
  const cashTotal = salesCashTotal + paidCreditsCashTotal - expensesCashTotal;
  const creditsCount = saleCredits.length;
  const creditsTotal = saleCredits.reduce((acc, c) => acc + c.total, 0);
  const total = ordersTotal + paidSaleCreditsTotal - creditsTotal - expensesTotal;

  return (
    <Card
      title={
        <div className="flex items-center justify-between">
          {/* TODAY_STATS.HEADER */}
          <span>{intl.formatMessage({ id: 'TODAY_STATS.HEADER' })}</span>
          <span className={`text-lg font-bold ${valueClassName(total)}`}>
            ${total.toFixed(2)}
          </span>
        </div>
      }
    >
      <div className="divide-y divide-border">
        {/* BEGIN CASH */}
        <ExpansionPanel
          title="Resumen Efectivo"
          amount={`$${cashTotal.toFixed(2)}`}
          amountClassName={valueClassName(cashTotal)}
        >
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-border last:border-0">
                <td className="p-1">
                  <span className="font-bold text-text">Ventas</span>
                </td>
                <td className="p-1 text-right">
                  <span className="font-bold text-success">${salesCashTotal.toFixed(2)}</span>
                </td>
              </tr>
              {hasCreditsModule && (
                <tr className="border-b border-border last:border-0">
                  <td className="p-1">
                    <span className="font-bold text-text">Créditos Pagados</span>
                  </td>
                  <td className="p-1 text-right">
                    <span className="font-bold text-success">${paidCreditsCashTotal.toFixed(2)}</span>
                  </td>
                </tr>
              )}
              {hasExpensesModule && (
                <tr className="border-b border-border last:border-0">
                  <td className="p-1">
                    <span className="font-bold text-text">Gastos</span>
                  </td>
                  <td className="p-1 text-right">
                    <span className="font-bold text-danger">${expensesCashTotal.toFixed(2)}</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ExpansionPanel>
        {/* END CASH */}

        {/* BEGIN EXPENSES */}
        {hasExpensesModule && (
          <ExpansionPanel
            title={`Gastos (${expensesCount})`}
            amount={`$${expensesTotal.toFixed(2)}`}
            amountClassName="text-danger"
          >
            {expenses.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-muted">
                {/* TODAY_STATS.NO_EXPENSE_FOUND */}
                {intl.formatMessage({ id: 'TODAY_STATS.NO_EXPENSE_FOUND' })}
              </p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {expenses.map((expense) => (
                    <tr key={expense.id} className="border-b border-border last:border-0">
                      <td className="p-1 text-text">
                        {intl.formatMessage({ id: EXPENSE_TYPE_KEYS[expense.type] })}
                      </td>
                      <td className="p-1 text-right text-danger">
                        <span className="inline-flex items-center justify-end gap-1">
                          <PaymentMethodIcon kind={getPaymentTypeIconKind(expense.paymentType)} className="text-success" />
                          ${expense.total.toFixed(2)}
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
            amount={`$${creditsTotal.toFixed(2)}`}
            amountClassName="text-danger"
          >
            <SaleCreditsTable saleCredits={saleCredits} />
          </ExpansionPanel>
        )}
        {/* END CREDITS */}

        {/* BEGIN PAID CREDITS — Angular's literal template shows getPaidSaleCreditsTotal()
            (a currency sum) inside the "(...)" header slot, not a count. Preserved
            verbatim, not a bug fix. */}
        {hasCreditsModule && (
          <ExpansionPanel
            title={`Créditos Pagados (${paidSaleCreditsTotal})`}
            amount={`$${paidSaleCreditsTotal.toFixed(2)}`}
            amountClassName="text-success"
          >
            <SaleCreditsTable saleCredits={paidSaleCredits} />
          </ExpansionPanel>
        )}
        {/* END PAID CREDITS */}

        {/* BEGIN SALES */}
        <ExpansionPanel
          title={`Ventas (${ordersItemsCount} productos)`}
          amount={`$${ordersTotal.toFixed(2)}`}
          amountClassName="text-success"
        >
          {categories.map((category) => (
            <CategoryStats key={category.id} category={category} />
          ))}
        </ExpansionPanel>
        {/* END SALES */}
      </div>
    </Card>
  );
}

/**
 * Read-only rendering of `<app-sale-credit-list [saleCredits$]="...">` with no
 * `[readOnly]` binding (defaults `true` — no actions column), matching Angular's
 * `sale-credit-list.component.html` bare-table layout.
 */
function SaleCreditsTable({ saleCredits }: { saleCredits: SaleCredit[] }) {
  function formatDateOnly(date: Date): string {
    const d = new Date(date);
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const year = d.getUTCFullYear();
    return `${day}/${month}/${year}`;
  }

  return (
    <table className="w-full text-sm">
      <tbody>
        {saleCredits.map((saleCredit) => (
          <tr key={saleCredit.id} className="border-b border-border last:border-0">
            <td className="p-1">
              <span className="text-text">{saleCredit.client}</span>
            </td>
            <td className="p-1 text-right">
              <span className={saleCredit.isPaid ? 'text-success' : 'text-danger'}>
                ${saleCredit.total.toFixed(2)}
              </span>
            </td>
            <td className="p-1 text-right">
              {saleCredit.isPaid && (
                <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                  {formatDateOnly(saleCredit.paidDate)}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default TodayStatsPage;
