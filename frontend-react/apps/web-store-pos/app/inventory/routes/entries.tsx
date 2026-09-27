import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import type { InventoryEntryView } from '@store-mgmt/domain';
import { DEFAULT_CURRENCY, EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { isOwnerAdmin as checkIsOwnerAdmin } from '~/shared/lib/auth/authorization-service';
import { InventoryOfflineService } from '../lib/services/inventory-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { ChevronDownIcon } from '~/shared/components/ui/icons';
import { hasMultiMonedasAvailable } from '~/shared/components/multimonedas/currency-select';
import { CurrencyFilter } from '~/shared/components/multimonedas/currency-filter';
import { useCurrencyFilter } from '~/shared/components/multimonedas/use-currency-filter';
import { presentCurrencies, resolveCurrency } from '~/shared/lib/currency-totals';
import { formatLocalDate, groupByLocalDay, addDays, startOfDay } from '~/shared/lib/date-utils';
import type { LocalDayGroup } from '~/shared/lib/date-utils';
import { DateRangeFilter } from '~/shared/components/date-range-filter/date-range-filter';
import { EntryList } from '../components/entry-list';
import { round2 } from '~/shared/lib/money';
import { formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';
import { useMultiStore } from '~/shared/lib/hooks/use-multi-store';
import {
  MultiStoreSection,
  MultiStoreTotal,
  MULTISTORE_FULL_BLEED,
} from '~/shared/components/multistore/multi-store-section';
import {
  groupEntryViewsByDay,
  readStoreEntryViews,
  unwrapStoreDek,
} from '~/shared/lib/multistore/multi-store-aggregator';

export const clientLoader = featureLoader([EFeatures.EntriesHistory]);

/**
 * Matches Angular's `entries.component.html`/`.ts` (Historial de Entradas).
 *
 * Angular's `loadEntries()` always calls `loadEntriesFiltered(null, null, null)`
 * (entries.component.ts:43,62-67) — product-id and date-range filtering is dead code on this
 * screen (confirmed: `filterInventoryEntries`'s only caller anywhere in the Angular codebase is
 * this component, always with null args). The template's `mat-radio-group` bound to
 * `paymentType` is likewise inert: its `(change)` handler re-runs the same unfiltered query,
 * and `InventoryEntryView` has no `paymentType` field at all for it to filter by. Per the
 * Angular-bug-handling policy (no correct "intent" exists for a control with no data-model
 * backing), none of these three controls — product-name filter, date-range filter,
 * payment-type radio — are ported. Entries render as a day-grouped accordion only (day-panel
 * pattern reused from `SaleCreditsPage`, `sales/routes/credits.tsx`).
 *
 * Read-only history (diff-matrix #19, L4 map): Angular's `entries.component.html:46`
 * `<app-entry-list [entries$]="...">` passes NO `[readOnly]` override, so `entry-list`'s
 * `@Input() readOnly: boolean = true` default applies — the edit/deactivate action column
 * (`isOwnerAdmin() && !readOnly`, entry-list.component.html:23) is ALWAYS hidden here, and
 * Angular's template has no "add new entry" button on this screen at all (that capability lives
 * only on the separate Today Entries screen, `today-entries.component.html:7,24`, which passes
 * `[readOnly]="false"`). React mirrors this exactly: `EntryList` is rendered with `readOnly`,
 * and there is no add-entry button/modal here.
 *
 * multi-store-panels: OwnerAdmin + MultiStores + ≥2 tiendas activas → un panel
 * colapsable por tienda con su acordeón por día, totales por tienda en la
 * cabecera y agregado fuera. Sin MultiStores la vista es idéntica.
 *
 * Header (2026-09-18): «Entradas (n)» a la izquierda — n = suma de quantities de
 * las entradas activas según el filtro vigente — y el costo total a la derecha,
 * en ambos modos. En multi-store el filtro de tienda global define qué cuenta.
 */
export function EntriesPage() {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const storeId = user?.selectedStoreId ?? '';
  const multiMonedas = hasMultiMonedasAvailable(user);
  // Angular parity: entry-list.component.ts:32 isOwnerAdmin() (currentUser.isOwnerAdmin) —
  // gates the cost-price column inside EntryList (diff-matrix #6, L5 map).
  const isOwnerAdmin = user ? checkIsOwnerAdmin(user) : false;
  const [dayGroups, setDayGroups] = useState<LocalDayGroup<InventoryEntryView>[]>([]);
  const [expandedDayIds, setExpandedDayIds] = useState<Set<string>>(new Set());
  const { enabled: multiStoreEnabled, stores: multiStoreStores } = useMultiStore();
  const [storeEntryViews, setStoreEntryViews] = useState<Map<string, InventoryEntryView[]>>(
    new Map(),
  );
  const [selectedMultiStoreId, setSelectedMultiStoreId] = useState<string | null>(null);
  // User-requested date range (2026-09-21) — same shared DateRangeFilter as credits:
  // half-open [start, next-day midnight) window, end day INCLUSIVE.
  const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>({
    start: null,
    end: null,
  });

  async function loadEntries() {
    const productRepository = new ProductRepository(
      storeId,
      new ProductCategoryRepository(storeId),
    );
    const svc = new InventoryOfflineService(storeId, productRepository);
    const products = [...productRepository.getStorageProductsMap().values()];
    const productMap = new Map(products.map((p) => [p.id, p.name]));
    // The date range rides the service's own filter entry point — the SAME one Angular's
    // loadEntriesFiltered ultimately used. filterInventoryEntries' endDate is EXCLUSIVE
    // (`v.date < end`), so sail the end window to next-day midnight to include the
    // selected end day. No range picked → all-nulls (Angular parity default).
    const start = dateRange.start ? startOfDay(dateRange.start) : undefined;
    const end = dateRange.end ? startOfDay(addDays(dateRange.end, 1)) : undefined;
    const response = await svc.filterInventoryEntries(undefined, start, end);
    // filterInventoryEntries is a same-tick Promise over local storage — it never
    // actually fails; this guard exists for the type only.
    if (!response.succeeded) return;
    const enriched = response.data.map((e) => ({
      ...e,
      productName: productMap.get(e.productId) ?? e.productName,
    }));
    setDayGroups(
      // groupByLocalDay returns newest-first; reverse to preserve Angular's ASCENDING day
      // order (EntriesComponent.groupEntries, entries.component.ts:103), oldest day first.
      groupByLocalDay(
        enriched,
        (e) => new Date(e.date),
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      ).reverse(),
    );
  }

  useEffect(() => {
    void loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadEntries reads storeId + the primitive date bounds
  }, [storeId, dateRange.start, dateRange.end]);

  // multi-store-panels: per-store active entry views (read-only, per-store DEK).
  useEffect(() => {
    if (!multiStoreEnabled) {
      setStoreEntryViews(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        multiStoreStores.map(async (store) => {
          const dek = await unwrapStoreDek(store.id);
          return [store.id, readStoreEntryViews(store.id, dek)] as const;
        }),
      );
      if (!cancelled) setStoreEntryViews(new Map(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [multiStoreEnabled, multiStoreStores]);

  function toggleDayPanel(dayId: string) {
    setExpandedDayIds((prev) => {
      const next = new Set(prev);
      if (next.has(dayId)) next.delete(dayId);
      else next.add(dayId);
      return next;
    });
  }

  const sumCount = (entries: InventoryEntryView[]) =>
    entries.reduce((count, e) => count + e.quantity, 0);
  const sumTotal = (entries: InventoryEntryView[]) =>
    entries.reduce((total, e) => total + round2(e.costPrice * e.quantity), 0);

  // Filtro de moneda (currency-filter-per-view): las opciones se derivan del
  // conjunto SIN filtrar por moneda (single-store: las entradas cargadas;
  // multi-store: las entradas leídas de cada tienda), para que el filtro no
  // desaparezca al elegir una moneda. El hook vive al tope del componente
  // porque el modo multi-store es un return temprano.
  const currencyOptions = presentCurrencies(
    multiStoreEnabled
      ? [...storeEntryViews.values()]
          .flat()
          .map((e) => ({ amount: e.costPrice * e.quantity, currency: e.currency }))
      : dayGroups.flatMap((d) =>
          d.items.map((e) => ({ amount: e.costPrice * e.quantity, currency: e.currency })),
        ),
  );
  const { visible: currencyFilterVisible, currency, setCurrency } =
    useCurrencyFilter(currencyOptions);
  // Tres casos (misma regla que credits/expenses): filtro visible → la elegida;
  // módulo activo con una sola moneda presente → esa; módulo inactivo → CUP,
  // salida idéntica a la de hoy.
  const displayCurrency =
    currencyFilterVisible && currency !== null
      ? currency
      : multiMonedas
        ? (currencyOptions[0] ?? DEFAULT_CURRENCY)
        : DEFAULT_CURRENCY;
  /** Moneda activa del filtro (null cuando está oculto → no se filtra). */
  const activeCurrency = currencyFilterVisible && currency !== null ? currency : null;

  /** Aplica el filtro de moneda a las filas (no-op cuando el filtro está oculto). */
  const filterEntriesByCurrency = (entries: InventoryEntryView[]): InventoryEntryView[] =>
    activeCurrency === null
      ? entries
      : entries.filter((e) => resolveCurrency(e.currency) === activeCurrency);

  // multi-store mode ───────────────────────────────────────────────────────
  if (multiStoreEnabled) {
    const visibleStoreIds =
      selectedMultiStoreId === null
        ? multiStoreStores.map((s) => s.id)
        : [selectedMultiStoreId];
    // Date range applied client-side before rendering (per-store local data): end day
    // INCLUSIVE → the same half-open [start, next-day midnight) window the single-store
    // service gets. Header AND panels follow the same filtered map. El filtro de moneda
    // se aplica ENCIMA del rango, así cada panel y el header quedan en una sola moneda.
    const rangeStart = dateRange.start ? startOfDay(dateRange.start) : null;
    const rangeEnd = dateRange.end ? startOfDay(addDays(dateRange.end, 1)) : null;
    const inRange = (entries: InventoryEntryView[]) =>
      entries.filter((e) => {
        const date = new Date(e.date);
        if (rangeStart && date < rangeStart) return false;
        if (rangeEnd && date >= rangeEnd) return false;
        return true;
      });
    const filteredStoreEntries = new Map(
      [...storeEntryViews].map(
        ([id, entries]) => [id, filterEntriesByCurrency(inRange(entries))] as const,
      ),
    );
    const totals = visibleStoreIds.reduce(
      (acc, id) => {
        const entries = filteredStoreEntries.get(id) ?? [];
        acc.count += sumCount(entries);
        acc.total = round2(acc.total + sumTotal(entries));
        return acc;
      },
      { count: 0, total: 0 },
    );

    return (
      <Card
        padding="tight"
        className={MULTISTORE_FULL_BLEED}
        title={
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              {intl.formatMessage({ id: 'INVENTORY.ENTRIES.TITLE' })}
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                ({totals.count})
              </span>
            </span>
            <span className="text-sm font-semibold text-primary whitespace-nowrap">
              {formatMoneyWithCurrency(totals.total, displayCurrency)}
            </span>
          </div>
        }
      >
        <MultiStoreSection
          stores={multiStoreStores}
          selectedStoreId={selectedMultiStoreId}
          onSelectedStoreIdChange={setSelectedMultiStoreId}
          filters={
            <>
              <DateRangeFilter value={dateRange} onApply={setDateRange} className="flex-1 min-w-0" />
              {/* Fila propia de moneda debajo del rango de fechas (se auto-oculta). */}
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
            const entries = filteredStoreEntries.get(store.id) ?? [];
            return `(${sumCount(entries)})`;
          }}
          renderStoreTotals={(store) => {
            const entries = filteredStoreEntries.get(store.id) ?? [];
            return (
              <MultiStoreTotal
                value={sumTotal(entries)}
                valueClassName="text-primary"
                currency={displayCurrency}
              />
            );
          }}
        >
          {(store) => {
            const entries = filteredStoreEntries.get(store.id) ?? [];
            if (entries.length === 0) {
              const hasLocalData = (storeEntryViews.get(store.id)?.length ?? 0) > 0;
              return (
                <div className="py-4 text-center text-text-muted">
                  {intl.formatMessage({
                    id: hasLocalData
                      ? 'MULTISTORE.NO_ENTRIES_IN_RANGE'
                      : 'MULTISTORE.NO_LOCAL_DATA',
                  })}
                </div>
              );
            }
            // Same day-grouping as the single-store view (oldest day first).
            return (
              <div className="space-y-2">
                {groupEntryViewsByDay(entries).map((dayGroup) => {
                  const dayId = dayGroup.dayKey;
                  const key = `${store.id}:${dayId}`;
                  const isExpanded = expandedDayIds.has(key);
                  return (
                    <div key={key} className="rounded border border-border">
                      <button
                        type="button"
                        onClick={() => toggleDayPanel(key)}
                        className="flex w-full items-center justify-between gap-2 px-2 py-2 text-left"
                        data-testid={`multistore-entry-day-toggle-${store.id}-${dayId}`}
                        aria-expanded={isExpanded}
                      >
                        <span className="flex items-center gap-2 text-xs font-medium text-text">
                          {formatLocalDate(dayGroup.date)} ({dayGroup.items.length})
                        </span>
                        <span className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-primary whitespace-nowrap">
                          {formatMoneyWithCurrency(
                            round2(
                              dayGroup.items.reduce(
                                (total, e) => total + e.costPrice * e.quantity,
                                0,
                              ),
                            ),
                            displayCurrency,
                          )}
                        </span>
                          <ChevronDownIcon isExpanded={isExpanded} className="text-text-muted" />
                        </span>
                      </button>
                      {isExpanded && (
                        <div className="border-t border-border px-2 py-2">
                          <EntryList entries={dayGroup.items} readOnly isOwnerAdmin={isOwnerAdmin} />
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

  // single-store mode ──────────────────────────────────────────────────────
  // Filtro de moneda sobre las filas: cada día queda en una sola moneda.
  const visibleDayGroups: LocalDayGroup<InventoryEntryView>[] = dayGroups
    .map((d) => ({ ...d, items: filterEntriesByCurrency(d.items) }))
    .filter((d) => d.items.length > 0);
  const entriesCount = visibleDayGroups.reduce((count, d) => count + sumCount(d.items), 0);
  const entriesTotal = round2(
    visibleDayGroups.reduce((total, d) => total + sumTotal(d.items), 0),
  );

  return (
    <Card
      padding="tight"
      title={
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            {intl.formatMessage({ id: 'INVENTORY.ENTRIES.TITLE' })}
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
              ({entriesCount})
            </span>
          </span>
          <span className="text-sm font-semibold text-primary whitespace-nowrap">
            {formatMoneyWithCurrency(entriesTotal, displayCurrency)}
          </span>
        </div>
      }
    >
      {/* User-requested date range (2026-09-21) — right-aligned, like credits. */}
      <div className="mb-3 flex justify-end">
        <DateRangeFilter value={dateRange} onApply={setDateRange} className="w-full sm:w-72" />
      </div>

      {/* Fila propia de moneda debajo del rango de fechas (se auto-oculta). */}
      <div className="mb-4">
        <CurrencyFilter
          currencies={currencyOptions}
          value={currency ?? currencyOptions[0] ?? DEFAULT_CURRENCY}
          onChange={setCurrency}
        />
      </div>

      <div className="space-y-4">
        {visibleDayGroups.length === 0 && (
          <InfoBox variant="primary" className="text-center">
            {intl.formatMessage({ id: 'INVENTORY.NO_HISTORY_ENTRY_FOUND' })}
          </InfoBox>
        )}

        <div className="space-y-2">
          {visibleDayGroups.map((dayGroup) => {
            const dayId = dayGroup.dayKey;
            const isExpanded = expandedDayIds.has(dayId);
            return (
              <div key={dayId} className="rounded-lg border border-border bg-background">
                <button
                  type="button"
                  onClick={() => toggleDayPanel(dayId)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
                  data-testid={`entry-day-panel-toggle-${dayId}`}
                  aria-expanded={isExpanded}
                >
                  <span className="text-sm font-medium text-text">
                    {formatLocalDate(dayGroup.date)} ({dayGroup.items.length})
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-primary whitespace-nowrap">
                      {formatMoneyWithCurrency(
                        round2(
                          dayGroup.items.reduce((total, e) => total + e.costPrice * e.quantity, 0),
                        ),
                        displayCurrency,
                      )}
                    </span>
                    <ChevronDownIcon isExpanded={isExpanded} className="text-text-muted" />
                  </span>
                </button>
                {isExpanded && (
                  <div className="border-t border-border px-4 py-3">
                    <EntryList entries={dayGroup.items} readOnly isOwnerAdmin={isOwnerAdmin} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

export default EntriesPage;
