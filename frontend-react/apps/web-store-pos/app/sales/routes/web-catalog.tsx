import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { EModules } from '@store-mgmt/domain';
import { ownerModuleLoader } from '~/auth/routes/loaders';
import { Button } from '~/shared/components/ui/button';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { Spinner } from '~/shared/components/ui/spinner';
import { showBlockingError } from '~/shared/lib/blocking-alert';
import { httpErrorKey } from '~/shared/lib/http/http-error';
import { showToastSuccess } from '~/shared/lib/toast';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { CatalogProductEditor } from '../components/catalog-product-editor';
import { buildCatalogSnapshot } from '../lib/catalog/catalog-snapshot';
import {
  catalogHttpService,
  type CatalogProductFields,
  type CatalogProductView,
  type CatalogStatus,
} from '../lib/services/catalog-http-service';

// El módulo 18 + OwnerAdmin es el gate real (el backend lo vuelve a exigir en cada endpoint):
// un Owner sin el catálogo contratado no entra, igual que en el resto de vistas gateadas.
export const clientLoader = ownerModuleLoader(EModules.WebCatalog);

/**
 * Formatea la marca de la última sincronización. El backend guarda UTC, y según la columna el
 * valor puede llegar sin sufijo de zona: sin él el navegador lo leería como hora local, así que
 * se completa antes de convertir.
 */
function formatSyncedAt(value: string): string {
  const hasZone = /[zZ]$|[+-]\d{2}:\d{2}$/.test(value);
  return new Date(hasZone ? value : `${value}Z`).toLocaleString('es-ES');
}

/**
 * Vista "Catálogo Web" (`/sales/web-catalog`, módulo 18, plan 2026-09-27).
 *
 * Publicar es un acto explícito: aquí se completan los campos que solo existen en el catálogo
 * (descripción en texto plano, descuentos, "Nuevo" e imágenes) y el botón "Sincronizar Catálogo"
 * copia el resultado al catálogo publicado. Todo pasa por HTTP: el catálogo vive en el servidor
 * (no es dato offline) y editar un producto NO lo republica por sí solo.
 *
 * El catálogo publicado sale del catálogo LOCAL de esta tienda: el POS es offline-first, así que
 * sincronizar envía el snapshot del dispositivo (plan §10.1) en vez de esperar que el servidor ya
 * conozca los productos.
 */
