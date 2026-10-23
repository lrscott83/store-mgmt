import { Link, useParams } from 'react-router';
import { useIntl } from 'react-intl';
import { superAdminLoader } from '~/auth/routes/loaders';
import { WebCatalogSettingsView } from '~/sales/components/web-catalog-settings-view';

/**
 * Configuración del catálogo web de UNA tienda, para el SuperAdmin.
 *
 * Misma UI que `/sales/web-catalog` (dueño), con la tienda tomada de la RUTA: el SuperAdmin no
 * tiene tienda seleccionada, así que la vista habla con `/v1/stores/{storeId}/catalog/...` y no
 * toca su sesión ni su DEK. Solo SuperAdmin: el loader es el mismo del resto del área admin.
 */
export const clientLoader = superAdminLoader;

export default function AdminStoreWebCatalogPage() {
  const intl = useIntl();
  const { storeId } = useParams<{ storeId: string }>();

  if (!storeId) return null;

  return (
    <div className="space-y-4">
      <Link to="/admin/stores" className="text-sm font-medium text-primary hover:underline">
        {intl.formatMessage({ id: 'STORES.WEB_CATALOG.BACK' })}
      </Link>
      <WebCatalogSettingsView storeId={storeId} />
    </div>
  );
}
