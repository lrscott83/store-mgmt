import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { SaleCredit, PaymentType } from '@store-mgmt/domain';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { DateRangeFilter } from '~/shared/components/date-range-filter/date-range-filter';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { ChevronDownIcon } from '~/shared/components/ui/icons';
import { addDays, formatLocalDate, groupByLocalDay, startOfDay } from '~/shared/lib/date-utils';
import type { LocalDayGroup } from '~/shared/lib/date-utils';
import { SaleCreditOfflineService } from '../lib/services/sale-credit-offline-service';
import { SaleCreditList } from '../components/sale-credit-list';
import { formatCurrency } from '~/shared/lib/format-currency';
import { useMultiStore } from '~/shared/lib/hooks/use-multi-store';
import {
  MultiStoreSection,
  MultiStoreTotal,
} from '~/shared/components/multistore/multi-store-section';
import {
  groupSaleCreditsByDay,
  readStoreSaleCredits,
  unwrapStoreDek,
} from '~/shared/lib/multistore/multi-store-aggregator';

export const clientLoader = featureLoader([EFeatures.CreditSale]);

/**
 * React port of Angular's `sale-credits.component.html` (Créditos): credits
 * grouped by date into an accordion; each date panel wraps `SaleCreditList`
 * with `readOnly={false}` + edit/pay handlers (user request 2026-09-18: parity
 * with today-credits — the SAME Editar/Pagar gear, modals and service calls;
 * Angular's original had no `[readOnly]` binding here, but the write path is
 * store-scoped local storage and this view only edits the SELECTED store, so
 * it is safe). Multi-store panels stay read-only (no write path for non-
 * selected stores by design). Header shows count + total of ALL credits
 * (paid included) — user request. Angular's `loadSaleCredits()` always calls `filterSaleCredits(null,
 * null, null, null)` (no date-range/paid-state UI exists); the user-added
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
 * y el total impago en rojo a la derecha. En MultiStores el n/total reflejan
 * el filtro vigente — la tienda elegida en el select ("Todas" = todas) por el
 * rango de fechas aplicado — para que el header coincida con lo visible.
 */
export function SaleCreditsPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [dateSaleCredits, setDateSaleCredits] = useState<LocalDayGroup<SaleCredit>[]>([]);
  const [expandedDateIds, setExpandedDateIds] = useState<Set<string>>(new Set());
  const { enabled: multiStoreEnabled, stores: multiStoreStores } = useMultiStore();
  const [storeCredits, setStoreCredits] = useState<Map<string, SaleCredit[]>>(new Map());
  const [selectedMultiStoreId, setSelectedMultiStoreId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>({
    start: null,
    end: null,
  });

  // WU4 (flagged mismatch #4): Angular's SaleCreditsComponent.loadSaleCredits() always
  // calls filterSaleCredits(null, null, null, null) (sale-credits.component.ts:51-52) —
  // rewired here instead of bypassing the service filter with getAll().filter(isActive).
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
    // creditsCount/creditsTotal count UNPAID credits only (!isPaid) — matches Angular's
    // SaleCreditsComponent.groupSaleCredits exactly. groupByLocalDay returns newest-first;
    // reverse to preserve Angular's ASCENDING day order (SaleCreditsComponent), oldest first.
    setDateSaleCredits(
      groupByLocalDay(
        response.data,
        (c) => new Date(c.date),
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      ).reverse(),
    );
  }

  useEffect(() => {
    void loadSaleCredits();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadSaleCredits reads storeId + dateRange (the primitive bounds below)
  }, [storeId, dateRange.start, dateRange.end]);

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

  // Header y paneles cuentan/suman TODOS los créditos (pagados incluidos) — petición
  // del usuario; antes solo se contaban los impagos.
  const creditsCount = dateSaleCredits.reduce((count, d) => count + d.items.length, 0);
  const creditsTotal = dateSaleCredits.reduce(
    (total, d) => total + d.items.reduce((t, credit) => t + credit.total, 0),
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
          return true;
        });
        return [id, filtered] as const;
      }),
    );
    // Header n/total follow the CURRENT filter, not the whole store list: the
    // store select ("Todas" = every store) intersected with the applied range.
    // Mirrors MultiStoreSection's own visibleStores rule so header and panels
    // can never disagree.
    const visibleStores =
      selectedMultiStoreId === null
        ? multiStoreStores
        : multiStoreStores.filter((s) => s.id === selectedMultiStoreId);
    const visibleCredits = visibleStores.flatMap((s) => filteredStoreCredits.get(s.id) ?? []);
    const multiStoreCreditsCount = visibleCredits.length;
    const multiStoreCreditsTotal = visibleCredits.reduce((total, credit) => total + credit.total, 0);

    return (
      <Card
        padding="tight"
        title={<CreditsCardTitle count={multiStoreCreditsCount} total={multiStoreCreditsTotal} />}
      >
        <MultiStoreSection
          stores={multiStoreStores}
          selectedStoreId={selectedMultiStoreId}
          onSelectedStoreIdChange={setSelectedMultiStoreId}
          filters={
            <DateRangeFilter value={dateRange} onApply={setDateRange} className="flex-1 min-w-0" />
          }
          renderStoreTotals={(store) => {
            const credits = filteredStoreCredits.get(store.id) ?? [];
            const total = credits.reduce((t, c) => t + c.total, 0);
            return (
              <MultiStoreTotal
                label={`(${credits.length})`}
                value={total}
                valueClassName="text-warning"
              />
            );
          }}
        >
          {(store) => {
            const credits = filteredStoreCredits.get(store.id) ?? [];
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
                          <span className="text-xs font-semibold text-warning whitespace-nowrap">
                            {formatCurrency(
                              group.items.reduce((t, c) => t + c.total, 0),
                            )}
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
    <Card padding="tight" title={<CreditsCardTitle count={creditsCount} total={creditsTotal} />}>
      <div className="mb-3">
        <DateRangeFilter value={dateRange} onApply={setDateRange} />
      </div>

      {dateSaleCredits.length === 0 && (
        <InfoBox variant="primary" className="mb-6 text-center">
          {/* SALE_CREDIT.NO_SALE_CREDIT_FOUND */}
          {intl.formatMessage({ id: 'SALE_CREDIT.NO_SALE_CREDIT_FOUND' })}
        </InfoBox>
      )}

      <div className="space-y-2">
        {dateSaleCredits.map((dateSaleCredit) => {
          const dateId = dateSaleCredit.dayKey;
          const isExpanded = expandedDateIds.has(dateId);
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
                  <span className="text-sm font-semibold text-warning whitespace-nowrap">
                    {formatCurrency(
                      dateSaleCredit.items.reduce(
                        (total, c) => total + c.total,
                        0,
                      ),
                    )}
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
 * cannot drift: "Créditos (n)" on the left and the total in amber (text-warning)
 * on the right. `count`/`total` cover ALL credits (paid included) — user request
 * 2026-09-18. The count keeps the `rounded-full bg-success/10` pill class.
 */
function CreditsCardTitle({ count, total }: { count: number; total: number }) {
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
      <span className="text-sm font-semibold text-warning whitespace-nowrap">
        {formatCurrency(total)}
      </span>
    </div>
  );
}

export default SaleCreditsPage;
