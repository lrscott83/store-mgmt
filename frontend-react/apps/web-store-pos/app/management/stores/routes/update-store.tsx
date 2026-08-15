import { EFeatures } from '@store-mgmt/domain';
import { adminFeatureLoader } from '~/auth/routes/loaders';
import { EditStorePage } from './edit-store';

export const clientLoader = adminFeatureLoader([EFeatures.Stores]);

/**
 * Update view (management stores) — store DATA only. Thin wrapper over the
 * shared create/edit page with `includePlan={false}`: no PlanPicker, no module
 * catalog fetch, and the save omits `moduleIds` so the backend leaves the
 * store's plan untouched. The plan has its own dedicated view
 * (`/management/stores`), and creation stays at `/management/stores/create`.
 */
export function UpdateStorePage() {
  return <EditStorePage includePlan={false} />;
}

export default UpdateStorePage;
