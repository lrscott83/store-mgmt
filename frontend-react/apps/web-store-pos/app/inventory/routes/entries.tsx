import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import type { InventoryEntry, InventoryEntryView } from '@store-mgmt/domain';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { InventoryOfflineService } from '../lib/services/inventory-offline-service';
import { ProductOfflineService } from '~/sales/lib/services/product-offline-service';
import { InfoBox } from '~/shared/components/ui/info-box';
import { EntryList } from '../components/entry-list';
import { EditInventoryEntryModal } from '../components/edit-inventory-entry-modal';
import type { EditInventoryEntryInput } from '../components/edit-inventory-entry-modal';

export const clientLoader = featureLoader([EFeatures.EntriesHistory]);

interface DayEntryGroup {
  date: Date;
  entries: InventoryEntryView[];
  count: number;
  total: number;
}

/**
 * Groups active inventory entries by calendar day (`YYYY-MM-DD` via ISO date), computing a
 * per-day count (Σ quantity) and total (Σ costPrice·quantity). Mirrors Angular's
 * `EntriesComponent.groupEntries` exactly (entries.component.ts:82-104): same grouping key,
 * same per-day reducers, ascending sort both across days (:103) and within a day (:97).
 */
function groupEntriesByDay(entries: InventoryEntryView[]): DayEntryGroup[] {
  const groups = new Map<string, InventoryEntryView[]>();
  entries.forEach((entry) => {
    const groupId = new Date(entry.date).toISOString().split('T')[0];
    const collection = groups.get(groupId);
    if (collection) collection.push(entry);
    else groups.set(groupId, [entry]);
  });

  const dayGroups: DayEntryGroup[] = Array.from(groups.values()).map((groupEntries) => ({
    date: groupEntries[0].date,
    entries: [...groupEntries].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    ),
    count: groupEntries.reduce((count, e) => count + e.quantity, 0),
    total: groupEntries.reduce((total, e) => total + e.costPrice * e.quantity, 0),
  }));

  return dayGroups.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function formatDateOnly(date: Date): string {
  const d = new Date(date);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

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
 */
export function EntriesPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [dayGroups, setDayGroups] = useState<DayEntryGroup[]>([]);
  const [expandedDayIds, setExpandedDayIds] = useState<Set<string>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<InventoryEntry | undefined>();
  const [modalError, setModalError] = useState('');

  function loadEntries() {
    const svc = new InventoryOfflineService(storeId);
    const productSvc = new ProductOfflineService(storeId);
    const products = productSvc.getAll();
    const productMap = new Map(products.map((p) => [p.id, p.name]));
    const all = svc.getAll();
    const enriched = all.map((e) => ({
      ...e,
      productName: productMap.get(e.productId) ?? e.productName,
    }));
    setDayGroups(groupEntriesByDay(enriched));
  }

  useEffect(() => {
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  function toggleDayPanel(dayId: string) {
    setExpandedDayIds((prev) => {
      const next = new Set(prev);
      if (next.has(dayId)) next.delete(dayId);
      else next.add(dayId);
      return next;
    });
  }

  function handleEdit(entry: InventoryEntryView) {
    setEditingEntry({
      id: entry.id,
      productId: entry.productId,
      categoryId: '',
      quantity: entry.quantity,
      available: entry.quantity,
      costPrice: entry.costPrice,
      date: entry.date,
      order: 0,
      isActive: entry.isActive,
      createdDate: new Date(),
      createdByName: '',
      updatedDate: new Date(),
      updatedByName: '',
    });
    setIsModalOpen(true);
    setModalError('');
  }

  function handleDeactivate(entry: InventoryEntryView) {
    const svc = new InventoryOfflineService(storeId);
    try {
      svc.deactivate(entry.id, entry.productId);
      loadEntries();
    } catch (err) {
      console.error(err);
    }
  }

  function handleSave(data: EditInventoryEntryInput, entryId?: string) {
    const svc = new InventoryOfflineService(storeId);
    try {
      if (entryId) {
        svc.update(entryId, data.productId, data.quantity, data.costPrice);
      } else {
        svc.create(data.productId, data.quantity, data.costPrice, data.categoryId, new Date(data.date));
      }
      loadEntries();
      setIsModalOpen(false);
      setEditingEntry(undefined);
      setModalError('');
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : intl.formatMessage({ id: 'GENERAL.ERROR' }),
      );
    }
  }

  const entriesCount = dayGroups.reduce((count, d) => count + d.count, 0);
  const entriesTotal = dayGroups.reduce((total, d) => total + d.total, 0);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          {intl.formatMessage({ id: 'INVENTORY.ENTRIES.TITLE' })}
          <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
            ({entriesCount})
          </span>
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-primary">${entriesTotal.toFixed(2)}</span>
          <button
            onClick={() => {
              setEditingEntry(undefined);
              setModalError('');
              setIsModalOpen(true);
            }}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {intl.formatMessage({ id: 'INVENTORY.TODAY_ENTRIES.NEW_ENTRY' })}
          </button>
        </div>
      </div>

      {dayGroups.length === 0 && (
        <InfoBox variant="primary" className="text-center">
          {intl.formatMessage({ id: 'INVENTORY.NO_HISTORY_ENTRY_FOUND' })}
        </InfoBox>
      )}

      <div className="space-y-2">
        {dayGroups.map((dayGroup) => {
          const dayId = new Date(dayGroup.date).toISOString().split('T')[0];
          const isExpanded = expandedDayIds.has(dayId);
          return (
            <div key={dayId} className="rounded-lg border border-border bg-surface">
              <button
                type="button"
                onClick={() => toggleDayPanel(dayId)}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
                data-testid={`entry-day-panel-toggle-${dayId}`}
                aria-expanded={isExpanded}
              >
                <span className="text-sm font-medium text-text">
                  {formatDateOnly(dayGroup.date)}
                </span>
                <span className="text-sm font-semibold text-primary">
                  ${dayGroup.total.toFixed(2)}
                </span>
              </button>
              {isExpanded && (
                <div className="border-t border-border px-4 py-3">
                  <EntryList
                    entries={dayGroup.entries}
                    onEdit={handleEdit}
                    onDeactivate={handleDeactivate}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <EditInventoryEntryModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingEntry(undefined);
        }}
        onSave={handleSave}
        storeId={storeId}
        entry={editingEntry}
        error={modalError}
      />
    </div>
  );
}

export default EntriesPage;
