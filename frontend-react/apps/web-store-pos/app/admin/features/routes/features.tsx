import { useState } from 'react';
import { useIntl } from 'react-intl';
import { superAdminLoader } from '~/auth/routes/loaders';
import { featureHttpService } from '~/admin/features/lib/services/feature-http-service';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { EditIcon } from '~/shared/components/ui/icons';
import { showBlockingSuccess, showBlockingError } from '~/shared/lib/blocking-alert';

export const clientLoader = superAdminLoader;

export function FeaturesPage() {
  const { formatMessage } = useIntl();
  const [isLoading, setIsLoading] = useState(false);

  async function handleActivate() {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const result = await featureHttpService.activateFeatures();
      if (result.succeeded) {
        await showBlockingSuccess(formatMessage({ id: 'FEATURES.FEATURES_ACTIVATED' }));
      } else {
        showBlockingError(
          formatMessage({ id: 'GENERAL.RESPONSE.ERROR_TITLE' }),
          formatMessage({ id: 'FEATURES.UNEXPECTED_ERROR' })
        );
      }
    } catch {
      showBlockingError(
        formatMessage({ id: 'GENERAL.RESPONSE.ERROR_TITLE' }),
        formatMessage({ id: 'FEATURES.UNEXPECTED_ERROR' })
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card title={formatMessage({ id: 'FEATURES.TITLE' })}>
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button variant="fab" onClick={handleActivate} disabled={isLoading}>
            <EditIcon />
            {formatMessage({ id: 'FEATURES.ACTIVATE_FEATURES' })}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default FeaturesPage;
