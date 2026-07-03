import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { adminFeatureLoader } from '~/auth/routes/loaders';
import { useOnlineStatus } from '~/shared/lib/hooks/use-online-status';
import { userHttpService } from '~/management/users/lib/services/user-http-service';
import { UserList } from '~/management/users/components/UserList';
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
      .listUsers()
      .then((res) => {
        setUsers(res.data);
        setError('');
      })
      .catch(() => {
        setError(intl.formatMessage({ id: 'USERS.ERROR' }));
      });
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <UserList
      users={users}
      isOnline={isOnline}
      error={error}
      onCreate={() => navigate('/management/users/create')}
      onEdit={(id) => navigate(`/management/users/edit/${id}`)}
      onActivate={(id) => handleLifecycleAction(userHttpService.activateUser, id)}
      onDeactivate={(id) => handleLifecycleAction(userHttpService.deactivateUser, id)}
    />
  );
}

export default UserListPage;
