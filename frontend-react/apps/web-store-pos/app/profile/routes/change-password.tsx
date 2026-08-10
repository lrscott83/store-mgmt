import { useState } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useOnlineStatus } from '~/shared/lib/hooks/use-online-status';
import { profileHttpService } from '~/profile/lib/services/profile-http-service';
import { ChangePasswordForm } from '~/profile/components/change-password-form';

export const clientLoader = featureLoader([EFeatures.Profile]);

export function ChangePasswordPage() {
  const intl = useIntl();
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
      // device-wrapped-dek design §5/§10 (WU10, Q2 mandatory — not
      // conditional): resynchronize THIS device's password wrap under the
      // NEW password before logout() clears the in-memory DEK
      // (auth-store.ts's logout() calls clearDek()) — this is the seam's
      // last chance to read it. Dynamic import, same D6 rationale as
      // auth-store.ts's own imports of this module. Best-effort, matching
      // entity-migration.ts:15-18's swallow doctrine: a failed rewrap must
      // never block the mandatory logout that follows a password change.
      try {
        const { rewrapDeviceDekForPassword } = await import('~/shared/lib/offline/dek-provisioning');
        await rewrapDeviceDekForPassword(user.login, payload.newPassword);
      } catch {
        // intentionally swallowed — see comment above.
      }
      // Decision 2 (auth-service-parity, Slice 3): logout() now owns the
      // conditional redirect itself (Angular parity) — no manual navigate here.
      logout();
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
