import { useState } from 'react';
import { useIntl } from 'react-intl';
import { superAdminLoader } from '~/auth/routes/loaders';
import { featureHttpService } from '~/admin/features/lib/services/feature-http-service';

export const loader = superAdminLoader;

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
    <div>
      <h1>{formatMessage({ id: 'FEATURES.TITLE' })}</h1>
      <button type="button" onClick={handleActivate} disabled={isLoading}>
        {formatMessage({ id: 'FEATURES.ACTIVATE_FEATURES' })}
      </button>
      {successMessage && <p>{successMessage}</p>}
      {errorMessage && <p>{errorMessage}</p>}
    </div>
  );
}

export default FeaturesPage;
