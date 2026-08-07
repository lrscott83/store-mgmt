import { useState } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { isOwnerAdmin, isReSeller } from '~/shared/lib/auth/authorization-service';
import { useOnlineStatus } from '~/shared/lib/hooks/use-online-status';
import { profileHttpService } from '~/profile/lib/services/profile-http-service';
import { EditProfileForm } from '~/profile/components/edit-profile-form';

export const clientLoader = featureLoader([EFeatures.Profile]);

export function EditProfilePage() {
  const intl = useIntl();
  const { user, updateUser } = useAuthStore();
  const isOnline = useOnlineStatus();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const initialValues = {
    fullName: user?.fullName ?? '',
    cellPhone: user?.cellPhone ?? '',
    email: user?.email ?? '',
  };

  // ADR-6 (design.md): phone stays required for owner/reseller; everyone else can
  // save with it empty. A null user (no session) never reaches submit — handleSubmit
  // returns early below — so `false` here enables nothing unsafe.
  const phoneRequired = user ? isOwnerAdmin(user) || isReSeller(user) : false;

  async function handleSubmit(values: {
    fullName: string;
    cellPhone: string;
    email: string;
  }) {
    if (!user) return;
    setError('');
    setSuccessMessage('');
    setIsLoading(true);

    try {
      const response = await profileHttpService.updateProfile(user.id, {
        fullName: values.fullName,
        cellPhone: values.cellPhone,
        email: values.email,
        isActive: user.isActive,
      });

      const updatedUser = {
        ...user,
        ...response.data,
        fullName: values.fullName,
        cellPhone: values.cellPhone,
        email: values.email,
        password: '',
      };

      updateUser(updatedUser);
      setSuccessMessage(intl.formatMessage({ id: 'PROFILE.UPDATE_SUCCESS' }));
    } catch {
      setError(intl.formatMessage({ id: 'PROFILE.UPDATE_ERROR' }));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <EditProfileForm
        initialValues={initialValues}
        isOnline={isOnline}
        isLoading={isLoading}
        onSubmit={handleSubmit}
        error={error}
        successMessage={successMessage}
        phoneRequired={phoneRequired}
      />
    </div>
  );
}

export default EditProfilePage;
