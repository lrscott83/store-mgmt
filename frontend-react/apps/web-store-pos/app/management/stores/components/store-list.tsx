import { useIntl } from 'react-intl';
import type { Store } from '@store-mgmt/domain';

interface StoreListProps {
  stores: Store[];
  isOnline: boolean;
  isDegraded: boolean;
  onCreate: () => void;
  onEdit: (id: string) => void;
  onActivate: (id: string) => void;
  onApprove: (id: string) => void;
  onDisapprove: (id: string) => void;
  onDeactivate: (id: string) => void;
  error?: string;
}

export function StoreList({
  stores,
  isOnline,
  isDegraded,
  onCreate,
  onEdit,
  onActivate,
  onApprove,
  onDisapprove,
  onDeactivate,
  error,
}: StoreListProps) {
  const intl = useIntl();

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {intl.formatMessage({ id: 'STORES.LIST_TITLE' })}
        </h1>
        <button
          type="button"
          onClick={onCreate}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {intl.formatMessage({ id: 'STORES.CREATE' })}
        </button>
      </div>

      {isDegraded && (
        <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
          {intl.formatMessage({ id: 'STORES.DEGRADED_NOTICE' })}
        </p>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {stores.length === 0 ? (
        <p className="text-sm text-gray-500">
          {intl.formatMessage({ id: 'STORES.EMPTY_STATE' })}
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-medium text-gray-500 uppercase">
              <th className="py-2 pr-4">{intl.formatMessage({ id: 'STORES.NAME' })}</th>
              <th className="py-2 pr-4">{intl.formatMessage({ id: 'STORES.ADDRESS' })}</th>
              <th className="py-2 pr-4">{intl.formatMessage({ id: 'STORES.APPROVED' })}</th>
              <th className="py-2 pr-4">{intl.formatMessage({ id: 'STORES.IS_ACTIVE' })}</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {stores.map((store) => (
              <tr key={store.id} className="border-b">
                <td className="py-2 pr-4 font-medium">{store.name}</td>
                <td className="py-2 pr-4 text-gray-600">{store.address}</td>
                <td className="py-2 pr-4">{store.approved ? '✓' : '✗'}</td>
                <td className="py-2 pr-4">{store.isActive ? '✓' : '✗'}</td>
                <td className="py-2 flex gap-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => onEdit(store.id)}
                    disabled={!isOnline}
                    className="rounded bg-gray-100 px-2 py-1 text-xs font-medium hover:bg-gray-200 disabled:opacity-50"
                  >
                    {intl.formatMessage({ id: 'STORES.EDIT' })}
                  </button>
                  <button
                    type="button"
                    onClick={() => onActivate(store.id)}
                    disabled={!isOnline}
                    className="rounded bg-green-100 px-2 py-1 text-xs font-medium hover:bg-green-200 disabled:opacity-50"
                  >
                    {intl.formatMessage({ id: 'STORES.ACTIVATE' })}
                  </button>
                  <button
                    type="button"
                    onClick={() => onApprove(store.id)}
                    disabled={!isOnline}
                    className="rounded bg-blue-100 px-2 py-1 text-xs font-medium hover:bg-blue-200 disabled:opacity-50"
                  >
                    {intl.formatMessage({ id: 'STORES.APPROVE' })}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDisapprove(store.id)}
                    disabled={!isOnline}
                    className="rounded bg-yellow-100 px-2 py-1 text-xs font-medium hover:bg-yellow-200 disabled:opacity-50"
                  >
                    {intl.formatMessage({ id: 'STORES.DISAPPROVE' })}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeactivate(store.id)}
                    disabled={!isOnline}
                    className="rounded bg-red-100 px-2 py-1 text-xs font-medium hover:bg-red-200 disabled:opacity-50"
                  >
                    {intl.formatMessage({ id: 'STORES.DEACTIVATE' })}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default StoreList;
