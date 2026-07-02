import { useIntl } from 'react-intl';
import type { InventoryEntryView } from '@store-mgmt/domain';
import { InfoBox } from '~/shared/components/ui/info-box';

interface InventoryDailyEntriesProps {
  entries: InventoryEntryView[];
  onEdit: (entry: InventoryEntryView) => void;
  onDeactivate: (entry: InventoryEntryView) => void;
}

export function InventoryDailyEntries({ entries, onEdit, onDeactivate }: InventoryDailyEntriesProps) {
  const intl = useIntl();

  if (entries.length === 0) {
    return (
      <InfoBox variant="primary" className="text-center">
        {intl.formatMessage({ id: 'INVENTORY_ENTRY.NO_ENTRY_FOUND_IN_DAY' })}
      </InfoBox>
    );
  }

  // Group entries by productName
  const grouped = entries.reduce<Map<string, InventoryEntryView[]>>((map, entry) => {
    const key = entry.productName || entry.productId;
    const existing = map.get(key) ?? [];
    map.set(key, [...existing, entry]);
    return map;
  }, new Map());

  return (
    <div className="space-y-4">
      {Array.from(grouped.entries()).map(([productName, productEntries]) => (
        <div key={productName} className="rounded border border-border bg-surface">
          <div className="border-b border-border bg-background px-4 py-2">
            <h3 className="font-medium text-text">{productName}</h3>
          </div>
          <div className="divide-y divide-border">
            {productEntries.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between px-4 py-3">
                <div className="space-y-0.5">
                  <div className="flex gap-4 text-sm">
                    <span className="text-text-muted">
                      {intl.formatMessage({ id: 'INVENTORY.ENTRY.COST_PRICE' })}:{' '}
                      <strong>${entry.costPrice.toFixed(2)}</strong>
                    </span>
                    <span className="text-text-muted">
                      {intl.formatMessage({ id: 'INVENTORY.ENTRY.QUANTITY' })}:{' '}
                      <strong>{entry.quantity}</strong>
                    </span>
                    <span className="text-text-muted">
                      {intl.formatMessage({ id: 'INVENTORY.ENTRY.DATE' })}:{' '}
                      {new Date(entry.date).toLocaleDateString('es')}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onEdit(entry)}
                    className="rounded bg-primary-light px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                  >
                    {intl.formatMessage({ id: 'GENERAL.EDIT' })}
                  </button>
                  <button
                    onClick={() => onDeactivate(entry)}
                    className="rounded bg-danger/10 px-3 py-1 text-xs font-medium text-danger hover:bg-danger/20"
                  >
                    {/* CRITICAL bug fix (Angular parity: entry-list.component.html:36
                        GENERAL.DELETE) — was wrongly wired to ORDERS.DEACTIVATE
                        ("Anular pedido"), the cancel-order label, not delete-entry. */}
                    {intl.formatMessage({ id: 'GENERAL.DELETE' })}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
