import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useIntl } from 'react-intl';
import { EModules } from '@store-mgmt/domain';
import { ownerModuleLoader } from '~/auth/routes/loaders';
import { Button } from '~/shared/components/ui/button';
import { Card } from '~/shared/components/ui/card';
import { ChevronDownIcon, SaveIcon } from '~/shared/components/ui/icons';
import { InfoBox } from '~/shared/components/ui/info-box';
import { Spinner } from '~/shared/components/ui/spinner';
import { showBlockingError } from '~/shared/lib/blocking-alert';
import { httpErrorKey } from '~/shared/lib/http/http-error';
import { showToastSuccess } from '~/shared/lib/toast';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { CatalogProductEditor } from '../components/catalog-product-editor';
import { buildCatalogSnapshot } from '../lib/catalog/catalog-snapshot';
import { MAX_DESCRIPTION_LENGTH } from '../lib/catalog/web-catalog-format';
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
 * Copia de un registro de pendientes sin las claves indicadas: limpia lo YA aplicado y deja
 * intacto lo que falló, para que el dueño pueda reintentar solo eso.
 */
function omitKeys<T>(record: Record<string, T>, keys: string[]): Record<string, T> {
  if (keys.length === 0) return record;
  const next = { ...record };
  for (const key of keys) delete next[key];
  return next;
}

/** Un cambio pendiente de un producto: solo lo que difiere del producto original. */
interface PendingCatalogChange {
  product: CatalogProductView;
  fields: CatalogProductFields;
  image: File | null;
}

/** Estado pendiente de un producto: el diff se deriva de estos tres registros en cada render. */
function buildPendingChanges(
  products: CatalogProductView[],
  drafts: Record<string, string>,
  pendingImages: Record<string, File>,
  pendingImageRemovals: Record<string, boolean>,
): PendingCatalogChange[] {
  const changes: PendingCatalogChange[] = [];
  for (const product of products) {
    const fields: CatalogProductFields = {};
    const draft = drafts[product.id];
    // Una clave ausente = producto no editado; una clave igual a la original = sin cambio real.
    if (draft !== undefined && draft !== product.description) fields.description = draft;
    if (pendingImageRemovals[product.id] === true) fields.removeImage = true;
    const image = pendingImages[product.id] ?? null;
    // Un producto intacto no genera entrada: no hay PUT para él.
    if (image === null && Object.keys(fields).length === 0) continue;
    changes.push({ product, fields, image });
  }
  return changes;
}

/**
 * Panel colapsable de una categoría: mismos semántica y patrón que el listado de Productos
 * (`products.tsx`) — colapsado por defecto, cuerpo montado solo cuando está expandido y chevron
 * que rota con el estado.
 */
