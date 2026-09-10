import { EFeatures } from '@store-mgmt/domain';
import { adminFeatureLoader } from '~/auth/routes/loaders';
import { EditStorePage } from './edit-store';

export const clientLoader = adminFeatureLoader([EFeatures.Stores]);

/**
 * Update view (management stores) — store DATA only. Thin wrapper over the
 * shared create/edit page with `allowCreate={false}`: with no selected store it
 * shows STORES.NO_STORE_SELECTED (never the create form), and after a save it
 * stays on the page. The plan has its own dedicated view
 * (`/management/stores`), and creation stays at `/management/stores/create`.
 */
export function UpdateStorePage() {
  return <EditStorePage allowCreate={false} />;
}

export default UpdateStorePage;
