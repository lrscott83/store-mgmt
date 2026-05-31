import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useOnlineStatus } from '~/shared/lib/hooks/use-online-status';
import { profileHttpService } from '~/profile/lib/services/profile-http-service';
import { ChangePasswordForm } from '~/profile/components/change-password-form';

export const loader = featureLoader(
  [EFeatures.Profile],
  useAuthStore.getState().user?.selectedStoreId
);

export function ChangePasswordPage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const isOnline = useOnlineStatus();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(payload: { oldPassword: string; newPassword: string }) {
    if (!user) return;
    setError('');
    setIsLoading(true);

    try {
      await profileHttpService.changePassword(user.id, payload);
      logout();
      navigate('/login');
    } catch {
      setError(intl.formatMessage({ id: 'PROFILE.UPDATE_ERROR' }));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <ChangePasswordForm
        isOnline={isOnline}
        isLoading={isLoading}
        onSubmit={handleSubmit}
        error={error}
      />
    </div>
  );
}

export default ChangePasswordPage;
