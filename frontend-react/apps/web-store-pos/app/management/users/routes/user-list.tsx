import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { adminFeatureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useOnlineStatus } from '~/shared/lib/hooks/use-online-status';
import { userHttpService } from '~/management/users/lib/services/user-http-service';
import { UserList } from '~/management/users/components/UserList';
import { BaseRepository } from '~/shared/lib/storage/base-repository';
import type { User } from '@store-mgmt/domain';

const userRepository = new BaseRepository<User>('storeusers', []);

export const clientLoader = adminFeatureLoader([EFeatures.Users]);

export function UserListPage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const { user } = useAuthStore();
  const storeId = user?.selectedStoreId ?? '';

  const [users, setUsers] = useState<User[]>([]);
  const [isDegraded, setIsDegraded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOnline) {
      const cached = userRepository.getAll(storeId);
      setUsers(Array.from(cached.values()));
      setIsDegraded(true);
      return;
    }

    setIsDegraded(false);
    userHttpService
      .listUsers()
      .then((res) => {
        setUsers(res.data);
        const map = new Map(res.data.map((u) => [u.id, u]));
        userRepository.save(storeId, map);
        setError('');
      })
      .catch(() => {
        setError(intl.formatMessage({ id: 'USERS.ERROR' }));
      });
  }, [isOnline, storeId, intl]);

  async function handleLifecycleAction(
    action: (id: string) => Promise<unknown>,
    id: string
  ) {
    if (!isOnline) return;
    try {
      await action(id);
      const res = await userHttpService.listUsers();
      setUsers(res.data);
      const map = new Map(res.data.map((u) => [u.id, u]));
      userRepository.save(storeId, map);
      setError('');
    } catch {
      setError(intl.formatMessage({ id: 'USERS.LIFECYCLE_ERROR' }));
    }
  }

  return (
    <UserList
      users={users}
      isOnline={isOnline}
      isDegraded={isDegraded}
      error={error}
      onCreate={() => navigate('/management/users/create')}
      onEdit={(id) => navigate(`/management/users/edit/${id}`)}
      onActivate={(id) => handleLifecycleAction(userHttpService.activateUser, id)}
      onDeactivate={(id) => handleLifecycleAction(userHttpService.deactivateUser, id)}
    />
  );
}

export default UserListPage;
