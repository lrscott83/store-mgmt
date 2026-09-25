import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import {
  DEFAULT_CURRENCY,
  EFeatures,
  ExpenseType,
  PaymentType,
  salePaymentMethodLabel,
  SalePaymentMethod,
} from '@store-mgmt/domain';
import type { Currency, Expense, Order, SaleCredit } from '@store-mgmt/domain';
import { normalizedOrderPaymentMethod, resolvedExpensePaymentMethod } from '~/shared/lib/payment-method-resolved';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { hasMultiMonedasAvailable } from '~/shared/components/multimonedas/currency-select';
import { CurrencyFilter } from '~/shared/components/multimonedas/currency-filter';
import { useCurrencyFilter } from '~/shared/components/multimonedas/use-currency-filter';
import {
  hasCreditsModuleAvailable,
  hasExpensesModuleAvailable,
} from '~/shared/lib/auth/authorization-service';
import { Card } from '~/shared/components/ui/card';
import { ChevronDownIcon } from '~/shared/components/ui/icons';
import { formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';
import { round2 } from '~/shared/lib/money';
import { presentCurrencies, resolveCurrency, type CurrencyAmount } from '~/shared/lib/currency-totals';
import { formatLocalDate } from '~/shared/lib/date-utils';
import { OrderOfflineService } from '../lib/services/order-offline-service';
import { ExpenseOfflineService } from '~/expenses/lib/services/expense-offline-service';
import { SaleCreditOfflineService } from '../lib/services/sale-credit-offline-service';
import { CategoryStats } from '../components/category-stats';
import type { CategoryCartItemsView } from '../lib/category-cart-items-view';
import { buildCategoryCartItemsView } from '../lib/category-cart-items-view';
import { ProductCategoryRepository } from '../lib/repositories/product-category-repository';

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

// Gastos: mismo reemplazo Tarjeta → Transferencia a nivel display.
function valueClassName(value: number): string {
  return value > 0 ? 'text-success' : value < 0 ? 'text-danger' : 'text-text';
}

/** Ítems de venta como entradas monetarias: mismo `round2(price × qty)` que el servicio. */
function salesEntriesOf(orders: readonly Order[]): CurrencyAmount[] {
  return orders.flatMap((order) =>
    order.orderItems.map((item) => ({
      amount: round2(item.price * item.quantity),
      currency: item.currency ?? order.currency,
    })),
  );
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
  const multiMonedas = hasMultiMonedasAvailable(user);

  const hasExpensesModule = user ? hasExpensesModuleAvailable(user) : false;
  const hasCreditsModule = user ? hasCreditsModuleAvailable(user) : false;

  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [categoryOrders, setCategoryOrders] = useState<{ id: string; order: number }[]>([]);
  const [categories, setCategories] = useState<CategoryCartItemsView[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [saleCredits, setSaleCredits] = useState<SaleCredit[]>([]);
  const [paidSaleCredits, setPaidSaleCredits] = useState<SaleCredit[]>([]);

  useEffect(() => {
    const orderService = new OrderOfflineService(storeId);
    // OrderOfflineService.getCategoryCartItemsView is a sync local-storage read that never
    // actually fails; this guard exists for the type only.
    const categoriesResponse = orderService.getCategoryCartItemsView(new Date());
    if (categoriesResponse.succeeded) setCategories(categoriesResponse.data);

    // Mismo origen del `order` de categoría que usa el servicio: se lee el repositorio
    // directamente (no el resultado ya mapeado con fallback del servicio), para que el
    // builder compartido resuelva con la misma fuente.
    const categoryRepository = new ProductCategoryRepository(storeId);
    setCategoryOrders(
      categoryRepository.getProductCategories().map((c) => ({ id: c.id, order: c.order })),
    );

    const todayOrders: Order[] = orderService.getActiveOrdersInDay(new Date());
    setActiveOrders(todayOrders);
    // payment-methods-percent-tax: el bloque "Tarjeta" pasa a "Transferencia" —
    // agrupa los históricos Tarjeta (adaptados a Transferencia-CUP) y las nuevas.
    // T13: se agrupa por el método NORMALIZADO, así una venta registrada con
    // Zelle cae en Transferencia (CUP) igual que en el resto del historial.
    // (Los totales de efectivo/transferencia se derivan en el render, ya que
    // siguen al filtro de moneda.)

    if (hasExpensesModule) {
      // Angular parity (today-stats.component.ts:79): loads today's expenses via
      // getExpensesInDayObservable(new Date()) and unwraps the BaseResponseModel `.data`.
      const expenseService = new ExpenseOfflineService(storeId);
      void expenseService.getExpensesInDayObservable(new Date()).then((response) => {
        if (response.succeeded) setExpenses(response.data);
      });
    }

    if (hasCreditsModule) {
      // Angular parity (today-stats.component.ts:92,102): loads via
      // getUnPaidSaleCreditsInDayObservable/getPaidSaleCreditsInDayObservable and unwraps
      // the BaseResponseModel `.data` (flagged mismatch #3).
      const creditService = new SaleCreditOfflineService(storeId);
      void creditService.getUnPaidSaleCreditsInDayObservable(new Date()).then((response) => {
        if (response.succeeded) setSaleCredits(response.data);
      });
      void creditService.getPaidSaleCreditsInDayObservable(new Date()).then((response) => {
        if (response.succeeded) setPaidSaleCredits(response.data);
      });
    }
  }, [storeId, hasExpensesModule, hasCreditsModule]);

  // ─── Filtro de moneda (currency-filter-per-view) ───────────────────────────
  // Las opciones salen del conjunto SIN filtrar por moneda, para que al elegir
  // una el filtro no desaparezca y no haya forma de volver a las demás. Con el
  // módulo MultiMonedas inactivo o una sola moneda no se filtra nada.
  const currencyOptions = presentCurrencies([
    ...salesEntriesOf(activeOrders),
    ...activeOrders.map((o) => ({ amount: o.total, currency: o.currency })),
    ...expenses.map((e) => ({ amount: e.total, currency: e.currency })),
    ...saleCredits.map((c) => ({ amount: c.total, currency: c.currency })),
    ...paidSaleCredits.map((c) => ({ amount: c.total, currency: c.currency })),
  ]);
  const { visible: currencyFilterVisible, currency, setCurrency } =
    useCurrencyFilter(currencyOptions);
  const selectedCurrency = currencyFilterVisible ? currency : null;

  const visibleOrders = selectedCurrency
    ? activeOrders.filter((o) => resolveCurrency(o.currency) === selectedCurrency)
    : activeOrders;
  const visibleExpenses = selectedCurrency
    ? expenses.filter((e) => resolveCurrency(e.currency) === selectedCurrency)
    : expenses;
  const visibleSaleCredits = selectedCurrency
    ? saleCredits.filter((c) => resolveCurrency(c.currency) === selectedCurrency)
    : saleCredits;
  const visiblePaidSaleCredits = selectedCurrency
    ? paidSaleCredits.filter((c) => resolveCurrency(c.currency) === selectedCurrency)
    : paidSaleCredits;

  // Moneda del display: la elegida cuando el filtro está visible; con el módulo
  // activo y una sola moneda, esa moneda (comportamiento previo); si no, CUP
  // (el total mezclado del gate OFF conserva su rótulo actual).
  const displayCurrency: Currency =
    currencyFilterVisible && currency !== null
      ? currency
      : multiMonedas
        ? (currencyOptions[0] ?? DEFAULT_CURRENCY)
        : DEFAULT_CURRENCY;

  // "Ventas" tiene UNA fuente: los ÍTEMS de las órdenes activas (price × qty).
  // Al filtrar por moneda se reagrupan las categorías con la misma agregación
  // que `getCategoryCartItemsView()` (round2(Σ round2(price×qty))), para que las
  // filas de la tabla también muestren una sola moneda. El total escalar
  // `ordersTotal` sigue saliendo de esas categorías, como hoy.
  const expensesEntries: CurrencyAmount[] = visibleExpenses.map((e) => ({
    amount: e.total,
    currency: e.currency,
  }));
  const creditsEntries: CurrencyAmount[] = visibleSaleCredits.map((c) => ({
    amount: c.total,
    currency: c.currency,
  }));
  const paidCreditsEntries: CurrencyAmount[] = visiblePaidSaleCredits.map((c) => ({
    amount: c.total,
    currency: c.currency,
  }));
  const cashSalesEntries: CurrencyAmount[] = visibleOrders
    .filter((o) => normalizedOrderPaymentMethod(o) === SalePaymentMethod.Efectivo && !o.isCredit)
    .map((o) => ({ amount: o.total, currency: o.currency }));
  const paidCreditsCashEntries: CurrencyAmount[] = visiblePaidSaleCredits
    .filter((c) => c.paidType === PaymentType.Efectivo)
    .map((c) => ({ amount: c.total, currency: c.currency }));
  const expensesCashEntries: CurrencyAmount[] = visibleExpenses
    .filter((e) => e.paymentType === PaymentType.Efectivo)
    .map((e) => ({ amount: e.total, currency: e.currency }));
  const transferEntries: CurrencyAmount[] = visibleOrders
    .filter(
      (o) => normalizedOrderPaymentMethod(o) === SalePaymentMethod.Transferencia && !o.isCredit,
    )
    .map((o) => ({ amount: o.total, currency: o.currency }));

  const visibleCategories = selectedCurrency
    ? buildCategoryCartItemsView(
        visibleOrders.flatMap((o) => o.orderItems),
        categoryOrders,
      )
    : categories;

  const salesCashTotal = cashSalesEntries.reduce((acc, e) => acc + e.amount, 0);
  const salesCardTotal = transferEntries.reduce((acc, e) => acc + e.amount, 0);
  const expensesCashTotal = expensesCashEntries.reduce((acc, e) => acc + e.amount, 0);
  const paidCreditsCashTotal = paidCreditsCashEntries.reduce((acc, e) => acc + e.amount, 0);

  const ordersTotal = visibleCategories.reduce((acc, c) => acc + c.total, 0);
  const ordersItemsCount = visibleCategories.reduce((acc, c) => acc + c.itemsCount, 0);
  const expensesTotal = expensesEntries.reduce((acc, e) => acc + e.amount, 0);
  const expensesCount = visibleExpenses.length;
  const paidSaleCreditsTotal = paidCreditsEntries.reduce((acc, e) => acc + e.amount, 0);
  const cashTotal = salesCashTotal + paidCreditsCashTotal - expensesCashTotal;
  const creditsCount = visibleSaleCredits.length;
  const creditsTotal = creditsEntries.reduce((acc, e) => acc + e.amount, 0);
  const total = ordersTotal + paidSaleCreditsTotal - creditsTotal - expensesTotal;

  return (
    <Card
      padding="tight"
      title={
        <div className="flex items-center justify-between">
          {/* TODAY_STATS.HEADER */}
          <span>{intl.formatMessage({ id: 'TODAY_STATS.HEADER' })}</span>
          <span className={`text-lg font-bold whitespace-nowrap ${valueClassName(total)}`}>
            {formatMoneyWithCurrency(total, displayCurrency)}
          </span>
        </div>
      }
    >
      <div className="mb-3">
        <CurrencyFilter
          currencies={currencyOptions}
          value={currency ?? currencyOptions[0] ?? DEFAULT_CURRENCY}
          onChange={setCurrency}
        />
      </div>
      <div className="divide-y divide-border">
        {/* BEGIN CASH */}
        <ExpansionPanel
          title="Resumen Efectivo"
          amount={formatMoneyWithCurrency(cashTotal, displayCurrency)}
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
                    {formatMoneyWithCurrency(salesCashTotal, displayCurrency)}
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
                      {formatMoneyWithCurrency(paidCreditsCashTotal, displayCurrency)}
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
                      {formatMoneyWithCurrency(expensesCashTotal, displayCurrency)}
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ExpansionPanel>
        {/* END CASH */}

        {/* BEGIN TRANSFER PAYMENTS (antes "Tarjeta" — históricos incluidos) */}
        <ExpansionPanel
          title="Pago por Transferencia"
          amount={formatMoneyWithCurrency(salesCardTotal, displayCurrency)}
          amountClassName={valueClassName(salesCardTotal)}
        >
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-border last:border-0">
                <td className="p-1">
                  <span className="font-bold text-text">Ventas</span>
                </td>
                <td className="p-1 text-right">
                  <span className="font-bold text-success whitespace-nowrap">
                    {formatMoneyWithCurrency(salesCardTotal, displayCurrency)}
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
            amount={formatMoneyWithCurrency(expensesTotal, displayCurrency)}
            amountClassName="text-danger"
          >
            {visibleExpenses.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-muted">
                {/* TODAY_STATS.NO_EXPENSE_FOUND */}
                {intl.formatMessage({ id: 'TODAY_STATS.NO_EXPENSE_FOUND' })}
              </p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {visibleExpenses.map((expense) => (
                    <tr key={expense.id} className="border-b border-border last:border-0">
                      <td className="p-1 text-text">
                        {intl.formatMessage({ id: EXPENSE_TYPE_KEYS[expense.type] })}
                      </td>
                      <td className="p-1 text-right text-danger">
                        {/* Angular renders this via <app-expense-list>, whose payment marker is
                            `<i class="bi …">` — but the bootstrap-icons font is imported nowhere
                            (styles.scss/index.html/angular.json), so no glyph renders. No icon. */}
                        <span className="whitespace-nowrap">
                          {formatMoneyWithCurrency(expense.total, expense.currency)}
                        </span>
                      </td>
                      <td className="p-1 text-right">
                        <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                          {salePaymentMethodLabel(
                            resolvedExpensePaymentMethod(expense),
                            expense.currency ?? 0,
                          )}
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
            amount={formatMoneyWithCurrency(creditsTotal, displayCurrency)}
            amountClassName="text-danger"
          >
            <SaleCreditsTable saleCredits={visibleSaleCredits} />
          </ExpansionPanel>
        )}
        {/* END CREDITS */}

        {/* BEGIN PAID CREDITS — Angular's literal template shows getPaidSaleCreditsTotal()
            (a currency sum) inside the "(...)" header slot, not a count. Preserved
            verbatim, not a bug fix. */}
        {hasCreditsModule && (
          <ExpansionPanel
            title={`Créditos Pagados (${
              multiMonedas
                ? formatMoneyWithCurrency(paidSaleCreditsTotal, displayCurrency)
                : paidSaleCreditsTotal
            })`}
            amount={formatMoneyWithCurrency(paidSaleCreditsTotal, displayCurrency)}
            amountClassName="text-success"
          >
            <SaleCreditsTable saleCredits={visiblePaidSaleCredits} />
          </ExpansionPanel>
        )}
        {/* END PAID CREDITS */}

        {/* BEGIN SALES */}
        <ExpansionPanel
          title={`Ventas (${ordersItemsCount} productos)`}
          amount={formatMoneyWithCurrency(ordersTotal, displayCurrency)}
          amountClassName="text-success"
        >
          {visibleCategories.map((category) => (
            <CategoryStats key={category.id} category={category} currency={currency ?? undefined} />
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
                {formatMoneyWithCurrency(saleCredit.total, saleCredit.currency)}
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

export default TodayStatsPage;
