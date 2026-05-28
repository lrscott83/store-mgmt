import { useIntl } from 'react-intl';
import type { InventoryEntryView } from '@store-mgmt/domain';

interface InventoryDailyEntriesProps {
  entries: InventoryEntryView[];
  onEdit: (entry: InventoryEntryView) => void;
  onDeactivate: (entry: InventoryEntryView) => void;
}

export function InventoryDailyEntries({ entries, onEdit, onDeactivate }: InventoryDailyEntriesProps) {
  const intl = useIntl();

  if (entries.length === 0) {
    return (
      <div className="py-8 text-center text-gray-400">
        {intl.formatMessage({ id: 'INVENTORY.EMPTY_STATE' })}
      </div>
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
        <div key={productName} className="rounded border bg-white">
          <div className="border-b bg-gray-50 px-4 py-2">
            <h3 className="font-medium text-gray-800">{productName}</h3>
          </div>
          <div className="divide-y">
            {productEntries.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between px-4 py-3">
                <div className="space-y-0.5">
                  <div className="flex gap-4 text-sm">
                    <span className="text-gray-500">
                      {intl.formatMessage({ id: 'INVENTORY.ENTRY.COST_PRICE' })}:{' '}
                      <strong>${entry.costPrice.toFixed(2)}</strong>
                    </span>
                    <span className="text-gray-500">
                      {intl.formatMessage({ id: 'INVENTORY.ENTRY.QUANTITY' })}:{' '}
                      <strong>{entry.quantity}</strong>
                    </span>
                    <span className="text-gray-500">
                      {intl.formatMessage({ id: 'INVENTORY.ENTRY.DATE' })}:{' '}
                      {new Date(entry.date).toLocaleDateString('es')}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onEdit(entry)}
                    className="rounded bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => onDeactivate(entry)}
                    className="rounded bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                  >
                    {intl.formatMessage({ id: 'ORDERS.DEACTIVATE' })}
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
