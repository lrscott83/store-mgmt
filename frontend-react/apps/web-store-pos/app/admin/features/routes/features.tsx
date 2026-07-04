import { useState } from 'react';
import { useIntl } from 'react-intl';
import { superAdminLoader } from '~/auth/routes/loaders';
import { featureHttpService } from '~/admin/features/lib/services/feature-http-service';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { SettingsIcon } from '~/shared/components/ui/icons';

export const clientLoader = superAdminLoader;

export function FeaturesPage() {
  const { formatMessage } = useIntl();
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleActivate() {
    if (isLoading) return;
    setIsLoading(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const result = await featureHttpService.activateFeatures();
      if (result.succeeded) {
        setSuccessMessage(formatMessage({ id: 'FEATURES.FEATURES_ACTIVATED' }));
      } else {
        setErrorMessage(formatMessage({ id: 'FEATURES.UNEXPECTED_ERROR' }));
      }
    } catch {
      setErrorMessage(formatMessage({ id: 'FEATURES.UNEXPECTED_ERROR' }));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card title={formatMessage({ id: 'FEATURES.TITLE' })}>
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button variant="fab" onClick={handleActivate} disabled={isLoading}>
            <SettingsIcon />
            {formatMessage({ id: 'FEATURES.ACTIVATE_FEATURES' })}
          </Button>
        </div>
        {successMessage && <p className="text-sm text-success">{successMessage}</p>}
        {errorMessage && <p className="text-sm text-danger">{errorMessage}</p>}
      </div>
    </Card>
  );
}

export default FeaturesPage;
