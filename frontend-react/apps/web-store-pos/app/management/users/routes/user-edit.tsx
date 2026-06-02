import { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { adminFeatureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useOnlineStatus } from '~/shared/lib/hooks/use-online-status';
import { userHttpService } from '~/management/users/lib/services/user-http-service';
import { UserDetailsForm } from '~/management/users/components/UserDetailsForm';
import { UserCredentialsForm } from '~/management/users/components/UserCredentialsForm';
import type { User } from '@store-mgmt/domain';

export const loader = adminFeatureLoader([EFeatures.Users]);

export function UserEditPage() {
  const intl = useIntl();
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
  const [detailsSuccess, setDetailsSuccess] = useState(false);

  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [credentialsError, setCredentialsError] = useState('');
  const [credentialsSuccess, setCredentialsSuccess] = useState(false);

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
    setDetailsSuccess(false);
    setDetailsLoading(true);
    try {
      await userHttpService.updateUserDetails(userId, values);
      setDetailsSuccess(true);
    } catch {
      setDetailsError(intl.formatMessage({ id: 'USERS.ERROR' }));
    } finally {
      setDetailsLoading(false);
    }
  }

  async function handlePasswordSubmit(values: {
    oldPassword: string;
    newPassword: string;
  }) {
    if (!isOnline) return;
    setCredentialsError('');
    setCredentialsSuccess(false);
    setCredentialsLoading(true);
    try {
      await userHttpService.changePassword(userId, values);
      setCredentialsSuccess(true);
    } catch {
      setCredentialsError(intl.formatMessage({ id: 'USERS.ERROR' }));
    } finally {
      setCredentialsLoading(false);
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
        {detailsSuccess && (
          <p className="text-sm text-green-700">{intl.formatMessage({ id: 'USERS.UPDATE_SUCCESS' })}</p>
        )}
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

      <hr className="border-gray-200" />

      <section className="space-y-4">
        <h2 className="text-base font-medium text-gray-700">
          {intl.formatMessage({ id: 'USERS.CHANGE_PASSWORD' })}
        </h2>
        {credentialsSuccess && (
          <p className="text-sm text-green-700">{intl.formatMessage({ id: 'USERS.PASSWORD_CHANGED' })}</p>
        )}
        <UserCredentialsForm
          isOnline={isOnline}
          isLoading={credentialsLoading}
          onSubmit={handlePasswordSubmit}
          error={credentialsError}
        />
      </section>
    </div>
  );
}

export default UserEditPage;
