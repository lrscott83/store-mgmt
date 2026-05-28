import { useIntl } from 'react-intl';
import type { EgressEntry } from '@store-mgmt/domain';

const EGRESS_TYPE_KEYS: Record<EgressEntry['egressType'], string> = {
  waste: 'EGRESS.TYPES.WASTE',
  return: 'EGRESS.TYPES.RETURN',
  transfer: 'EGRESS.TYPES.TRANSFER',
  adjustment: 'EGRESS.TYPES.ADJUSTMENT',
};

interface EgressListProps {
  egresses: EgressEntry[];
  productNames: Map<string, string>;
  onEdit: (entry: EgressEntry) => void;
  onDeactivate: (entry: EgressEntry) => void;
}

export function EgressList({ egresses, productNames, onEdit, onDeactivate }: EgressListProps) {
  const intl = useIntl();

  if (egresses.length === 0) {
    return (
      <div className="py-8 text-center text-gray-400">
        {intl.formatMessage({ id: 'EGRESS.EMPTY_STATE' })}
      </div>
    );
  }

  return (
    <div className="rounded border bg-white">
      <table className="w-full text-sm">
        <thead className="border-b bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left font-medium text-gray-600">
              {intl.formatMessage({ id: 'EGRESS.FORM.PRODUCT' })}
            </th>
            <th className="px-4 py-2 text-right font-medium text-gray-600">
              {intl.formatMessage({ id: 'EGRESS.FORM.QUANTITY' })}
            </th>
            <th className="px-4 py-2 text-left font-medium text-gray-600">
              {intl.formatMessage({ id: 'EGRESS.FORM.TYPE' })}
            </th>
            <th className="px-4 py-2 text-left font-medium text-gray-600">
              {intl.formatMessage({ id: 'EGRESS.FORM.NOTES' })}
            </th>
            <th className="px-4 py-2 text-left font-medium text-gray-600">
              {intl.formatMessage({ id: 'EGRESS.FORM.DATE' })}
            </th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {egresses.map((entry) => (
            <tr key={entry.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-800">
                {productNames.get(entry.productId) ?? entry.productId}
              </td>
              <td className="px-4 py-3 text-right text-gray-600">{entry.quantity}</td>
              <td className="px-4 py-3">
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                  {intl.formatMessage({ id: EGRESS_TYPE_KEYS[entry.egressType] })}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-500 text-xs">{entry.notes ?? ''}</td>
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
