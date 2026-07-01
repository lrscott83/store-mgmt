import { EFeatures } from '@store-mgmt/domain';
import { adminFeatureLoader } from '~/auth/routes/loaders';

export const clientLoader = adminFeatureLoader([EFeatures.Configurations]);

export function ConfigurationsPage() {
  return <p>configurations works!</p>;
}

export default ConfigurationsPage;