function CategoryPanelCard({
  id,
  name,
  count,
  children,
}: {
  id: string;
  name: string;
  count: number;
  children: ReactNode;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card
      padding="tight"
      title={
        <button
          type="button"
          onClick={() => setIsExpanded((value) => !value)}
          className="flex w-full items-center justify-between gap-2 text-left"
          aria-expanded={isExpanded}
          data-testid={`catalog-category-toggle-${id}`}
        >
          <span>{`${name} (${count})`}</span>
          <ChevronDownIcon isExpanded={isExpanded} className="text-text-muted" />
        </button>
      }
    >
      {isExpanded && <div className="space-y-3">{children}</div>}
    </Card>
  );
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
  /** Descripciones editadas por id de producto. Una clave AUSENTE = producto no editado. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  /** Archivos de imagen seleccionados (validados, NO subidos todavía), por producto. */
  const [pendingImages, setPendingImages] = useState<Record<string, File>>({});
  /** Imagen principal marcada para borrar, por producto. Excluyente con `pendingImages`. */
  const [pendingImageRemovals, setPendingImageRemovals] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);

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
    const grouped = new Map<
      string,
      { name: string; products: CatalogProductView[] }
    >();
    for (const product of products) {
      const group = grouped.get(product.categoryId) ?? { name: product.categoryName, products: [] };
      group.products.push(product);
      grouped.set(product.categoryId, group);
    }
    return [...grouped.entries()].map(([key, group]) => ({ key, ...group }));
  }, [products]);

  /**
   * El diff contra el producto ORIGINAL: solo lo que el dueño editó de verdad entra. Un producto
   * intacto no genera entrada, así que el guardado por lotes envía exactamente los campos
   * modificados — un campo ausente no se toca en el backend (decisión D8).
   */
  const changes = useMemo(
    () => buildPendingChanges(products, drafts, pendingImages, pendingImageRemovals),
    [products, drafts, pendingImages, pendingImageRemovals],
  );

  const hasChanges = changes.length > 0;
  // Una descripción que supera el límite NO se envía (el backend la rechazaría): con UNA sola
  // larga entre varias, el botón entero queda deshabilitado hasta corregirla.
  const hasInvalidDescription = changes.some(
    (change) =>
      change.fields.description !== undefined &&
      change.fields.description.length > MAX_DESCRIPTION_LENGTH,
  );

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

  /**
   * PASO de un producto dentro del guardado por lotes: sube PRIMERO la imagen pendiente (si
   * hay) y después aplica los campos del diff. Devuelve si se aplicó; NO abre ningún modal —
   * el lote reporta el resultado una sola vez al final.
   *
   * Solo hay UNA imagen por producto (decisión del owner, 2026-09-29): la nueva SIEMPRE pasa a
   * ser la principal y la anterior se borra al terminar, con su fila y su archivo. El borrado
   * va DESPUÉS del guardado a propósito: `RemoveProductImageCommand` anula `product.Image`
   * cuando la ruta borrada es la principal, así que borrar primero dejaría el producto sin
   * imagen.
   */
  async function applyProductChange(change: PendingCatalogChange): Promise<boolean> {
    const { product, fields, image } = change;
    // Principal vigente ANTES de subir nada: es la que hay que superseder.
    const previousMain = product.image;
    try {
      let imageKey: string | null = null;
      if (image) {
        const uploaded = await catalogHttpService.uploadImage(product.id, image);
        if (!uploaded.succeeded) return false;
        imageKey = uploaded.data;
      }

      const fieldsToSend: CatalogProductFields = { ...fields };
      if (imageKey) fieldsToSend.image = imageKey;

      // Con solo el borrado marcado como pendiente, `removeImage` ya viaja en el PUT: el paso
      // del borrado de la principal anterior es otro (ver más abajo). Nunca un PUT vacío.
      if (Object.keys(fieldsToSend).length > 0) {
        const result = await catalogHttpService.saveProductFields(product.id, fieldsToSend);
        if (!result.succeeded) return false;
      }

      // La principal ya fue sustituida con éxito: ahora se borra la anterior (fila + archivo).
      if (imageKey && previousMain && previousMain !== imageKey) {
        await catalogHttpService.removeImage(product.id, previousMain);
      }
      return true;
    } catch {
      // La red también falla de verdad aquí (el catálogo vive en el servidor). Este paso NO abre
      // ningún modal a propósito: el producto se queda pendiente y el lote lo nombra UNA vez en
      // su reporte final.
      return false;
    }
  }

  /**
   * Guardado por lotes: aplica SECUENCIALMENTE el diff de todos los productos. Lo que se
   * aplicó se limpia; lo que falló sigue pendiente para poder reintentarlo. El reporte es UNO,
   * al final: éxito completo o lista de lo que no se pudo guardar.
   */
  async function handleSaveChanges() {
    // El diff se recalcula al pulsar (puede haber cambiado desde el último render).
    if (changes.length === 0) return;

    setIsSaving(true);
    const saved: string[] = [];
    const failed: string[] = [];
    try {
      // Secuencial a propósito: son pocas escrituras y así el reporte nombra el orden real.
      for (const change of changes) {
        if (await applyProductChange(change)) {
          saved.push(change.product.id);
        } else {
          failed.push(change.product.name);
        }
      }

      // Solo se limpian los guardados: lo fallado permanece para que el dueño lo reintente.
      setDrafts((current) => omitKeys(current, saved));
      setPendingImages((current) => omitKeys(current, saved));
      setPendingImageRemovals((current) => omitKeys(current, saved));

      // El servidor manda: tras aplicar (o no) se recarga para que la lista diga la verdad.
      await loadData();

      if (failed.length > 0) {
        showBlockingError(
          intl.formatMessage({ id: 'GENERAL.ERROR' }),
          intl.formatMessage(
            { id: 'WEB_CATALOG.SAVE_PARTIAL' },
            { saved: saved.length, total: changes.length, failed: failed.join(', ') },
          ),
        );
        return;
      }
      showToastSuccess(
        intl.formatMessage(
          saved.length === 1 ? { id: 'WEB_CATALOG.SAVED_CHANGES_ONE' } : { id: 'WEB_CATALOG.SAVED_CHANGES' },
          { count: saved.length },
        ),
      );
    } finally {
      setIsSaving(false);
    }
  }

  function handleSaveProduct(product: CatalogProductView, fields: CatalogProductFields, image: File | null) {
    void runProductAction(product.id, async () => {
      const applied = await applyProductChange({ product, fields, image });
      if (!applied) {
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

  function handleDescriptionChange(productId: string, value: string) {
    setDrafts((current) => ({ ...current, [productId]: value }));
  }

  /** Seleccionar un archivo RETIENE la imagen y descarta el borrado marcado: son excluyentes. */
  function handleSelectImage(productId: string, file: File | null) {
    setPendingImageRemovals((current) => omitKeys(current, [productId]));
    setPendingImages((current) => (file ? { ...current, [productId]: file } : omitKeys(current, [productId])));
  }

  /** Marcar/desmarcar el borrado de la principal descarta la imagen retenida: son excluyentes. */
  function handleToggleImageRemoval(productId: string) {
    setPendingImages((current) => omitKeys(current, [productId]));
    setPendingImageRemovals((current) => ({ ...current, [productId]: !current[productId] }));
  }

  /** true cuando ESTE producto tiene algo pendiente: es lo que enciende su badge "Sin guardar". */
  function isProductDirty(productId: string): boolean {
    return changes.some((change) => change.product.id === productId);
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
          <CategoryPanelCard key={group.key} id={group.key} name={group.name} count={group.products.length}>
            {group.products.map((product) => (
              <CatalogProductEditor
                key={product.id}
                product={product}
                storeSlug={status?.storeSlug ?? ''}
                busy={busyProductId === product.id || isSaving}
                description={drafts[product.id] ?? product.description}
                onDescriptionChange={(value) => handleDescriptionChange(product.id, value)}
                pendingImage={pendingImages[product.id] ?? null}
                onSelectImage={(file) => handleSelectImage(product.id, file)}
                pendingImageRemoval={pendingImageRemovals[product.id] === true}
                onToggleImageRemoval={() => handleToggleImageRemoval(product.id)}
                dirty={isProductDirty(product.id)}
                onRemoveImage={(path) => handleRemoveImage(product.id, path)}
                onSetMainImage={(key) => handleSaveProduct(product, { image: key }, null)}
                onReorderImages={(paths) => handleReorderImages(product.id, paths)}
              />
            ))}
          </CategoryPanelCard>
        ))}

      {/* El botón ÚNICO de guardado. Vive FUERA de los paneles de categoría a propósito: los
          paneles nacen plegados y, si el botón viviera dentro de uno, no se alcanzaría sin
          expandir primero. */}
      {!isLoading && !error && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {hasInvalidDescription && (
            <InfoBox variant="danger" className="text-center">
              {intl.formatMessage(
                { id: 'WEB_CATALOG.DESCRIPTION_TOO_LONG' },
                { max: MAX_DESCRIPTION_LENGTH },
              )}
            </InfoBox>
          )}
          <span className="text-xs text-text-muted" data-testid="catalog-pending-summary">
            {hasChanges
              ? intl.formatMessage(
                  changes.length === 1
                    ? { id: 'WEB_CATALOG.PENDING_COUNT_ONE' }
                    : { id: 'WEB_CATALOG.PENDING_COUNT' },
                  { count: changes.length },
                )
              : intl.formatMessage({ id: 'WEB_CATALOG.NO_PENDING' })}
          </span>
          <Button
            variant="fab"
            onClick={() => void handleSaveChanges()}
            disabled={!hasChanges || hasInvalidDescription || isSaving}
            data-testid="catalog-save-all-button"
          >
            <SaveIcon />
            {intl.formatMessage({ id: isSaving ? 'WEB_CATALOG.SAVING' : 'WEB_CATALOG.SAVE_CHANGES' })}
          </Button>
        </div>
      )}
    </div>
  );
}

export default WebCatalogPage;
