import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { hasExpensesModuleAvailable, hasCreditsModuleAvailable } from '~/shared/lib/auth/authorization-service';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import type { ChartData, TopProduct } from '~/sales/lib/services/order-offline-service';
import { ExpenseOfflineService } from '~/expenses/lib/services/expense-offline-service';
import { SaleCreditOfflineService } from '~/sales/lib/services/sale-credit-offline-service';
import { getCurrentCurrency, setCurrency } from '~/statistics/lib/services/currency-service';
import { SalesChart } from '../components/sales-chart';
import { ProfitChart } from '../components/profit-chart';

export const clientLoader = featureLoader([EFeatures.Dashboard]);

/** 1:1 port of Angular's `getTrendClass` (dashboard.component.ts:193-196). */
export function getTrendClass(actual: number, anterior: number): string {
  if (actual === anterior) return 'text-secondary';
  return actual >= anterior ? 'text-success' : 'text-danger';
}

/**
 * Port of Angular's `getTrendIcon` (dashboard.component.ts:198-201). Angular renders a
 * `bi-caret-up-fill`/`bi-caret-down-fill`/`bi-dash-lg` Bootstrap-icon-font glyph; React has no
 * Bootstrap icon font, so the SAME three-way branch renders a plain Unicode glyph instead
 * (▲/▼/–) — same trend semantics, no new icon asset invented.
 */
export function getTrendGlyph(actual: number, anterior: number): string {
  if (actual === anterior) return '–';
  return actual >= anterior ? '▲' : '▼';
}

/** 1:1 port of Angular's `trendTexto` (dashboard.component.ts:275-278). */
function trendTexto(actual: number, anterior: number, divisor: number, sufijo: string): string {
  const diferencia = Math.abs(actual - anterior);
  return diferencia !== 0 ? `${(diferencia / divisor).toFixed(2)} ${sufijo}` : `0 ${sufijo}`;
}

function KpiCard({
  title,
  value,
  trendClass,
  trendGlyph,
  trendText,
}: {
  title: string;
  value: string;
  trendClass: string;
  trendGlyph: string;
  trendText: string;
}) {
  return (
    <div className="rounded border bg-white p-4 shadow-sm">
      <h5 className="text-sm font-medium text-gray-700">{title}</h5>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      <small className={`text-xs font-bold ${trendClass}`}>
        <span aria-hidden="true">{trendGlyph}</span> {trendText}
      </small>
    </div>
  );
}

