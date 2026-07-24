import { useState } from 'react';
import { useIntl } from 'react-intl';
import { superAdminLoader } from '~/auth/routes/loaders';
import { featureHttpService } from '~/admin/features/lib/services/feature-http-service';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { EditIcon } from '~/shared/components/ui/icons';
import { showToastSuccess, showToastError } from '~/shared/lib/toast';

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
        showToastSuccess(
          formatMessage({ id: 'FEATURES.FEATURES_ACTIVATED' }),
          formatMessage({ id: 'GENERAL.RESPONSE.SUCCESS_TITLE' }),
        );
      } else {
        showToastError(
          formatMessage({ id: 'FEATURES.UNEXPECTED_ERROR' }),
          formatMessage({ id: 'GENERAL.RESPONSE.ERROR_TITLE' }),
        );
      }
    } catch {
      showToastError(
        formatMessage({ id: 'FEATURES.UNEXPECTED_ERROR' }),
        formatMessage({ id: 'GENERAL.RESPONSE.ERROR_TITLE' }),
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card padding="tight" title={formatMessage({ id: 'FEATURES.TITLE' })}>
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
