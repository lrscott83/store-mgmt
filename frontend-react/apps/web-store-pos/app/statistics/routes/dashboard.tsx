import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import {
  hasExpensesModuleAvailable,
  hasCreditsModuleAvailable,
} from '~/shared/lib/auth/authorization-service';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import type { ChartData, TopProduct } from '~/sales/lib/services/order-offline-service';
import { ExpenseOfflineService } from '~/expenses/lib/services/expense-offline-service';
import { SaleCreditOfflineService } from '~/sales/lib/services/sale-credit-offline-service';
import { getCurrentCurrency, setCurrency } from '~/statistics/lib/services/currency-service';
import { SalesChart } from '../components/sales-chart';
import { ProfitChart } from '../components/profit-chart';
import { useMultiStore } from '~/shared/lib/hooks/use-multi-store';
import { MultiStoreSection } from '~/shared/components/multistore/multi-store-section';
import {
  computeStoreDashboard,
  mergeTopProducts,
  sumChartData,
  unwrapStoreDek,
} from '~/shared/lib/multistore/multi-store-aggregator';

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
  const { enabled: multiStoreEnabled, stores: multiStoreStores } = useMultiStore();

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

  // multi-store-panels: per-store dashboards (read-only local data) + load flag.
  const [storeDashboards, setStoreDashboards] = useState<Map<string, Awaited<ReturnType<typeof computeStoreDashboard>>>>(new Map());
  const [selectedMultiStoreId, setSelectedMultiStoreId] = useState<string | null>(null);
  const [multiLoaded, setMultiLoaded] = useState(false);

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
  }, [storeId, hasExpensesModule, hasCreditsModule]);

  // multi-store-panels: load every store's dashboard read-only (per-store DEK).
  useEffect(() => {
    if (!multiStoreEnabled) {
      setStoreDashboards(new Map());
      setMultiLoaded(false);
      return;
    }
    let cancelled = false;
    setMultiLoaded(false);
    void (async () => {
      const entries = await Promise.all(
        multiStoreStores.map(async (store) => {
          const dek = await unwrapStoreDek(store.id);
          return [store.id, computeStoreDashboard(store.id, dek, hasExpensesModule, hasCreditsModule)] as const;
        }),
      );
      if (cancelled) return;
      setStoreDashboards(new Map(entries));
      setMultiLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [multiStoreEnabled, multiStoreStores, hasExpensesModule, hasCreditsModule]);

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

  // ─── multi-store aggregated general view (outside panels) ────────────────
  const general = useMemo(() => {
    const dashboards = [...storeDashboards.values()];
    if (dashboards.length === 0) return null;
    const sales = dashboards.map((d) => d.salesData);
    const profits = dashboards.map((d) => d.profitData);
    const sumSeries = (series: { label: Date; value: number }[][]): ChartData[] =>
      (series.length > 0 ? series.reduce((acc, s) => sumChartData(acc, s)) : []).map((e) => ({
        label: e.label,
        value: e.value,
      }));
    const sumPair = (pick: (d: Awaited<ReturnType<typeof computeStoreDashboard>>) => [number, number]): [number, number] =>
      dashboards.reduce<[number, number]>(
        (acc, d) => {
          const [today, yesterday] = pick(d);
          return [acc[0] + today, acc[1] + yesterday];
        },
        [0, 0],
      );
    const [salePriceTodaySum, salePriceYesterdaySum] = sumPair((d) => [d.salePriceToday, d.salePriceYesterday]);
    const [saleProfitTodayRaw, saleProfitYesterdayRaw] = sumPair((d) => [d.saleProfitToday, d.saleProfitYesterday]);
    const [expenseTodaySum, expenseYesterdaySum] = sumPair((d) => [d.expenseToday, d.expenseYesterday]);
    const [unpaidTodaySum, unpaidYesterdaySum] = sumPair((d) => [d.unpaidSaleCreditsToday, d.unpaidSaleCreditsYesterday]);
    return {
      salesData: sumSeries(sales),
      profitData: sumSeries(profits),
      topProfitProducts: mergeTopProducts(dashboards.map((d) => d.topProfitProducts), 5),
      topSaleQuantityProducts: mergeTopProducts(dashboards.map((d) => d.topSaleQuantityProducts), 5),
      salePriceToday: salePriceTodaySum,
      salePriceYesterday: salePriceYesterdaySum,
      saleProfitToday: saleProfitTodayRaw - expenseTodaySum,
      saleProfitYesterday: saleProfitYesterdayRaw - expenseYesterdaySum,
      expenseToday: expenseTodaySum,
      expenseYesterday: expenseYesterdaySum,
      unpaidSaleCreditsToday: unpaidTodaySum,
      unpaidSaleCreditsYesterday: unpaidYesterdaySum,
    };
  }, [storeDashboards]);

  // ─── multi-store mode ────────────────────────────────────────────────────
  if (multiStoreEnabled) {
    return (
      <div className="space-y-6 p-4">
        <div className="border-b border-gray-200 pb-3">
          <h1 className="text-2xl font-semibold">{intl.formatMessage({ id: 'DASHBOARD.HEADER' })}</h1>
        </div>

        {/* Currency selector — GLOBAL (one for all stores), outside the panels. */}
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

        {/* General (aggregated) view — the user's "vista general para todas las tiendas". */}
        {general && multiLoaded && (
          <MultiStoreDashboardBody
            data={general}
            divisor={divisor}
            sufijo={sufijo}
            hasExpensesModule={hasExpensesModule}
            hasCreditsModule={hasCreditsModule}
            salesData={general.salesData}
            profitData={general.profitData}
            topProfitProducts={general.topProfitProducts}
            topSaleQuantityProducts={general.topSaleQuantityProducts}
            loadingMsg={loadingMsg}
            emptyMsg={emptyMsg}
          />
        )}
        {!multiLoaded && (
          <p className="text-sm text-gray-500">{loadingMsg}</p>
        )}

        {/* One collapsible panel per store with the same full dashboard view. */}
        <MultiStoreSection
          stores={multiStoreStores}
          selectedStoreId={selectedMultiStoreId}
          onSelectedStoreIdChange={setSelectedMultiStoreId}
          totals={
            general ? (
              <span className="text-xs text-text-muted">
                {intl.formatMessage({ id: 'STATISTICS.SALES.TITLE' })}: {(general.salePriceToday / divisor).toFixed(2)} {sufijo}
              </span>
            ) : undefined
          }
          renderStoreTotals={(store) => {
            const d = storeDashboards.get(store.id);
            return (
              <span className="text-xs text-text">
                {(d ? d.salePriceToday / divisor : 0).toFixed(2)} {sufijo}
              </span>
            );
          }}
        >
          {(store) => {
            const data = storeDashboards.get(store.id);
            if (!data) {
              return (
                <div className="py-4 text-center text-text-muted">
                  {intl.formatMessage({ id: 'MULTISTORE.NO_LOCAL_DATA' })}
                </div>
              );
            }
            return (
              <MultiStoreDashboardBody
                data={data}
                divisor={divisor}
                sufijo={sufijo}
                hasExpensesModule={hasExpensesModule}
                hasCreditsModule={hasCreditsModule}
                salesData={data.salesData}
                profitData={data.profitData}
                topProfitProducts={data.topProfitProducts}
                topSaleQuantityProducts={data.topSaleQuantityProducts}
                loadingMsg={loadingMsg}
                emptyMsg={emptyMsg}
              />
            );
          }}
        </MultiStoreSection>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* Header — Angular parity: dashboard.component.html:1-6 (card-header with the
          DASHBOARD.HEADER title and a bottom divider). */}
      <div className="border-b border-gray-200 pb-3">
        <h1 className="text-2xl font-semibold">{intl.formatMessage({ id: 'DASHBOARD.HEADER' })}</h1>
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

      {/* KPI cards — Angular dashboard.component.html:24-84 (literal, untranslated titles).
          Angular lays them out as two `.row`s of two `.col`s each → two cards per row. */}
      <div className="grid grid-cols-2 gap-4">
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
            trendText={trendTexto(
              unpaidSaleCreditsToday,
              unpaidSaleCreditsYesterday,
              divisor,
              'vs ayer',
            )}
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
        <SalesChart data={salesData} loadingMessage={loadingMsg} emptyMessage={emptyMsg} />
      </section>

      {/* Profit Chart */}
      <section className="rounded border bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-700">
          {intl.formatMessage({ id: 'STATISTICS.PROFIT.TITLE' })}
        </h2>
        <ProfitChart data={profitData} loadingMessage={loadingMsg} emptyMessage={emptyMsg} />
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

/**
 * multi-store-panels: the full dashboard body (KPIs + charts + tops) reused
 * for the aggregated general view AND for each store's panel.
 */
function MultiStoreDashboardBody({
  data,
  divisor,
  sufijo,
  hasExpensesModule,
  hasCreditsModule,
  salesData,
  profitData,
  topProfitProducts,
  topSaleQuantityProducts,
  loadingMsg,
  emptyMsg,
}: {
  data: {
    salePriceToday: number;
    salePriceYesterday: number;
    saleProfitToday: number;
    saleProfitYesterday: number;
    expenseToday: number;
    expenseYesterday: number;
    unpaidSaleCreditsToday: number;
    unpaidSaleCreditsYesterday: number;
  };
  divisor: number;
  sufijo: string;
  hasExpensesModule: boolean;
  hasCreditsModule: boolean;
  salesData: ChartData[];
  profitData: ChartData[];
  topProfitProducts: TopProduct[];
  topSaleQuantityProducts: TopProduct[];
  loadingMsg: string;
  emptyMsg: string;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <KpiCard
          title="Ventas Hoy"
          value={(data.salePriceToday / divisor).toFixed(2)}
          trendClass={getTrendClass(data.salePriceToday, data.salePriceYesterday)}
          trendGlyph={getTrendGlyph(data.salePriceToday, data.salePriceYesterday)}
          trendText={trendTexto(data.salePriceToday, data.salePriceYesterday, divisor, 'vs ayer')}
        />
        {hasExpensesModule && (
          <KpiCard
            title="Gastos Hoy"
            value={(data.expenseToday / divisor).toFixed(2)}
            trendClass={getTrendClass(data.expenseToday, data.expenseYesterday)}
            trendGlyph={getTrendGlyph(data.expenseToday, data.expenseYesterday)}
            trendText={trendTexto(data.expenseToday, data.expenseYesterday, divisor, 'vs ayer')}
          />
        )}
        {hasCreditsModule && (
          <KpiCard
            title="Créditos Por Cobrar"
            value={(data.unpaidSaleCreditsToday / divisor).toFixed(2)}
            trendClass={getTrendClass(data.unpaidSaleCreditsToday, data.unpaidSaleCreditsYesterday)}
            trendGlyph={getTrendGlyph(data.unpaidSaleCreditsToday, data.unpaidSaleCreditsYesterday)}
            trendText={trendTexto(
              data.unpaidSaleCreditsToday,
              data.unpaidSaleCreditsYesterday,
              divisor,
              'vs ayer',
            )}
          />
        )}
        <KpiCard
          title="Ganancias Hoy"
          value={(data.saleProfitToday / divisor).toFixed(2)}
          trendClass={getTrendClass(data.saleProfitToday, data.saleProfitYesterday)}
          trendGlyph={getTrendGlyph(data.saleProfitToday, data.saleProfitYesterday)}
          trendText={trendTexto(data.saleProfitToday, data.saleProfitYesterday, divisor, 'vs ayer')}
        />
      </div>

      <section className="rounded border bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-700">
          <DashboardSectionTitle id="STATISTICS.SALES.TITLE" />
        </h2>
        <SalesChart data={salesData} loadingMessage={loadingMsg} emptyMessage={emptyMsg} />
      </section>

      <section className="rounded border bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-700">
          <DashboardSectionTitle id="STATISTICS.PROFIT.TITLE" />
        </h2>
        <ProfitChart data={profitData} loadingMessage={loadingMsg} emptyMessage={emptyMsg} />
      </section>

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
    </>
  );
}

function DashboardSectionTitle({ id }: { id: string }) {
  const intl = useIntl();
  return <>{intl.formatMessage({ id })}</>;
}

export default DashboardPage;
