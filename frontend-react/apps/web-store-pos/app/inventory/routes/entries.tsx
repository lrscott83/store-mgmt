import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import type { InventoryEntryView } from '@store-mgmt/domain';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { isOwnerAdmin as checkIsOwnerAdmin } from '~/shared/lib/auth/authorization-service';
import { InventoryOfflineService } from '../lib/services/inventory-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { ChevronDownIcon } from '~/shared/components/ui/icons';
import { formatLocalDate, groupByLocalDay } from '~/shared/lib/date-utils';
import type { LocalDayGroup } from '~/shared/lib/date-utils';
import { EntryList } from '../components/entry-list';
import { round2 } from '~/shared/lib/money';

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
 */
export function EntriesPage() {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const storeId = user?.selectedStoreId ?? '';
  // Angular parity: entry-list.component.ts:32 isOwnerAdmin() (currentUser.isOwnerAdmin) —
  // gates the cost-price column inside EntryList (diff-matrix #6, L5 map).
  const isOwnerAdmin = user ? checkIsOwnerAdmin(user) : false;
  const [dayGroups, setDayGroups] = useState<LocalDayGroup<InventoryEntryView>[]>([]);
  const [expandedDayIds, setExpandedDayIds] = useState<Set<string>>(new Set());

  function loadEntries() {
    const productRepository = new ProductRepository(storeId, new ProductCategoryRepository(storeId));
    const svc = new InventoryOfflineService(storeId, productRepository);
    const products = [...productRepository.getStorageProductsMap().values()];
    const productMap = new Map(products.map((p) => [p.id, p.name]));
    const all = svc.getActiveInventoryEntriesStorage();
    const enriched = all.map((e) => ({
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
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadEntries reads only storeId
  }, [storeId]);

  function toggleDayPanel(dayId: string) {
    setExpandedDayIds((prev) => {
      const next = new Set(prev);
      if (next.has(dayId)) next.delete(dayId);
      else next.add(dayId);
      return next;
    });
  }

  const entriesCount = dayGroups.reduce(
    (count, d) => count + d.items.reduce((c, e) => c + e.quantity, 0),
    0,
  );
  const entriesTotal = dayGroups.reduce(
    (total, d) => total + d.items.reduce((t, e) => t + round2(e.costPrice * e.quantity), 0),
    0,
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
          <span className="text-sm font-semibold text-primary">${entriesTotal.toFixed(2)}</span>
        </div>
      }
    >
      <div className="space-y-4">
        {dayGroups.length === 0 && (
          <InfoBox variant="primary" className="text-center">
            {intl.formatMessage({ id: 'INVENTORY.NO_HISTORY_ENTRY_FOUND' })}
          </InfoBox>
        )}

        <div className="space-y-2">
          {dayGroups.map((dayGroup) => {
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
                    {formatLocalDate(dayGroup.date)}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-primary">
                      ${round2(dayGroup.items.reduce((total, e) => total + e.costPrice * e.quantity, 0)).toFixed(2)}
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