export function DashboardPage() {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const storeId = user?.selectedStoreId ?? '';
  const hasExpensesModule = user ? hasExpensesModuleAvailable(user) : false;
  const hasCreditsModule = user ? hasCreditsModuleAvailable(user) : false;

  const [salesData, setSalesData] = useState<ChartData[]>([]);
  const [profitData, setProfitData] = useState<ChartData[]>([]);
  const [topProfitProducts, setTopProfitProducts] = useState<TopProduct[]>([]);
  const [topSaleQuantityProducts, setTopSaleQuantityProducts] = useState<TopProduct[]>([]);

  const [salePriceToday, setSalePriceToday] = useState(0);
  const [salePriceYesterday, setSalePriceYesterday] = useState(0);
  const [saleProfitToday, setSaleProfitToday] = useState(0);
  const [saleProfitYesterday, setSaleProfitYesterday] = useState(0);
  const [expenseToday, setExpenseToday] = useState(0);
  const [expenseYesterday, setExpenseYesterday] = useState(0);
  const [unpaidSaleCreditsToday, setUnpaidSaleCreditsToday] = useState(0);
  const [unpaidSaleCreditsYesterday, setUnpaidSaleCreditsYesterday] = useState(0);

  const [currency, setCurrencyValue] = useState<'CUP' | 'USD'>(() => getCurrentCurrency().currency);
  const [rate, setRateValue] = useState<number>(() => getCurrentCurrency().rate);

  useEffect(() => {
    const orderService = new OrderOfflineService(storeId);
    setSalesData(orderService.getLastMonthSales());
    setProfitData(orderService.getLastMonthSaleProfits());
    setTopProfitProducts(orderService.getTopProductsProfitInLastMonth());
    setTopSaleQuantityProducts(orderService.getTopProductsSaleQuantityInLastMonth());

    setSalePriceToday(orderService.getActiveOrdersPriceToday());
    setSalePriceYesterday(orderService.getActiveOrdersPriceYesterday());

    let profitToday = orderService.getActiveOrdersProfitToday();
    let profitYesterday = orderService.getActiveOrdersProfitYesterday();

    if (hasExpensesModule) {
      const expenseService = new ExpenseOfflineService(storeId);
      const todayExpense = expenseService.getActiveExpensesPriceToday();
      const yesterdayExpense = expenseService.getActiveExpensesPriceYesterday();
      setExpenseToday(todayExpense);
      setExpenseYesterday(yesterdayExpense);
      profitToday -= todayExpense;
      profitYesterday -= yesterdayExpense;
    } else {
      setExpenseToday(0);
      setExpenseYesterday(0);
    }

    setSaleProfitToday(profitToday);
    setSaleProfitYesterday(profitYesterday);

    if (hasCreditsModule) {
      const creditService = new SaleCreditOfflineService(storeId);
      setUnpaidSaleCreditsToday(creditService.getActiveUnpaidSaleCreditsPriceToday());
      setUnpaidSaleCreditsYesterday(creditService.getActiveUnpaidSaleCreditsPriceYesterday());
    } else {
      setUnpaidSaleCreditsToday(0);
      setUnpaidSaleCreditsYesterday(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, hasExpensesModule, hasCreditsModule]);

  const divisor = currency === 'USD' ? rate : 1;
  const sufijo = currency;

  function handleCurrencyChange(next: 'CUP' | 'USD') {
    setCurrencyValue(next);
    setCurrency({ currency: next, rate });
  }

  function handleRateChange(next: number) {
    setRateValue(next);
    setCurrency({ currency, rate: next });
  }

  const loadingMsg = intl.formatMessage({ id: 'GENERAL.LOADING' });
  const emptyMsg = intl.formatMessage({ id: 'STATISTICS.EMPTY_STATE' });

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">
          {intl.formatMessage({ id: 'STATISTICS.DASHBOARD.TITLE' })}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {intl.formatMessage({ id: 'STATISTICS.LAST_30_DAYS' })}
        </p>
      </div>

      {/* Currency selector — Angular dashboard.component.html:9-20 (literal, untranslated
          "Moneda:" label, matching Angular's hardcoded template text). */}
      <div className="flex items-center gap-2">
        <label htmlFor="dashboard-currency" className="text-sm font-medium text-gray-700">
          Moneda:
        </label>
        <select
          id="dashboard-currency"
          value={currency}
          onChange={(e) => handleCurrencyChange(e.target.value as 'CUP' | 'USD')}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          <option value="CUP">CUP</option>
          <option value="USD">USD</option>
        </select>
        {currency === 'USD' && (
          <input
            type="number"
            value={rate}
            onChange={(e) => handleRateChange(Number(e.target.value))}
            placeholder="1 USD = ? CUP"
            className="w-32 rounded border border-gray-300 px-2 py-1 text-sm"
          />
        )}
      </div>

      {/* KPI cards — Angular dashboard.component.html:24-84 (literal, untranslated titles). */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Ventas Hoy"
          value={(salePriceToday / divisor).toFixed(2)}
          trendClass={getTrendClass(salePriceToday, salePriceYesterday)}
          trendGlyph={getTrendGlyph(salePriceToday, salePriceYesterday)}
          trendText={trendTexto(salePriceToday, salePriceYesterday, divisor, 'vs ayer')}
        />
        {hasExpensesModule && (
          <KpiCard
            title="Gastos Hoy"
            value={(expenseToday / divisor).toFixed(2)}
            trendClass={getTrendClass(expenseToday, expenseYesterday)}
            trendGlyph={getTrendGlyph(expenseToday, expenseYesterday)}
            trendText={trendTexto(expenseToday, expenseYesterday, divisor, 'vs ayer')}
          />
        )}
        {hasCreditsModule && (
          <KpiCard
            title="Créditos Por Cobrar"
            value={(unpaidSaleCreditsToday / divisor).toFixed(2)}
            trendClass={getTrendClass(unpaidSaleCreditsToday, unpaidSaleCreditsYesterday)}
            trendGlyph={getTrendGlyph(unpaidSaleCreditsToday, unpaidSaleCreditsYesterday)}
            trendText={trendTexto(unpaidSaleCreditsToday, unpaidSaleCreditsYesterday, divisor, 'vs ayer')}
          />
        )}
        <KpiCard
          title="Ganancias Hoy"
          value={(saleProfitToday / divisor).toFixed(2)}
          trendClass={getTrendClass(saleProfitToday, saleProfitYesterday)}
          trendGlyph={getTrendGlyph(saleProfitToday, saleProfitYesterday)}
          trendText={trendTexto(saleProfitToday, saleProfitYesterday, divisor, 'vs ayer')}
        />
      </div>

      {/* Sales Chart */}
      <section className="rounded border bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-700">
          {intl.formatMessage({ id: 'STATISTICS.SALES.TITLE' })}
        </h2>
        <SalesChart
          data={salesData}
          loadingMessage={loadingMsg}
          emptyMessage={emptyMsg}
        />
      </section>

      {/* Profit Chart */}
      <section className="rounded border bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-700">
          {intl.formatMessage({ id: 'STATISTICS.PROFIT.TITLE' })}
        </h2>
        <ProfitChart
          data={profitData}
          loadingMessage={loadingMsg}
          emptyMessage={emptyMsg}
        />
      </section>

      {/* Top-products lists — Angular dashboard.component.html:127-163 (literal, untranslated
          titles). */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded border bg-white p-4 shadow-sm">
          <h5 className="mb-2 text-base font-semibold text-gray-700">
            Productos mayor ganancias (últimos 30 días)
          </h5>
          <ul className="divide-y divide-gray-100">
            {topProfitProducts.map((product) => (
              <li key={product.id} className="flex justify-between py-1 text-sm">
                <span>{product.name}</span>
                <span>
                  {(product.value / divisor).toFixed(2)} {sufijo}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded border bg-white p-4 shadow-sm">
          <h5 className="mb-2 text-base font-semibold text-gray-700">
            Productos más vendidos (últimos 30 días)
          </h5>
          <ul className="divide-y divide-gray-100">
            {topSaleQuantityProducts.map((product) => (
              <li key={product.id} className="flex justify-between py-1 text-sm">
                <span>{product.name}</span>
                <span>{product.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
