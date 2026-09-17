// multi-store-panels — shared scaffolding for the six multi-store views.
// Renders the GLOBAL controls the user asked to keep outside the panels:
// the store select ("Todas las tiendas" + one option per store), the
// global-filters slot and the outside-panels totals row, then one compact
// collapsible panel per store. The per-store collapse state lives HERE (one
// Set of open store ids), so views only supply per-store content, per-store
// totals and the outside-panels aggregate totals.
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';
import type { StoreSummary } from '@store-mgmt/domain';
import { ChevronDownIcon } from '~/shared/components/ui/icons';
import { formatCurrency } from '~/shared/lib/format-currency';
import { formatLocalDate } from '~/shared/lib/date-utils';

export interface MultiStoreSectionProps {
  stores: StoreSummary[];
  /** Store id shown by the global select ("Todas" = null). */
  selectedStoreId: string | null;
  onSelectedStoreIdChange: (storeId: string | null) => void;
  /**
   * GLOBAL filters slot — rendered once, above the panels. Pass the view's
   * existing filter controls (radio groups, date range, currency selector…)
   * here so filters apply across all stores.
   * inventory/available: leave the search OUTSIDE the panels per user.
   */
  filters?: ReactNode;
  /** Outside-panels aggregate totals — visible with every store selected or filtered. */
  totals?: ReactNode;
  children: (store: StoreSummary) => ReactNode;
  /** Per-store totals shown in the panel header, next to the store name. */
  renderStoreTotals: (store: StoreSummary) => ReactNode;
}

/**
 * Space: panels use compact chrome (px-2/py-2 header, px-2 body — half the
 * regular day-panel padding px-4/py-3) so more content fits left-to-right;
 * the wrapper adds no horizontal padding of its own.
 */
export function MultiStoreSection({
  stores,
  selectedStoreId,
  onSelectedStoreIdChange,
  filters,
  totals,
  children,
  renderStoreTotals,
}: MultiStoreSectionProps) {
  const intl = useIntl();
  const [openStoreIds, setOpenStoreIds] = useState<Set<string>>(new Set());

  function toggleStore(storeId: string) {
    setOpenStoreIds((prev) => {
      const next = new Set(prev);
      if (next.has(storeId)) next.delete(storeId);
      else next.add(storeId);
      return next;
    });
  }

  const visibleStores =
    selectedStoreId === null ? stores : stores.filter((s) => s.id === selectedStoreId);

  return (
    <div className="space-y-2">
      {/* Global store select + global filters — one row, outside the panels. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <select
          data-testid="multistore-select"
          value={selectedStoreId ?? ''}
          onChange={(e) => onSelectedStoreIdChange(e.target.value === '' ? null : e.target.value)}
          className="rounded border border-border bg-surface px-2 py-1 text-sm"
        >
          <option value="">{intl.formatMessage({ id: 'MULTISTORE.ALL_STORES' })}</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
        {filters}
      </div>

      {/* Outside-panels aggregate totals row. */}
      {totals && (
        <div data-testid="multistore-totals" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {totals}
        </div>
      )}

      <div className="space-y-2">
        {visibleStores.map((store) => {
          const isOpen = openStoreIds.has(store.id);
          return (
            <div key={store.id} className="rounded-lg border border-border bg-surface">
              <button
                type="button"
                onClick={() => toggleStore(store.id)}
                className="flex w-full items-center justify-between gap-2 px-2 py-2 text-left"
                data-testid={`multistore-panel-toggle-${store.id}`}
                aria-expanded={isOpen}
              >
                <span className="truncate text-sm font-semibold text-text">{store.name}</span>
                <span className="flex items-center gap-2">
                  <span className="text-sm whitespace-nowrap">{renderStoreTotals(store)}</span>
                  <ChevronDownIcon isExpanded={isOpen} className="text-text-muted" />
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-border px-2 py-2">{children(store)}</div>
              )}
            </div>
          );
        })}
        {visibleStores.length === 0 && (
          <div className="py-8 text-center text-text-muted">
            {intl.formatMessage({ id: 'MULTISTORE.NO_LOCAL_DATA' })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Small helpers for views that show labelled values in the totals row and
 * panel headers (currency-formatted amounts; panel sub-labels like
 * "11/09 (3)", mirroring the day-panel headers).
 */
export function MultiStoreTotal({
  label,
  value,
  valueClassName = 'text-text',
}: {
  /** Optional — omit for count/total-only chips (e.g. "(3) 12.50 USD"). */
  label?: string;
  value: number;
  valueClassName?: string;
}) {
  return (
    <span className="flex items-center gap-1 whitespace-nowrap">
      {label !== undefined && <span className="text-text-muted">{label}</span>}
      <span className={`font-semibold ${valueClassName}`}>{formatCurrency(value)}</span>
    </span>
  );
}

export function MultiStoreDateTotal({
  date,
  count,
  value,
  valueClassName = 'text-text',
}: {
  date: Date;
  count?: number;
  value: number;
  valueClassName?: string;
}) {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap text-sm">
      <span className="text-text">
        {formatLocalDate(date)}{count !== undefined ? ` (${count})` : ''}
      </span>
      <span className={`font-semibold ${valueClassName}`}>{formatCurrency(value)}</span>
    </span>
  );
}

export default MultiStoreSection;
