import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { SaleCredit, PaymentType, Currency } from '@store-mgmt/domain';
import { DEFAULT_CURRENCY, EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { hasMultiMonedasAvailable } from '~/shared/components/multimonedas/currency-select';
import { CurrencyFilter } from '~/shared/components/multimonedas/currency-filter';
import { useCurrencyFilter } from '~/shared/components/multimonedas/use-currency-filter';
import { presentCurrencies, resolveCurrency } from '~/shared/lib/currency-totals';
import { formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';
import { DateRangeFilter } from '~/shared/components/date-range-filter/date-range-filter';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { ChevronDownIcon } from '~/shared/components/ui/icons';
import { addDays, formatLocalDate, groupByLocalDay, startOfDay } from '~/shared/lib/date-utils';
import type { LocalDayGroup } from '~/shared/lib/date-utils';
import { SaleCreditOfflineService } from '../lib/services/sale-credit-offline-service';
import { SaleCreditList } from '../components/sale-credit-list';
import { useMultiStore } from '~/shared/lib/hooks/use-multi-store';
import {
  MultiStoreSection,
  MultiStoreTotal,
  MULTISTORE_FULL_BLEED,
} from '~/shared/components/multistore/multi-store-section';
import {
  groupSaleCreditsByDay,
  readStoreSaleCredits,
  unwrapStoreDek,
} from '~/shared/lib/multistore/multi-store-aggregator';

export const clientLoader = featureLoader([EFeatures.CreditSale]);

/** Estado de pago del filtro de radios debajo del rango de fechas (regla verde/ámbar). */
type CreditPaidFilterValue = 'all' | 'pending' | 'paid';

/**
 * Vista de créditos (Créditos): credits
 * grouped by date into an accordion; each date panel wraps `SaleCreditList`
 * with `readOnly={false}` + edit/pay handlers (user request 2026-09-18:
 * the SAME Editar/Pagar gear, modals and service calls as the today-credits
 * view; the write path is store-scoped local storage and this view only edits
 * the SELECTED store, so editing is safe here). Multi-store panels stay read-only
 * (no write path for non-selected stores by design). Header shows count of ALL
 * visible credits and the total of the UNPAID ones only (`!isPaid`) — user
 * request 2026-09-22 (reverts the 2026-09-18 paid+unpaid decision; sums
 * `!isPaid` per day). `loadSaleCredits()` always goes through the service filter
 * `filterSaleCredits(null,
 * null, null, null)` (no date-range/paid-state args); the user-added
 * DateRangeFilter feeds the same service a half-open [start, next-day
 * midnight) window — with no range picked the call stays all-nulls.
 *
 * multi-store-panels: OwnerAdmin + módulo MultiStores + ≥2 tiendas activas →
 * un panel colapsable por tienda (datos locales del dispositivo, DEK por
 * tienda), select global "Todas las tiendas"/tienda y el filtro de fechas
 * en la misma fila. La fila de totales fuera de los paneles se eliminó por
 * decisión del usuario; el rango se aplica a los créditos de cada tienda.
 * Sin MultiStores la vista es idéntica a la original salvo el filtro.
 *
 * Header count + total (ambos modos): `CreditsCardTitle` pinta "Créditos (n)"
 * (n = TODOS los créditos visibles) y el total de los IMPAGOS a la derecha —
 * ámbar (text-warning) cuando > 0, verde (text-success) cuando 0. En
 * MultiStores el n/total reflejan el filtro vigente — la tienda elegida en el
 * select ("Todas" = todas), el rango de fechas aplicado y la fila de radios
 * de estado de pago — para que el header coincida con lo visible.
 */
export function SaleCreditsPage() {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const storeId = user?.selectedStoreId ?? '';
  const multiMonedas = hasMultiMonedasAvailable(user);
  const [dateSaleCredits, setDateSaleCredits] = useState<LocalDayGroup<SaleCredit>[]>([]);
  const [expandedDateIds, setExpandedDateIds] = useState<Set<string>>(new Set());
  const { enabled: multiStoreEnabled, stores: multiStoreStores } = useMultiStore();
  const [storeCredits, setStoreCredits] = useState<Map<string, SaleCredit[]>>(new Map());
  const [selectedMultiStoreId, setSelectedMultiStoreId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>({
    start: null,
    end: null,
  });
  const [creditFilter, setCreditFilter] = useState<CreditPaidFilterValue>('all');

  // Goes through the service filter — `filterSaleCredits(null, null, null, null)` —
  // instead of bypassing it with getAll().filter(isActive).
  async function loadSaleCredits() {
    const service = new SaleCreditOfflineService(storeId);
    // The service's endDate is EXCLUSIVE (`c.date < endDate`) — sail the end
    // window to next-day midnight so the selected end day is included.
    const start = dateRange.start ? startOfDay(dateRange.start) : null;
    const end = dateRange.end ? startOfDay(addDays(dateRange.end, 1)) : null;
    const response = await service.filterSaleCredits(null, null, start, end);
    // SaleCreditOfflineService.filterSaleCredits is a same-tick `Promise.resolve(...)` over
    // local storage — it never actually fails; this guard exists for the type only.
    if (!response.succeeded) return;
    // Paid-state radios filter CLIENT-SIDE before day-grouping, so the groups (and
    // everything derived from them — header count/total, day totals) only contain
    // matching credits. creditsCount counts what the groups show (ALL credits under
    // "Todos"); creditsTotal sums UNPAID credits only (!isPaid). groupByLocalDay returns
    // newest-first; reverse it so days render ASCENDING, oldest first.
    const visible = response.data.filter((credit) => {
      if (creditFilter === 'pending') return !credit.isPaid;
      if (creditFilter === 'paid') return credit.isPaid;
      return true;
    });
    setDateSaleCredits(
      groupByLocalDay(
        visible,
        (c) => new Date(c.date),
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      ).reverse(),
    );
  }

  useEffect(() => {
    void loadSaleCredits();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadSaleCredits reads storeId + dateRange (the primitive bounds below)
  }, [storeId, dateRange.start, dateRange.end, creditFilter]);

  // Mismos handlers que today-credits.tsx: el gear del historial edita/paga con el
  // mismo servicio y recarga la lista. WU2: updateSaleCredit/paidSaleCredit devuelven
  // un DataResult SYNC que nunca lanza — chequeo `.succeeded`, no try/catch.
  function handleSave(creditId: string, client: string, note: string): boolean {
    const service = new SaleCreditOfflineService(storeId);
    const result = service.updateSaleCredit(creditId, client, note);
    if (!result.succeeded) return false;
    void loadSaleCredits();
    return true;
  }

  function handlePay(creditId: string, paidType: PaymentType, note: string): boolean {
    const service = new SaleCreditOfflineService(storeId);
    const result = service.paidSaleCredit(creditId, paidType, note);
    if (!result.succeeded) return false;
    void loadSaleCredits();
    return true;
  }

  // multi-store-panels: load EVERY store's local credits read-only (per-store DEK).
  useEffect(() => {
    if (!multiStoreEnabled) {
      setStoreCredits(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        multiStoreStores.map(async (store) => {
          const dek = await unwrapStoreDek(store.id);
          return [store.id, readStoreSaleCredits(store.id, dek)] as const;
        }),
      );
      if (!cancelled) setStoreCredits(new Map(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [multiStoreEnabled, multiStoreStores]);

  function toggleDatePanel(dateId: string) {
    setExpandedDateIds((prev) => {
      const next = new Set(prev);
      if (next.has(dateId)) next.delete(dateId);
      else next.add(dateId);
      return next;
    });
  }

  // Filtro de moneda: opciones del conjunto SIN filtrar por moneda (single-store:
  // los créditos cargados; multi-store: los créditos leídos de cada tienda). El hook
  // vive al tope del componente porque el modo multi-store es un return temprano.
  const currencyOptions = presentCurrencies(
    multiStoreEnabled
      ? [...storeCredits.values()]
          .flat()
          .filter((c) => c.isActive)
          .map((c) => ({ amount: c.total, currency: c.currency }))
      : dateSaleCredits.flatMap((d) =>
          d.items.map((c) => ({ amount: c.total, currency: c.currency })),
        ),
  );
  const { visible: currencyFilterVisible, currency, setCurrency } =
    useCurrencyFilter(currencyOptions);
  // Con el módulo activo, una sola moneda presente conserva su código; sin el
  // módulo, el total mezclado sigue rotulándose CUP.
  const displayCurrency =
    currencyFilterVisible && currency !== null
      ? currency
      : multiMonedas
        ? (currencyOptions[0] ?? DEFAULT_CURRENCY)
        : DEFAULT_CURRENCY;

  /** Aplica el filtro de moneda a las filas (no-op cuando el filtro está oculto). */
  const filterCreditsByCurrency = (credits: SaleCredit[]): SaleCredit[] =>
    currencyFilterVisible && currency !== null
      ? credits.filter((c) => resolveCurrency(c.currency) === currency)
      : credits;

  // Header: count = TODOS los créditos visibles (estado + rango + moneda); el total
  // suma SOLO los impagos (!isPaid), verde cuando 0 — petición del usuario 2026-09-22.
  const visibleDateSaleCredits = dateSaleCredits
    .map((d) => ({ ...d, items: filterCreditsByCurrency(d.items) }))
    .filter((d) => d.items.length > 0);
  const creditsCount = visibleDateSaleCredits.reduce((count, d) => count + d.items.length, 0);
  const creditsTotal = visibleDateSaleCredits.reduce(
    (total, d) =>
      total + d.items.reduce((t, credit) => t + (credit.isPaid ? 0 : credit.total), 0),
    0,
  );

  // ─── multi-store mode ────────────────────────────────────────────────────
  if (multiStoreEnabled) {
    // Date range applied client-side before rendering: end day INCLUSIVE → the
    // same half-open [start, next-day midnight) window the service gets.
    const rangeStart = dateRange.start ? startOfDay(dateRange.start) : null;
    const rangeEnd = dateRange.end ? startOfDay(addDays(dateRange.end, 1)) : null;
    const filteredStoreCredits = new Map(
      [...storeCredits].map(([id, credits]) => {
        const filtered = credits.filter((c) => {
          const date = new Date(c.date);
          if (rangeStart && date < rangeStart) return false;
          if (rangeEnd && date >= rangeEnd) return false;
          if (creditFilter === 'pending' && c.isPaid) return false;
          if (creditFilter === 'paid' && !c.isPaid) return false;
          return true;
        });
        return [id, filtered] as const;
      }),
    );
    // Filtro de moneda ENCIMA de rango/estado: cada panel por tienda y el
    // agregado del header quedan en una sola moneda.
    const currencyFilteredStoreCredits = new Map(
      [...filteredStoreCredits].map(
        ([id, credits]) => [id, filterCreditsByCurrency(credits)] as const,
      ),
    );
    // Header n/total follow the CURRENT filter, not the whole store list: the
    // store select ("Todas" = every store) intersected with the applied range,
    // the paid-state radios and the currency filter. Mirrors MultiStoreSection's
    // own visibleStores rule so header and panels can never disagree.
    const visibleStores =
      selectedMultiStoreId === null
        ? multiStoreStores
        : multiStoreStores.filter((s) => s.id === selectedMultiStoreId);
    const multiStoreVisibleCredits = visibleStores.flatMap(
      (s) => currencyFilteredStoreCredits.get(s.id) ?? [],
    );
    const multiStoreCreditsCount = multiStoreVisibleCredits.length;
    const multiStoreCreditsTotal = multiStoreVisibleCredits.reduce(
      (total, credit) => total + (credit.isPaid ? 0 : credit.total),
      0,
    );

    return (
      <Card
        padding="tight"
        className={MULTISTORE_FULL_BLEED}
        title={
          <CreditsCardTitle
            count={multiStoreCreditsCount}
            total={multiStoreCreditsTotal}
            currency={displayCurrency}
          />
        }
      >
        <MultiStoreSection
          stores={multiStoreStores}
          selectedStoreId={selectedMultiStoreId}
          onSelectedStoreIdChange={setSelectedMultiStoreId}
          filters={
            <>
              <DateRangeFilter
                value={dateRange}
                onApply={setDateRange}
                className="flex-1 min-w-0"
              />
              {/* Paid-state radios — full-width row under the store select + date range. */}
              <div
                role="radiogroup"
                aria-label={intl.formatMessage({ id: 'SALE_CREDIT.FILTER_LABEL' })}
                className="flex w-full flex-wrap gap-4"
              >
                <label className="flex items-center gap-1.5 text-sm text-text">
                  <input
                    type="radio"
                    name="multistore-credit-paid-filter"
                    checked={creditFilter === 'all'}
                    onChange={() => setCreditFilter('all')}
                    className="text-primary focus:ring-primary"
                  />
                  {intl.formatMessage({ id: 'SALE_CREDIT.FILTER_ALL' })}
                </label>
                <label className="flex items-center gap-1.5 text-sm text-text">
                  <input
                    type="radio"
                    name="multistore-credit-paid-filter"
                    checked={creditFilter === 'pending'}
                    onChange={() => setCreditFilter('pending')}
                    className="text-primary focus:ring-primary"
                  />
                  {intl.formatMessage({ id: 'SALE_CREDIT.FILTER_TO_PAY' })}
                </label>
                <label className="flex items-center gap-1.5 text-sm text-text">
                  <input
                    type="radio"
                    name="multistore-credit-paid-filter"
                    checked={creditFilter === 'paid'}
                    onChange={() => setCreditFilter('paid')}
                    className="text-primary focus:ring-primary"
                  />
                  {intl.formatMessage({ id: 'SALE_CREDIT.FILTER_PAID' })}
                </label>
              </div>
              {/* Fila de moneda (se auto-oculta sin el módulo o con 1 moneda). */}
              <div className="flex w-full justify-center">
                <CurrencyFilter
                  currencies={currencyOptions}
                  value={currency ?? currencyOptions[0] ?? DEFAULT_CURRENCY}
                  onChange={setCurrency}
                />
              </div>
            </>
          }
          renderStoreCount={(store) => {
            const credits = currencyFilteredStoreCredits.get(store.id) ?? [];
            return `(${credits.length})`;
          }}
          renderStoreTotals={(store) => {
            const credits = currencyFilteredStoreCredits.get(store.id) ?? [];
            const total = credits.reduce((t, c) => t + (c.isPaid ? 0 : c.total), 0);
            return (
              <MultiStoreTotal
                value={total}
                valueClassName={total === 0 ? 'text-success' : 'text-warning'}
                currency={displayCurrency}
              />
            );
          }}
        >
          {(store) => {
            const credits = currencyFilteredStoreCredits.get(store.id) ?? [];
            if (credits.length === 0) {
              const hasLocalData = (storeCredits.get(store.id)?.length ?? 0) > 0;
              return (
                <div className="py-4 text-center text-text-muted">
                  {intl.formatMessage({
                    id: hasLocalData
                      ? 'MULTISTORE.NO_CREDITS_IN_RANGE'
                      : 'MULTISTORE.NO_LOCAL_DATA',
                  })}
                </div>
              );
            }
            // Same day-grouping as the single-store view (oldest day first).
            const dayGroups = groupSaleCreditsByDay(
              credits,
              (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
            );
            return (
              <div className="space-y-2">
                {dayGroups.map((group) => {
                  const dateId = group.dayKey;
                  const isExpanded = expandedDateIds.has(`${store.id}:${dateId}`);
                  const dayTotal = group.items.reduce(
                    (t, c) => t + (c.isPaid ? 0 : c.total),
                    0,
                  );
                  return (
                    <div key={dateId} className="rounded border border-border">
                      <button
                        type="button"
                        onClick={() => toggleDatePanel(`${store.id}:${dateId}`)}
                        className="flex w-full items-center justify-between gap-2 px-2 py-2 text-left"
                        data-testid={`multistore-credit-date-toggle-${store.id}-${dateId}`}
                        aria-expanded={isExpanded}
                      >
                        <span className="flex items-center gap-2 text-xs font-medium text-text">
                          {formatLocalDate(group.date)} ({group.items.length})
                        </span>
                        <span className="flex items-center gap-2">
                          <span
                            className={`text-xs font-semibold whitespace-nowrap ${dayTotal === 0 ? 'text-success' : 'text-warning'}`}
                          >
                            {formatMoneyWithCurrency(dayTotal, displayCurrency)}
                          </span>
                          <ChevronDownIcon isExpanded={isExpanded} className="text-text-muted" />
                        </span>
                      </button>
                      {isExpanded && (
                        <div className="border-t border-border px-2 py-2">
                          <SaleCreditList saleCredits={group.items} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          }}
        </MultiStoreSection>
      </Card>
    );
  }

  return (
    <Card
      padding="tight"
      title={
        <CreditsCardTitle
          count={creditsCount}
          total={creditsTotal}
          currency={displayCurrency}
        />
      }
    >      <div className="mb-3">
        <DateRangeFilter value={dateRange} onApply={setDateRange} />
      </div>

      <div
        role="radiogroup"
        aria-label={intl.formatMessage({ id: 'SALE_CREDIT.FILTER_LABEL' })}
        className="mb-3 flex flex-wrap gap-4"
      >
        <label className="flex items-center gap-1.5 text-sm text-text">
          <input
            type="radio"
            name="credit-paid-filter"
            checked={creditFilter === 'all'}
            onChange={() => setCreditFilter('all')}
            className="text-primary focus:ring-primary"
          />
          {intl.formatMessage({ id: 'SALE_CREDIT.FILTER_ALL' })}
        </label>
        <label className="flex items-center gap-1.5 text-sm text-text">
          <input
            type="radio"
            name="credit-paid-filter"
            checked={creditFilter === 'pending'}
            onChange={() => setCreditFilter('pending')}
            className="text-primary focus:ring-primary"
          />
          {intl.formatMessage({ id: 'SALE_CREDIT.FILTER_TO_PAY' })}
        </label>
        <label className="flex items-center gap-1.5 text-sm text-text">
          <input
            type="radio"
            name="credit-paid-filter"
            checked={creditFilter === 'paid'}
            onChange={() => setCreditFilter('paid')}
            className="text-primary focus:ring-primary"
          />
          {intl.formatMessage({ id: 'SALE_CREDIT.FILTER_PAID' })}
        </label>
      </div>

      {/* Fila propia de moneda debajo de los filtros existentes (se auto-oculta). */}
      <div className="mb-3">
        <CurrencyFilter
          currencies={currencyOptions}
          value={currency ?? currencyOptions[0] ?? DEFAULT_CURRENCY}
          onChange={setCurrency}
        />
      </div>

      {visibleDateSaleCredits.length === 0 && (
        <InfoBox variant="primary" className="mb-6 text-center">
          {/* SALE_CREDIT.NO_SALE_CREDIT_FOUND */}
          {intl.formatMessage({ id: 'SALE_CREDIT.NO_SALE_CREDIT_FOUND' })}
        </InfoBox>
      )}

      <div className="space-y-2">
        {visibleDateSaleCredits.map((dateSaleCredit) => {
          const dateId = dateSaleCredit.dayKey;
          const isExpanded = expandedDateIds.has(dateId);
          const dayTotal = dateSaleCredit.items.reduce(
            (t, c) => t + (c.isPaid ? 0 : c.total),
            0,
          );
          return (
            <div key={dateId} className="rounded-lg border border-border bg-surface">
              <button
                type="button"
                onClick={() => toggleDatePanel(dateId)}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
                data-testid={`credit-date-panel-toggle-${dateId}`}
                aria-expanded={isExpanded}
              >
                <span className="text-sm font-medium text-text">
                  {formatLocalDate(dateSaleCredit.date)} ({dateSaleCredit.items.length})
                </span>
                <span className="flex items-center gap-2">
                  <span
                    className={`text-sm font-semibold whitespace-nowrap ${dayTotal === 0 ? 'text-success' : 'text-warning'}`}
                  >
                    {formatMoneyWithCurrency(dayTotal, displayCurrency)}
                  </span>
                  <ChevronDownIcon isExpanded={isExpanded} className="text-text-muted" />
                </span>
              </button>
              {isExpanded && (
                <div className="border-t border-border px-4 py-3">
                  <SaleCreditList
                    saleCredits={dateSaleCredit.items}
                    readOnly={false}
                    onSave={handleSave}
                    onPay={handlePay}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/**
 * Card header shared by BOTH modes (single-store and MultiStore) so the two
 * cannot drift: "Créditos (n)" on the left and the total on the right. `count`
 * covers ALL visible credits (paid included); `total` covers UNPAID credits
 * only (!isPaid) — user request 2026-09-22 — amber (text-warning) when > 0,
 * green (text-success) when 0. The count keeps the `rounded-full bg-success/10`
 * pill class.
 */
function CreditsCardTitle({
  count,
  total,
  currency,
}: {
  count: number;
  total: number;
  currency: Currency;
}) {
  const intl = useIntl();
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2">
        {/* SALE_CREDIT.TITLE */}
        {intl.formatMessage({ id: 'SALE_CREDIT.TITLE' })}
        <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
          ({count})
        </span>
      </span>
      <span
        className={`text-sm font-semibold whitespace-nowrap ${total === 0 ? 'text-success' : 'text-warning'}`}
      >
        {formatMoneyWithCurrency(total, currency)}
      </span>
    </div>
  );
}

export default SaleCreditsPage;
