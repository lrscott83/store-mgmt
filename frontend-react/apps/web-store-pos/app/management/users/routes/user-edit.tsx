import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { adminFeatureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useOnlineStatus } from '~/shared/lib/hooks/use-online-status';
import { userHttpService } from '~/management/users/lib/services/user-http-service';
import { UserDetailsForm } from '~/management/users/components/UserDetailsForm';
import type { User } from '@store-mgmt/domain';

export const clientLoader = adminFeatureLoader([EFeatures.Users]);

export function UserEditPage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { id: paramId } = useParams<{ id: string }>();
  const isOnline = useOnlineStatus();
  const { user } = useAuthStore();

  const userId = paramId ?? '';
  const isSuperAdmin = user?.isSuperAdmin ?? false;
  const isOwnerAdmin = user?.isOwnerAdmin ?? false;
  const canToggleActive = isSuperAdmin || isOwnerAdmin;

  const [storeUser, setStoreUser] = useState<User | undefined>(undefined);
  const [loadError, setLoadError] = useState('');

  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');

  useEffect(() => {
    if (!userId) return;
    userHttpService
      .getUser(userId)
      .then((res) => {
        setStoreUser(res.data);
        setLoadError('');
      })
      .catch(() => {
        setLoadError(intl.formatMessage({ id: 'USERS.ERROR' }));
      });
  }, [userId, intl]);

  async function handleDetailsSubmit(values: {
    fullName: string;
    cellPhone: string;
    email: string;
    isActive: boolean;
  }) {
    if (!isOnline) return;
    setDetailsError('');
    setDetailsLoading(true);
    try {
      await userHttpService.updateUserDetails(userId, values);
      navigate('/management/users');
    } catch {
      setDetailsError(intl.formatMessage({ id: 'USERS.ERROR' }));
    } finally {
      setDetailsLoading(false);
    }
  }

  if (loadError) {
    return (
      <div className="space-y-4 p-4">
        <p role="alert" className="text-sm text-red-600">{loadError}</p>
      </div>
    );
  }

  // DU9: Gate form mount on async user data — useState initializers run once,
  // so we must not mount the form until storeUser is resolved.
  if (!storeUser) {
    return (
      <div className="space-y-4 p-4">
        <p className="text-sm text-gray-500">{intl.formatMessage({ id: 'GENERAL.LOADING' })}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-xl font-semibold">
        {intl.formatMessage({ id: 'USERS.EDIT_TITLE' })}
      </h1>

      <section className="space-y-4">
        <h2 className="text-base font-medium text-gray-700">
          {intl.formatMessage({ id: 'USERS.UPDATE' })}
        </h2>
        <UserDetailsForm
          initialValues={{
            fullName: storeUser.fullName,
            cellPhone: storeUser.cellPhone,
            email: storeUser.email,
            isActive: storeUser.isActive,
          }}
          isOnline={isOnline}
          isLoading={detailsLoading}
          canToggleActive={canToggleActive}
          onSubmit={handleDetailsSubmit}
          error={detailsError}
        />
      </section>
    </div>
  );
}

export default UserEditPage;
