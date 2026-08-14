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

export const clientLoader = featureLoader([EFeatures.CreditSale]);

/**
 * Matches Angular's `sale-credits.component.html` (Créditos): NO filters at
 * all — Angular's `loadSaleCredits()` always calls `filterSaleCredits(null,
 * null, null, null)` (no date-range/paid-state UI exists). Credits grouped
 * by date into an accordion; each date panel wraps `SaleCreditList` with NO
 * `readOnly` prop passed (Angular's `<app-sale-credit-list>` here has no
 * `[readOnly]` binding → default `true`, no edit/pay actions reachable from
 * this view). Header shows count + total of UNPAID credits only.
 */
export function SaleCreditsPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [dateSaleCredits, setDateSaleCredits] = useState<LocalDayGroup<SaleCredit>[]>([]);
  const [expandedDateIds, setExpandedDateIds] = useState<Set<string>>(new Set());

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
          <span className="text-sm font-semibold text-danger">${creditsTotal.toFixed(2)}</span>
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
                  <span className="text-sm font-semibold text-danger">
                    ${dateSaleCredit.items.reduce((total, c) => total + (!c.isPaid ? c.total : 0), 0).toFixed(2)}
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
