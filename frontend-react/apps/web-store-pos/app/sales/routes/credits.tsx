import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { SaleCredit } from '@store-mgmt/domain';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { ChevronDownIcon } from '~/shared/components/ui/icons';
import { formatLocalDate, groupByLocalDay } from '~/shared/lib/date-utils';
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
 * Matches Angular's `sale-credits.component.html` (Créditos): NO filters at
 * all — Angular's `loadSaleCredits()` always calls `filterSaleCredits(null,
 * null, null, null)` (no date-range/paid-state UI exists). Credits grouped
 * by date into an accordion; each date panel wraps `SaleCreditList` with NO
 * `readOnly` prop passed (Angular's `<app-sale-credit-list>` here has no
 * `[readOnly]` binding → default `true`, no edit/pay actions reachable from
 * this view). Header shows count + total of UNPAID credits only.
 *
 * multi-store-panels: OwnerAdmin + módulo MultiStores + ≥2 tiendas activas →
 * un panel colapsable por tienda (datos locales del dispositivo, DEK por
 * tienda), select global "Todas"/tienda y totales fuera de los paneles.
 * Sin MultiStores la vista es idéntica a la original.
 */
export function SaleCreditsPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [dateSaleCredits, setDateSaleCredits] = useState<LocalDayGroup<SaleCredit>[]>([]);
  const [expandedDateIds, setExpandedDateIds] = useState<Set<string>>(new Set());
  const { enabled: multiStoreEnabled, stores: multiStoreStores } = useMultiStore();
  const [storeCredits, setStoreCredits] = useState<Map<string, SaleCredit[]>>(new Map());
  const [selectedMultiStoreId, setSelectedMultiStoreId] = useState<string | null>(null);

  // WU4 (flagged mismatch #4): Angular's SaleCreditsComponent.loadSaleCredits() always
  // calls filterSaleCredits(null, null, null, null) (sale-credits.component.ts:51-52) —
  // rewired here instead of bypassing the service filter with getAll().filter(isActive).
  async function loadSaleCredits() {
    const service = new SaleCreditOfflineService(storeId);
    const response = await service.filterSaleCredits(null, null, null, null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadSaleCredits reads only storeId
  }, [storeId]);

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

  const creditsCount = dateSaleCredits.reduce(
    (count, d) => count + d.items.reduce((c, credit) => c + (!credit.isPaid ? 1 : 0), 0),
    0,
  );
  const creditsTotal = dateSaleCredits.reduce(
    (total, d) => total + d.items.reduce((t, credit) => t + (!credit.isPaid ? credit.total : 0), 0),
    0,
  );

  // ─── multi-store mode ────────────────────────────────────────────────────
  if (multiStoreEnabled) {
    const visibleCredits =
      selectedMultiStoreId === null
        ? storeCredits
        : new Map([...storeCredits].filter(([id]) => id === selectedMultiStoreId));
    const totals = [...visibleCredits.values()].reduce(
      (acc, credits) => {
        for (const credit of credits) {
          if (!credit.isPaid) {
            acc.count += 1;
            acc.total += credit.total;
          }
        }
        return acc;
      },
      { count: 0, total: 0 },
    );
    return (
      <Card padding="tight" title={intl.formatMessage({ id: 'SALE_CREDIT.TITLE' })}>
        <MultiStoreSection
          stores={multiStoreStores}
          selectedStoreId={selectedMultiStoreId}
          onSelectedStoreIdChange={setSelectedMultiStoreId}
          totals={
            <MultiStoreTotal
              label={intl.formatMessage({ id: 'SALE_CREDIT.TITLE' })}
              value={totals.total}
              valueClassName="text-danger"
            />
          }
          renderStoreTotals={(store) => {
            const credits = storeCredits.get(store.id) ?? [];
            const unpaid = credits.filter((c) => !c.isPaid);
            const total = unpaid.reduce((t, c) => t + c.total, 0);
            return (
              <MultiStoreTotal
                label={`(${unpaid.length})`}
                value={total}
                valueClassName="text-danger"
              />
            );
          }}
        >
          {(store) => {
            const credits = storeCredits.get(store.id) ?? [];
            if (credits.length === 0) {
              return (
                <div className="py-4 text-center text-text-muted">
                  {intl.formatMessage({ id: 'MULTISTORE.NO_LOCAL_DATA' })}
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
                          {formatLocalDate(group.date)} (
                          {group.items.reduce((count, c) => count + (!c.isPaid ? 1 : 0), 0)})
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-danger whitespace-nowrap">
                            {formatCurrency(
                              group.items.reduce((t, c) => t + (!c.isPaid ? c.total : 0), 0),
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
    <Card
      padding="tight"
      title={
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            {/* SALE_CREDIT.TITLE */}
            {intl.formatMessage({ id: 'SALE_CREDIT.TITLE' })}
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
              ({creditsCount})
            </span>
          </span>
          <span className="text-sm font-semibold text-danger whitespace-nowrap">
            {formatCurrency(creditsTotal)}
          </span>
        </div>
      }
    >
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
                  {formatLocalDate(dateSaleCredit.date)} (
                  {dateSaleCredit.items.reduce((count, c) => count + (!c.isPaid ? 1 : 0), 0)})
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-danger whitespace-nowrap">
                    {formatCurrency(
                      dateSaleCredit.items.reduce(
                        (total, c) => total + (!c.isPaid ? c.total : 0),
                        0,
                      ),
                    )}
                  </span>
                  <ChevronDownIcon isExpanded={isExpanded} className="text-text-muted" />
                </span>
              </button>
              {isExpanded && (
                <div className="border-t border-border px-4 py-3">
                  <SaleCreditList saleCredits={dateSaleCredit.items} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default SaleCreditsPage;
