import { useIntl } from 'react-intl';
import type { StoreUser } from '@store-mgmt/domain';

interface UserListProps {
  users: StoreUser[];
  isOnline: boolean;
  isDegraded: boolean;
  onCreate: () => void;
  onEdit: (id: string) => void;
  onActivate: (id: string) => void;
  onDeactivate: (id: string) => void;
  error?: string;
}

export function UserList({
  users,
  isOnline,
  isDegraded,
  onCreate,
  onEdit,
  onActivate,
  onDeactivate,
  error,
}: UserListProps) {
  const intl = useIntl();

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {intl.formatMessage({ id: 'USERS.LIST_TITLE' })}
        </h1>
        <button
          type="button"
          onClick={onCreate}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {intl.formatMessage({ id: 'USERS.CREATE' })}
        </button>
      </div>

      {isDegraded && (
        <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
          {intl.formatMessage({ id: 'USERS.DEGRADED_NOTICE' })}
        </p>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {users.length === 0 ? (
        <p className="text-sm text-gray-500">
          {intl.formatMessage({ id: 'USERS.EMPTY' })}
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-medium text-gray-500 uppercase">
              <th className="py-2 pr-4">{intl.formatMessage({ id: 'USERS.FULL_NAME' })}</th>
              <th className="py-2 pr-4">{intl.formatMessage({ id: 'USERS.LOGIN' })}</th>
              <th className="py-2 pr-4">{intl.formatMessage({ id: 'USERS.CELL_PHONE' })}</th>
              <th className="py-2 pr-4">{intl.formatMessage({ id: 'USERS.IS_ACTIVE' })}</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b">
                <td className="py-2 pr-4 font-medium">{user.fullName}</td>
                <td className="py-2 pr-4 text-gray-600">{user.login}</td>
                <td className="py-2 pr-4 text-gray-600">{user.cellPhone}</td>
                <td className="py-2 pr-4">{user.isActive ? '✓' : '✗'}</td>
                <td className="py-2 flex gap-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => onEdit(user.id)}
                    disabled={!isOnline}
                    className="rounded bg-gray-100 px-2 py-1 text-xs font-medium hover:bg-gray-200 disabled:opacity-50"
                  >
                    {intl.formatMessage({ id: 'USERS.EDIT' })}
                  </button>
                  <button
                    type="button"
                    onClick={() => onActivate(user.id)}
                    disabled={!isOnline}
                    className="rounded bg-green-100 px-2 py-1 text-xs font-medium hover:bg-green-200 disabled:opacity-50"
                  >
                    {intl.formatMessage({ id: 'USERS.ACTIVATE' })}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeactivate(user.id)}
                    disabled={!isOnline}
                    className="rounded bg-red-100 px-2 py-1 text-xs font-medium hover:bg-red-200 disabled:opacity-50"
                  >
                    {intl.formatMessage({ id: 'USERS.DEACTIVATE' })}
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

export default UserList;
