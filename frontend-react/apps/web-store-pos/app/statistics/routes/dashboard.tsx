import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import type { Currency } from '@store-mgmt/domain';
import { DEFAULT_CURRENCY, EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { DateRangeFilter } from '~/shared/components/date-range-filter/date-range-filter';
import { hasMultiMonedasAvailable } from '~/shared/components/multimonedas/currency-select';
import { MultiStoreSection } from '~/shared/components/multistore/multi-store-section';
import {
  hasCreditsModuleAvailable,
  hasExpensesModuleAvailable,
} from '~/shared/lib/auth/authorization-service';
import { addDays, startOfDay } from '~/shared/lib/date-utils';
import { formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';
import { useMultiStore } from '~/shared/lib/hooks/use-multi-store';
import { unwrapStoreDek } from '~/shared/lib/multistore/multi-store-aggregator';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { getCurrentCurrency, setCurrency } from '~/statistics/lib/services/currency-service';
import {
  computeMultiStoreDashboardRange,
  computeSingleStoreDashboardRange,
  mergeDashboardRangeMetrics,
} from '../lib/dashboard-range-aggregator';
import type { DashboardRangeMetrics, RangeWindow } from '../lib/dashboard-range-aggregator';
import { formatRangeLabel } from '../lib/dashboard-breakdowns';
import { DashboardMetricsBody } from '../components/dashboard-metrics-body';

export const clientLoader = featureLoader([EFeatures.Dashboard]);

/** Default range: 7 inclusive days ending yesterday (master plan §Filtro global). */
const DEFAULT_RANGE_DAYS = 7;

/** `[ayer − 6 días, ayer]` — local midnights, end day inclusive. */
function defaultRange(): { start: Date; end: Date } {
  const yesterday = addDays(startOfDay(new Date()), -1);
  return { start: addDays(yesterday, -(DEFAULT_RANGE_DAYS - 1)), end: yesterday };
}

/**
 * Half-open window `[start, end + 1 día)` — the app's exclusive-end convention:
 * every service/aggregator filters with `date < end`, so the selected end day is
 * included by sailing the end to the next local midnight (same as Créditos).
 */
function toWindow(range: { start: Date; end: Date }): RangeWindow {
  return { start: startOfDay(range.start), end: startOfDay(addDays(range.end, 1)) };
}

type DateFilterValue = { start: Date | null; end: Date | null };

/**
 * Owner dashboard — 1:1 with the agreed plan (docs/plans/2026-09-16-dashboard-kpi.md):
 * a global date filter over a range-based KPI/chart/donut/table view, per-currency
 * values (data from the batch-1 range aggregator), detail popups per card and the
 * same structure per store in multi-store mode.
 */
export function DashboardPage() {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const storeId = user?.selectedStoreId ?? '';
  const hasExpensesModule = user ? hasExpensesModuleAvailable(user) : false;
  const hasCreditsModule = user ? hasCreditsModuleAvailable(user) : false;
  const multiMonedas = hasMultiMonedasAvailable(user);
  const { enabled: multiStoreEnabled, stores: multiStoreStores } = useMultiStore();

  const [appliedRange, setAppliedRange] = useState<{ start: Date; end: Date }>(defaultRange);
  const [singleMetrics, setSingleMetrics] = useState<DashboardRangeMetrics | null>(null);
  const [storeMetrics, setStoreMetrics] = useState<Map<string, DashboardRangeMetrics>>(new Map());
  const [multiLoaded, setMultiLoaded] = useState(false);
  const [selectedMultiStoreId, setSelectedMultiStoreId] = useState<string | null>(null);

  // Legacy "Moneda: CUP/USD + rate" selector — only meaningful WITHOUT the
  // MultiMonedas module (moneda plan §3). With the module the values are shown
  // per currency and the selector is not rendered at all.
  const [legacyCurrency, setLegacyCurrency] = useState<'CUP' | 'USD'>(
    () => getCurrentCurrency().currency,
  );
  const [legacyRate, setLegacyRate] = useState<number>(() => getCurrentCurrency().rate);

  const rangeWindow = useMemo(() => toWindow(appliedRange), [appliedRange]);
  const rangeLabel = formatRangeLabel(appliedRange.start, appliedRange.end);

  // ─── Data loading ──────────────────────────────────────────────────────────

  // Single-store: the selected store's offline services (its in-memory DEK).
  useEffect(() => {
    if (multiStoreEnabled || !storeId) return;
    setSingleMetrics(
      computeSingleStoreDashboardRange(storeId, rangeWindow, hasExpensesModule, hasCreditsModule),
    );
  }, [multiStoreEnabled, storeId, rangeWindow, hasExpensesModule, hasCreditsModule]);

  // Multi-store: EVERY store's local data read-only (explicit per-store DEK).
  useEffect(() => {
    if (!multiStoreEnabled) {
      setStoreMetrics(new Map());
      setMultiLoaded(false);
      return;
    }
    let cancelled = false;
    setMultiLoaded(false);
    void (async () => {
      const entries = await Promise.all(
        multiStoreStores.map(async (store) => {
          const dek = await unwrapStoreDek(store.id);
          return [
            store.id,
            computeMultiStoreDashboardRange(
              store.id,
              dek,
              rangeWindow,
              hasExpensesModule,
              hasCreditsModule,
            ),
          ] as const;
        }),
      );
      if (cancelled) return;
      setStoreMetrics(new Map(entries));
      setMultiLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [multiStoreEnabled, multiStoreStores, rangeWindow, hasExpensesModule, hasCreditsModule]);

  /** Fixed order: alphabetical — the plan forbids ranking between stores. */
  const sortedStores = useMemo(
    () => [...multiStoreStores].sort((storeA, storeB) => storeA.name.localeCompare(storeB.name)),
    [multiStoreStores],
  );

  /** Aggregated "todas las tiendas" view — cross-store per-currency merge. */
  const general = useMemo(
    () => (storeMetrics.size > 0 ? mergeDashboardRangeMetrics([...storeMetrics.values()]) : null),
    [storeMetrics],
  );

  // ─── Filter + legacy currency handlers ─────────────────────────────────────

  function handleApply(range: DateFilterValue) {
    if (range.start !== null && range.end !== null) {
      setAppliedRange({ start: startOfDay(range.start), end: startOfDay(range.end) });
      return;
    }
    // "Limpiar" (or a partial selection) restores the 7-day default — the
    // dashboard never falls back to "all history".
    setAppliedRange(defaultRange());
  }

  function handleLegacyCurrencyChange(next: 'CUP' | 'USD') {
    setLegacyCurrency(next);
    setCurrency({ currency: next, rate: legacyRate });
  }

  function handleLegacyRateChange(next: number) {
    setLegacyRate(next);
    setCurrency({ currency: legacyCurrency, rate: next });
  }

  /**
   * Amount formatter handed to the body: with MultiMonedas the canonical
   * `formatMoneyWithCurrency(amount, currency)` (per-currency, no conversion);
   * without it the legacy selector's rate conversion, exactly as before.
   */
  const formatAmount = useCallback(
    (amount: number, currency: Currency): string => {
      if (multiMonedas) return formatMoneyWithCurrency(amount, currency);
      const divisor = legacyCurrency === 'USD' ? legacyRate : 1;
      return `${(amount / divisor).toFixed(2)} ${legacyCurrency}`;
    },
    [multiMonedas, legacyCurrency, legacyRate],
  );

  const loadingMsg = intl.formatMessage({ id: 'GENERAL.LOADING' });
  const emptyMsg = intl.formatMessage({ id: 'STATISTICS.EMPTY_STATE' });

  const bodyProps = {
    hasExpensesModule,
    hasCreditsModule,
    formatAmount,
    rangeLabel,
    loadingMessage: loadingMsg,
    emptyMessage: emptyMsg,
  };

  const selectedStoreName = sortedStores.find((store) => store.id === selectedMultiStoreId)?.name;
  const singleStoreName = user?.storeList?.find((store) => store.id === storeId)?.name;
  const businessName = multiStoreEnabled
    ? (selectedStoreName ?? intl.formatMessage({ id: 'MULTISTORE.ALL_STORES' }))
    : singleStoreName;

  const header = (
    <div className="border-b border-gray-200 pb-3">
      <h1 className="text-2xl font-semibold">{intl.formatMessage({ id: 'DASHBOARD.HEADER' })}</h1>
      {businessName && (
        <p className="text-sm text-text-muted" data-testid="dashboard-business-name">
          {businessName}
        </p>
      )}
    </div>
  );

  const legacyCurrencySelector = !multiMonedas && (
    <div className="flex items-center gap-2">
      <label htmlFor="dashboard-currency" className="text-sm font-medium text-gray-700">
        Moneda:
      </label>
      <select
        id="dashboard-currency"
        value={legacyCurrency}
        onChange={(e) => handleLegacyCurrencyChange(e.target.value as 'CUP' | 'USD')}
        className="rounded border border-gray-300 px-2 py-1 text-sm"
      >
        <option value="CUP">CUP</option>
        <option value="USD">USD</option>
      </select>
      {legacyCurrency === 'USD' && (
        <input
          type="number"
          value={legacyRate}
          onChange={(e) => handleLegacyRateChange(Number(e.target.value))}
          placeholder="1 USD = ? CUP"
          className="w-32 rounded border border-gray-300 px-2 py-1 text-sm"
        />
      )}
    </div>
  );

  const dateFilter = <DateRangeFilter value={appliedRange} onApply={handleApply} />;

  // ─── Multi-store mode ──────────────────────────────────────────────────────
  if (multiStoreEnabled) {
    return (
      <div className="space-y-6 p-4">
        {header}
        <div className="flex flex-wrap items-center gap-4">
          {dateFilter}
          {legacyCurrencySelector}
        </div>

        {general !== null && multiLoaded && (
          <DashboardMetricsBody metrics={general} {...bodyProps} />
        )}
        {!multiLoaded && <p className="text-sm text-gray-500">{loadingMsg}</p>}

        <MultiStoreSection
          stores={sortedStores}
          selectedStoreId={selectedMultiStoreId}
          onSelectedStoreIdChange={setSelectedMultiStoreId}
          totals={
            general !== null ? (
              <span className="text-xs text-text-muted">
                {intl.formatMessage({ id: 'STATISTICS.SALES.TITLE' })}:{' '}
                {formatAmount(
                  general.primary?.salesTotal ?? 0,
                  general.primary?.currency ?? DEFAULT_CURRENCY,
                )}
              </span>
            ) : undefined
          }
          renderStoreTotals={(store) => {
            const metrics = storeMetrics.get(store.id);
            return (
              <span className="text-xs font-semibold text-text">
                {formatAmount(
                  metrics?.primary?.salesTotal ?? 0,
                  metrics?.primary?.currency ?? DEFAULT_CURRENCY,
                )}
              </span>
            );
          }}
        >
          {(store) => {
            const metrics = storeMetrics.get(store.id);
            if (!metrics) {
              return (
                <div className="py-4 text-center text-text-muted">
                  {intl.formatMessage({ id: 'MULTISTORE.NO_LOCAL_DATA' })}
                </div>
              );
            }
            return <DashboardMetricsBody metrics={metrics} {...bodyProps} />;
          }}
        </MultiStoreSection>
      </div>
    );
  }

  // ─── Single-store mode ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-4">
      {header}
      <div className="flex flex-wrap items-center gap-4">
        {dateFilter}
        {legacyCurrencySelector}
      </div>

      {singleMetrics === null ? (
        <p className="text-sm text-gray-500">{loadingMsg}</p>
      ) : (
        <DashboardMetricsBody metrics={singleMetrics} {...bodyProps} />
      )}
    </div>
  );
}

export default DashboardPage;
