import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { SaleCredit } from '@store-mgmt/domain';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { ChevronDownIcon } from '~/shared/components/ui/icons';
import { SaleCreditOfflineService } from '../lib/services/sale-credit-offline-service';
import { SaleCreditList } from '../components/sale-credit-list';

export const clientLoader = featureLoader([EFeatures.CreditSale]);

interface DateSaleCredit {
  date: Date;
  saleCredits: SaleCredit[];
  creditsCount: number;
  creditsTotal: number;
}

function groupSaleCredits(saleCredits: SaleCredit[]): DateSaleCredit[] {
  const groups = new Map<string, SaleCredit[]>();
  saleCredits.forEach((credit) => {
    const groupId = new Date(credit.date).toISOString().split('T')[0];
    const collection = groups.get(groupId);
    if (collection) collection.push(credit);
    else groups.set(groupId, [credit]);
  });

  const dateSaleCredits: DateSaleCredit[] = Array.from(groups.values()).map((credits) => ({
    date: credits[0].date,
    saleCredits: [...credits].sort((c1, c2) => new Date(c1.date).getTime() - new Date(c2.date).getTime()),
    // creditsCount/creditsTotal only count UNPAID credits — matches Angular's
    // SaleCreditsComponent.groupSaleCredits exactly (count += !isPaid ? 1 : 0).
    creditsCount: credits.reduce((count, c) => count + (!c.isPaid ? 1 : 0), 0),
    creditsTotal: credits.reduce((total, c) => total + (!c.isPaid ? c.total : 0), 0),
  }));

  return dateSaleCredits.sort((c1, c2) => new Date(c1.date).getTime() - new Date(c2.date).getTime());
}

function formatDateOnly(date: Date): string {
  const d = new Date(date);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

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
  const [dateSaleCredits, setDateSaleCredits] = useState<DateSaleCredit[]>([]);
  const [expandedDateIds, setExpandedDateIds] = useState<Set<string>>(new Set());

  // WU4 (flagged mismatch #4): Angular's SaleCreditsComponent.loadSaleCredits() always
  // calls filterSaleCredits(null, null, null, null) (sale-credits.component.ts:51-52) —
  // rewired here instead of bypassing the service filter with getAll().filter(isActive).
  async function loadSaleCredits() {
    const service = new SaleCreditOfflineService(storeId);
    const response = await service.filterSaleCredits(null, null, null, null);
    setDateSaleCredits(groupSaleCredits(response.data));
  }

  useEffect(() => {
    void loadSaleCredits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  function toggleDatePanel(dateId: string) {
    setExpandedDateIds((prev) => {
      const next = new Set(prev);
      if (next.has(dateId)) next.delete(dateId);
      else next.add(dateId);
      return next;
    });
  }

  const creditsCount = dateSaleCredits.reduce((count, d) => count + d.creditsCount, 0);
  const creditsTotal = dateSaleCredits.reduce((total, d) => total + d.creditsTotal, 0);

  return (
    <Card
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
          const dateId = new Date(dateSaleCredit.date).toISOString().split('T')[0];
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
                  {formatDateOnly(dateSaleCredit.date)} ({dateSaleCredit.creditsCount})
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-danger">
                    ${dateSaleCredit.creditsTotal.toFixed(2)}
                  </span>
                  <ChevronDownIcon isExpanded={isExpanded} className="text-text-muted" />
                </span>
              </button>
              {isExpanded && (
                <div className="border-t border-border px-4 py-3">
                  <SaleCreditList saleCredits={dateSaleCredit.saleCredits} />
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
