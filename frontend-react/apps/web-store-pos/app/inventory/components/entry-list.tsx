import { useIntl } from 'react-intl';
import type { InventoryEntryView } from '@store-mgmt/domain';

interface EntryListProps {
  entries: InventoryEntryView[];
  onEdit: (entry: InventoryEntryView) => void;
  onDeactivate: (entry: InventoryEntryView) => void;
}

export function EntryList({ entries, onEdit, onDeactivate }: EntryListProps) {
  const intl = useIntl();

  if (entries.length === 0) {
    return (
      <div className="py-8 text-center text-gray-400">
        {intl.formatMessage({ id: 'INVENTORY.EMPTY_STATE' })}
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
            <th className="px-4 py-2" />
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
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => onEdit(entry)}
                    className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => onDeactivate(entry)}
                    className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                  >
                    {intl.formatMessage({ id: 'ORDERS.DEACTIVATE' })}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