export function WebCatalogPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');

  const [status, setStatus] = useState<CatalogStatus | null>(null);
  const [products, setProducts] = useState<CatalogProductView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [statusResult, productsResult] = await Promise.all([
        catalogHttpService.getStatus(),
        catalogHttpService.getProducts(),
      ]);
      if (!statusResult.succeeded || !productsResult.succeeded) {
        setError(intl.formatMessage({ id: 'WEB_CATALOG.SYNC_FAILED' }));
        return;
      }
      setStatus(statusResult.data);
      setProducts(productsResult.data ?? []);
      setError('');
    } catch (err) {
      setError(intl.formatMessage({ id: httpErrorKey(err, 'WEB_CATALOG.SYNC_FAILED') }));
    } finally {
      setIsLoading(false);
    }
  }, [intl]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  /** Productos agrupados por categoría, conservando el orden que ya trae el backend. */
  const groups = useMemo(() => {
    const grouped = new Map<string, { name: string; products: CatalogProductView[] }>();
    for (const product of products) {
      const group = grouped.get(product.categoryId) ?? { name: product.categoryName, products: [] };
      group.products.push(product);
      grouped.set(product.categoryId, group);
    }
    return [...grouped.values()];
  }, [products]);

  async function handleSync() {
    // Sin tienda seleccionada no hay catálogo local que enviar (y el backend respondería
    // "StoreNotSelected"): se avisa sin tocar la red.
    if (!storeId) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        intl.formatMessage({ id: 'WEB_CATALOG.SYNC_FAILED' }),
      );
      return;
    }

    setIsSyncing(true);
    try {
      const result = await catalogHttpService.sync(buildCatalogSnapshot(storeId));
      if (!result.succeeded) {
        showBlockingError(
          intl.formatMessage({ id: 'GENERAL.ERROR' }),
          intl.formatMessage({ id: 'WEB_CATALOG.SYNC_FAILED' }),
        );
        return;
      }
      const summary = result.data;
      showToastSuccess(
        intl.formatMessage(
          { id: 'WEB_CATALOG.SYNC_DONE' },
          {
            categoriesCreated: summary.categoriesCreated,
            categoriesUpdated: summary.categoriesUpdated,
            productsCreated: summary.productsCreated,
            productsUpdated: summary.productsUpdated,
            productsDeactivated: summary.productsDeactivated,
          },
        ),
      );
      await loadData();
    } catch (err) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        intl.formatMessage({ id: httpErrorKey(err, 'WEB_CATALOG.SYNC_FAILED') }),
      );
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleCopyUrl() {
    if (!status?.catalogUrl) return;
    const fullUrl = new URL(status.catalogUrl, window.location.origin).toString();
    try {
      await navigator.clipboard?.writeText(fullUrl);
      showToastSuccess(intl.formatMessage({ id: 'WEB_CATALOG.COPIED' }));
    } catch {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        intl.formatMessage({ id: 'WEB_CATALOG.SYNC_FAILED' }),
      );
    }
  }

  /**
   * Envuelve una operación de un producto: marca ESE producto como ocupado (los demás siguen
   * usables) y unifica el reporte de errores del módulo, que vive en el servidor y por tanto
   * falla de verdad cuando no hay conexión.
   */
  async function runProductAction(productId: string, action: () => Promise<void>) {
    setBusyProductId(productId);
    try {
      await action();
    } catch (err) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        intl.formatMessage({ id: httpErrorKey(err, 'WEB_CATALOG.SAVE_ERROR') }),
      );
    } finally {
      setBusyProductId(null);
    }
  }

  function handleSaveFields(productId: string, fields: CatalogProductFields) {
    void runProductAction(productId, async () => {
      const result = await catalogHttpService.saveProductFields(productId, fields);
      if (!result.succeeded) {
        showBlockingError(
          intl.formatMessage({ id: 'GENERAL.ERROR' }),
          intl.formatMessage({ id: 'WEB_CATALOG.SAVE_ERROR' }),
        );
        return;
      }
      showToastSuccess(intl.formatMessage({ id: 'WEB_CATALOG.SAVED' }));
      await loadData();
    });
  }

  function handleUploadImage(product: CatalogProductView, file: File) {
    void runProductAction(product.id, async () => {
      const uploaded = await catalogHttpService.uploadImage(product.id, file);
      if (!uploaded.succeeded) {
        showBlockingError(
          intl.formatMessage({ id: 'GENERAL.ERROR' }),
          intl.formatMessage({ id: 'WEB_CATALOG.UPLOAD_ERROR' }),
        );
        return;
      }
      // La primera imagen de un producto sin principal pasa a serlo: es lo que el Owner espera al
      // subirla desde el bloque "Imagen principal".
      if (!product.image) {
        await catalogHttpService.saveProductFields(product.id, { image: uploaded.data });
      }
      await loadData();
    });
  }

  function handleRemoveImage(productId: string, path: string) {
    void runProductAction(productId, async () => {
      await catalogHttpService.removeImage(productId, path);
      await loadData();
    });
  }

  function handleReorderImages(productId: string, paths: string[]) {
    void runProductAction(productId, async () => {
      await catalogHttpService.reorderImages(productId, paths);
      await loadData();
    });
  }

  const publicUrl = status?.catalogUrl
    ? new URL(status.catalogUrl, window.location.origin).toString()
    : '';

  return (
    <div className="space-y-4">
      <Card
        padding="tight"
        title={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{intl.formatMessage({ id: 'WEB_CATALOG.TITLE' })}</span>
            <Button
              variant="fab"
              onClick={handleSync}
              disabled={isSyncing}
              data-testid="catalog-sync-button"
            >
              {intl.formatMessage({ id: isSyncing ? 'WEB_CATALOG.SYNCING' : 'WEB_CATALOG.SYNC' })}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text-muted">{intl.formatMessage({ id: 'WEB_CATALOG.SUBTITLE' })}</p>

        <div className="mt-3 rounded-md border border-border p-3">
          {status?.storeSlug ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-text-muted">
                {intl.formatMessage({ id: 'WEB_CATALOG.PUBLIC_URL' })}
              </span>
              {/* URL ABSOLUTA: `/catalog/<slug>` es una ruta del SPA, y un href relativo desde
                  `/sales/web-catalog` resolvería a `/sales/catalog/<slug>` (404). */}
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="break-all text-sm text-primary underline"
                data-testid="catalog-public-url"
              >
                {publicUrl}
              </a>
              <Button variant="outline" onClick={handleCopyUrl} data-testid="catalog-copy-button">
                {intl.formatMessage({ id: 'WEB_CATALOG.COPY_URL' })}
              </Button>
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-primary hover:underline"
                data-testid="catalog-open-link"
              >
                {intl.formatMessage({ id: 'WEB_CATALOG.OPEN' })}
              </a>
            </div>
          ) : (
            <InfoBox variant="info">
              {intl.formatMessage({ id: 'WEB_CATALOG.NOT_PUBLISHED' })}
            </InfoBox>
          )}

          <p className="mt-2 text-xs text-text-muted" data-testid="catalog-last-sync">
            {intl.formatMessage({ id: 'WEB_CATALOG.LAST_SYNC' })}:{' '}
            {status?.catalogSyncedAt
              ? formatSyncedAt(status.catalogSyncedAt)
              : intl.formatMessage({ id: 'WEB_CATALOG.NEVER_SYNCED' })}
          </p>

          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { id: 'WEB_CATALOG.STATS_CATEGORIES', value: status?.sourceCategoriesCount ?? 0 },
              { id: 'WEB_CATALOG.STATS_PRODUCTS', value: status?.sourceProductsCount ?? 0 },
              { id: 'WEB_CATALOG.STATS_PUBLISHED', value: status?.publishedProductsCount ?? 0 },
              { id: 'WEB_CATALOG.STATS_WITHOUT_IMAGE', value: status?.productsWithoutMainImageCount ?? 0 },
            ].map((stat) => (
              <div key={stat.id} className="rounded-md bg-surface-hover px-3 py-2">
                <dt className="text-xs text-text-muted">{intl.formatMessage({ id: stat.id })}</dt>
                <dd className="text-lg font-medium text-text">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Card>

      {isLoading && <Spinner label={intl.formatMessage({ id: 'GENERAL.LOADING' })} />}

      {!isLoading && error && (
        <InfoBox variant="danger" className="text-center">
          {error}
        </InfoBox>
      )}

      {!isLoading && !error && products.length === 0 && (
        <InfoBox variant="info" className="text-center">
          {intl.formatMessage({ id: 'WEB_CATALOG.NO_PRODUCTS' })}
        </InfoBox>
      )}

      {!isLoading &&
        groups.map((group) => (
          <Card key={group.name} padding="tight" title={`${group.name} (${group.products.length})`}>
            <div className="space-y-3">
              {group.products.map((product) => (
                <CatalogProductEditor
                  key={product.id}
                  product={product}
                  storeSlug={status?.storeSlug ?? ''}
                  busy={busyProductId === product.id}
                  onSave={(fields) => handleSaveFields(product.id, fields)}
                  onUploadImage={(file) => handleUploadImage(product, file)}
                  onRemoveImage={(path) => handleRemoveImage(product.id, path)}
                  onSetMainImage={(key) => handleSaveFields(product.id, { image: key })}
                  onReorderImages={(paths) => handleReorderImages(product.id, paths)}
                />
              ))}
            </div>
          </Card>
        ))}
    </div>
  );
}

export default WebCatalogPage;
