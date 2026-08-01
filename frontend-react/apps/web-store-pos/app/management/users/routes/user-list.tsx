import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { adminFeatureLoader } from '~/auth/routes/loaders';
import { useOnlineStatus } from '~/shared/lib/hooks/use-online-status';
import { userHttpService } from '~/management/users/lib/services/user-http-service';
import { UserCardList } from '~/management/users/components/user-card-list';
import { RosterExportPanel } from '~/management/users/components/roster-export-panel';
import type { User } from '@store-mgmt/domain';

export const clientLoader = adminFeatureLoader([EFeatures.Users]);

export function UserListPage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();

  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');

  function loadUsers() {
    userHttpService
      .getUsers()
      .then((res) => {
        if (!res.succeeded) {
          setError(intl.formatMessage({ id: 'USERS.ERROR' }));
          return;
        }
        setUsers(res.data);
        setError('');
      })
      .catch(() => {
        setError(intl.formatMessage({ id: 'USERS.ERROR' }));
      });
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only fetch (Angular ngOnInit parity)
  }, []);

  async function handleLifecycleAction(
    action: (id: string) => Promise<unknown>,
    id: string
  ) {
    if (!isOnline) return;
    try {
      await action(id);
      loadUsers();
      setError('');
    } catch {
      setError(intl.formatMessage({ id: 'USERS.LIFECYCLE_ERROR' }));
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {intl.formatMessage({ id: 'USERS.LIST_TITLE' })}
        </h1>
        <RosterExportPanel />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <UserCardList
        users={users}
        onCreate={() => navigate('/management/users/create')}
        onEdit={(id) => navigate(`/management/users/edit/${id}`)}
        onActivate={(id) => handleLifecycleAction((userId) => userHttpService.activateUser(userId, true), id)}
        onDeactivate={(id) => handleLifecycleAction(userHttpService.deleteUser, id)}
      />
    </div>
  );
}

export default UserListPage;
