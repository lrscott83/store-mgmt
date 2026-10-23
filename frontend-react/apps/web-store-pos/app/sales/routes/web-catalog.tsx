import { EModules } from '@store-mgmt/domain';
import { ownerModuleLoader } from '~/auth/routes/loaders';
import { WebCatalogSettingsView } from '../components/web-catalog-settings-view';

// El módulo 18 + OwnerAdmin es el gate real (el backend lo vuelve a exigir en cada endpoint):
// un Owner sin el catálogo contratado no entra, igual que en el resto de vistas gateadas.
export const clientLoader = ownerModuleLoader(EModules.WebCatalog);

/**
 * Catálogo Web del DUEÑO: la tienda es la seleccionada en la sesión y los endpoints son los del
 * claim (`/v1/catalog/...`). La UI vive en `WebCatalogSettingsView`, compartida con la vista
 * store-scoped del SuperAdmin (`/admin/stores/:storeId/web-catalog`).
 */
export function WebCatalogPage() {
  return <WebCatalogSettingsView />;
}

export default WebCatalogPage;
