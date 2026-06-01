import { EFeatures } from '@store-mgmt/domain';
import { adminFeatureLoader } from '~/auth/routes/loaders';

export const loader = adminFeatureLoader([EFeatures.Configurations]);

export function ConfigurationsPage() {
  return <p>configurations works!</p>;
}

export default ConfigurationsPage;
