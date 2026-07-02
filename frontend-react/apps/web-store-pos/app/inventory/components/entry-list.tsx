import { useIntl } from 'react-intl';
import type { InventoryEntryView } from '@store-mgmt/domain';

interface EntryListProps {
  entries: InventoryEntryView[];
  onEdit?: (entry: InventoryEntryView) => void;
  onDeactivate?: (entry: InventoryEntryView) => void;
  /**
   * Mirrors Angular's `entry-list.component.ts:22` `@Input() readOnly: boolean = true`.
   * When true, the edit/deactivate action column is hidden. Defaults to `false` here (not
   * Angular's default) because the only current caller that omits an explicit override is
   * `today-entries.tsx`, which — like Angular's own `today-entries.component.html:24`
   * `[readOnly]="false"` — needs actions enabled by default.
   */
  readOnly?: boolean;
}

export function EntryList({ entries, onEdit, onDeactivate, readOnly = false }: EntryListProps) {
  const intl = useIntl();

  if (entries.length === 0) {
    return (
      <div className="py-8 text-center text-gray-400">
        {intl.formatMessage({ id: 'INVENTORY.NO_ENTRY_FOUND' })}
      </div>
    );
  }

  return (
    <div className="rounded border bg-white">
      <table className="w-full text-sm">
        <thead className="border-b bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left font-medium text-gray-600">
              {intl.formatMessage({ id: 'INVENTORY.ENTRY.PRODUCT' })}
            </th>
            <th className="px-4 py-2 text-right font-medium text-gray-600">
              {intl.formatMessage({ id: 'INVENTORY.ENTRY.QUANTITY' })}
            </th>
            <th className="px-4 py-2 text-right font-medium text-gray-600">
              {intl.formatMessage({ id: 'INVENTORY.ENTRY.COST_PRICE' })}
            </th>
            <th className="px-4 py-2 text-left font-medium text-gray-600">
              {intl.formatMessage({ id: 'INVENTORY.ENTRY.DATE' })}
            </th>
            {!readOnly && <th className="px-4 py-2" />}
          </tr>
        </thead>
        <tbody className="divide-y">
          {entries.map((entry) => (
            <tr key={entry.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-800">
                {entry.productName || entry.productId}
              </td>
              <td className="px-4 py-3 text-right text-gray-600">{entry.quantity}</td>
              <td className="px-4 py-3 text-right text-gray-600">${entry.costPrice.toFixed(2)}</td>
              <td className="px-4 py-3 text-gray-500">
                {new Date(entry.date).toLocaleDateString('es')}
              </td>
              {!readOnly && (
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => onEdit?.(entry)}
                      className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                    >
                      {intl.formatMessage({ id: 'GENERAL.EDIT' })}
                    </button>
                    <button
                      onClick={() => onDeactivate?.(entry)}
                      className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                    >
                      {/* CRITICAL bug fix (Angular parity: entry-list.component.html:36
                          GENERAL.DELETE) — was wrongly wired to ORDERS.DEACTIVATE
                          ("Anular pedido"), the cancel-order label, not delete-entry. */}
                      {intl.formatMessage({ id: 'GENERAL.DELETE' })}
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
