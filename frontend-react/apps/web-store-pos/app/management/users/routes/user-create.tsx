import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useIntl } from 'react-intl';
import { EFeatures, ERoles } from '@store-mgmt/domain';
import { adminFeatureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useOnlineStatus } from '~/shared/lib/hooks/use-online-status';
import { userHttpService } from '~/management/users/lib/services/user-http-service';
import { UserCreateForm } from '~/management/users/components/UserCreateForm';
import { httpErrorKey } from '~/shared/lib/http/http-error';

export const clientLoader = adminFeatureLoader([EFeatures.Users]);

export function UserCreatePage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { storeId: paramStoreId } = useParams<{ storeId: string }>();
  const isOnline = useOnlineStatus();
  const { user } = useAuthStore();

  const resolvedStoreId = paramStoreId ?? user?.selectedStoreId ?? '';

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!resolvedStoreId) {
      // Plan/update split: the index URL is now the PLAN view. A user without
      // a selected store is sent to the CREATE form (same destination the
      // index URL used to render for them).
      navigate('/management/stores/create');
    }
  }, [resolvedStoreId, navigate]);

  async function handleSubmit(values: {
    fullName: string;
    login: string;
    password: string;
    cellPhone: string;
    email: string;
  }) {
    if (!isOnline) return;
    setError('');
    setIsLoading(true);
    try {
      await userHttpService.createUser({
        storeId: resolvedStoreId,
        fullName: values.fullName,
        login: values.login,
        password: values.password,
        cellPhone: values.cellPhone,
        email: values.email,
        roleIds: [ERoles.StoreUser],
      });
      navigate('/management/users');
    } catch (error) {
      setError(intl.formatMessage({ id: httpErrorKey(error, 'USERS.ERROR') }));
    } finally {
      setIsLoading(false);
    }
  }

  if (!resolvedStoreId) {
    return null;
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">
        {intl.formatMessage({ id: 'USERS.CREATE_TITLE' })}
      </h1>
      <UserCreateForm
        storeId={resolvedStoreId}
        isOnline={isOnline}
        isLoading={isLoading}
        onSubmit={handleSubmit}
        error={error}
      />
    </div>
  );
}

export default UserCreatePage;
