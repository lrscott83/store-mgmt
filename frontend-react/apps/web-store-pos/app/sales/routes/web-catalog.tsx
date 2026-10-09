import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useIntl } from 'react-intl';
import { EModules } from '@store-mgmt/domain';
import { ownerModuleLoader } from '~/auth/routes/loaders';
import { Button } from '~/shared/components/ui/button';
import { Card } from '~/shared/components/ui/card';
import { FileInput } from '~/shared/components/ui/file-input';
import { ChevronDownIcon, PaperclipIcon, SaveIcon, TrashIcon } from '~/shared/components/ui/icons';
import { InfoBox } from '~/shared/components/ui/info-box';
import { Spinner } from '~/shared/components/ui/spinner';
import { showBlockingError } from '~/shared/lib/blocking-alert';
import { httpErrorKey } from '~/shared/lib/http/http-error';
import { apiFileUrl } from '~/shared/lib/http/media-url';
import { showToastSuccess } from '~/shared/lib/toast';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { CATALOG_TEMPLATES, DEFAULT_TEMPLATE_ID } from '~/catalog/templates/template-ids';
import { CatalogProductEditor } from '../components/catalog-product-editor';
import { buildCatalogSnapshot } from '../lib/catalog/catalog-snapshot';
import { MAX_CATALOG_IMAGE_BYTES, MAX_DESCRIPTION_LENGTH } from '../lib/catalog/web-catalog-format';
import {
  catalogHttpService,
  CatalogShowcaseKind,
  type CatalogBranding,
  type CatalogBrandingUpdate,
  type CatalogProductFields,
  type CatalogProductView,
  type CatalogShowcaseImage,
  type CatalogShowcaseImages,
  type CatalogStatus,
} from '../lib/services/catalog-http-service';

// El módulo 18 + OwnerAdmin es el gate real (el backend lo vuelve a exigir en cada endpoint):
// un Owner sin el catálogo contratado no entra, igual que en el resto de vistas gateadas.
export const clientLoader = ownerModuleLoader(EModules.WebCatalog);

/** Formatos de imagen que acepta el backend para el catálogo (marca, showcase y producto). */
const ALLOWED_CATALOG_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Imágenes máximas POR CONJUNTO del showcase (espejo de
 * `Domain/Entities/StoreCatalogImages/StoreCatalogImage.MaxImagesPerKind`). Los conjuntos no
 * comparten cupo: son dos listas independientes (decisión C1).
 */
const MAX_SHOWCASE_IMAGES = 10;

/**
 * true si el archivo cumple las reglas locales de imagen del catálogo: los MISMOS formatos y el
 * MISMO tamaño que valida el backend (`CatalogImageUploadRules`), para no subir en balde.
 */
function isValidCatalogImage(file: File): boolean {
  return ALLOWED_CATALOG_IMAGE_TYPES.includes(file.type) && file.size <= MAX_CATALOG_IMAGE_BYTES;
}

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
 * Un lado de la marca: previsualiza lo guardado, deja elegir un archivo nuevo y marca el borrado.
 * No guarda NADA por su cuenta — el botón de la tarjeta "Marca" aplica el conjunto, igual que hace
 * el guardado por lotes con los productos.
 *
 * El archivo nuevo NO se previsualiza: el preview es el de la clave guardada, porque el
 * endpoint público solo sirve claves ya persistidas y no hay URL que pintar antes de guardar.
 *
 * Queda UN solo lado, el logo: el del BANNER se retiró de la carta pública el 2026-10-08 por
 * decisión del owner, así que el dueño ya no tiene dónde subirlo. El dato (`bannerKey`) y su
 * endpoint siguen en el backend sin tocar —decisión D10—; lo que se retiró es el control.
 */
function BrandSlot({
  labelId,
  removeLabelId,
  pendingRemoveLabelId,
  slotTestId,
  testId,
  uploadTestId,
  removeTestId,
  pendingTestId,
  pendingRemoveTestId,
  storeSlug,
  mediaKey,
  pendingFile,
  markedForRemoval,
  busy,
  previewClass,
  onSelectFile,
  onToggleRemove,
}: {
  labelId: string;
  removeLabelId: string;
  pendingRemoveLabelId: string;
  slotTestId: string;
  testId: string;
  uploadTestId: string;
  removeTestId: string;
  pendingTestId: string;
  pendingRemoveTestId: string;
  storeSlug: string;
  /** Clave persistida de este lado (null = la tienda no lo tiene). */
  mediaKey: string | null;
  /** Archivo retenido (ya validado, todavía sin subir). */
  pendingFile: File | null;
  /** true cuando el dueño marcó este lado para borrar: se aplica al guardar. */
  markedForRemoval: boolean;
  busy: boolean;
  previewClass: string;
  onSelectFile: (file: File | null) => void;
  onToggleRemove: () => void;
}) {
  const intl = useIntl();

  return (
    <div data-testid={slotTestId}>
      <span className="text-xs font-medium text-text-muted">
        {intl.formatMessage({ id: labelId })}
      </span>
      <div className="mt-2 flex flex-wrap items-start gap-3">
        {mediaKey && (
          <figure className="flex flex-col items-center gap-1">
            <img
              src={apiFileUrl(`/api/v1/public/catalog/${storeSlug}/media/${mediaKey}`)}
              alt={intl.formatMessage({ id: labelId })}
              className={`w-16 rounded-md border border-border ${previewClass}`}
              data-testid={testId}
            />
            {/* Quitar NO borra nada aquí: marca la eliminación y la aplica el botón de marca. */}
            <button
              type="button"
              onClick={onToggleRemove}
              disabled={busy}
              className="inline-flex items-center gap-1 text-xs text-danger hover:underline disabled:opacity-50"
              data-testid={removeTestId}
            >
              <TrashIcon className="h-3 w-3" />
              {intl.formatMessage({ id: removeLabelId })}
            </button>
          </figure>
        )}
        <div className="min-w-56 flex-1">
          <FileInput
            onFileChange={onSelectFile}
            accept=".jpg,.jpeg,.png,.webp"
            disabled={busy}
            data-testid={uploadTestId}
          />
          {pendingFile && (
            <p className="mt-1 text-xs text-primary" data-testid={pendingTestId}>
              {pendingFile.name}
              {` · ${intl.formatMessage({ id: 'WEB_CATALOG.BRAND_PENDING_UPLOAD' })}`}
            </p>
          )}
          {mediaKey && markedForRemoval && (
            <p className="mt-1 text-xs text-danger" data-testid={pendingRemoveTestId}>
              {intl.formatMessage({ id: pendingRemoveLabelId })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Textos y `data-testid` de UN conjunto del showcase: los dos bloques se pintan igual. */
interface ShowcaseSetUi {
  readonly titleId: string;
  readonly subtitleId: string;
  readonly uploadTestId: string;
  readonly saveTestId: string;
  readonly pendingTestId: string;
  readonly errorTestId: string;
  readonly captionTestId: string;
  readonly listTestId: string;
}

const SHOWCASE_SET_UI: Record<CatalogShowcaseKind, ShowcaseSetUi> = {
  [CatalogShowcaseKind.Carousel]: {
    titleId: 'WEB_CATALOG.SHOWCASE_CAROUSEL_TITLE',
    subtitleId: 'WEB_CATALOG.SHOWCASE_CAROUSEL_SUBTITLE',
    uploadTestId: 'showcase-carousel-upload',
    saveTestId: 'showcase-carousel-save',
    pendingTestId: 'showcase-carousel-pending',
    errorTestId: 'showcase-carousel-error',
    captionTestId: 'showcase-carousel-caption',
    listTestId: 'showcase-carousel-images',
  },
  [CatalogShowcaseKind.Daily]: {
    titleId: 'WEB_CATALOG.SHOWCASE_DAILY_TITLE',
    subtitleId: 'WEB_CATALOG.SHOWCASE_DAILY_SUBTITLE',
    uploadTestId: 'showcase-daily-upload',
    saveTestId: 'showcase-daily-save',
    pendingTestId: 'showcase-daily-pending',
    errorTestId: 'showcase-daily-error',
    captionTestId: 'showcase-daily-caption',
    listTestId: 'showcase-daily-images',
  },
};

/** Mismas clases que el editor de producto usa para sus campos de texto. */
const SHOWCASE_INPUT_CLASSES =
  'rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary';

/**
 * UN conjunto del showcase: el carrusel o las imágenes del día (decisión C1: son independientes y
 * pueden estar los dos, solo uno o ninguno).
 *
 * Sube VARIAS imágenes de una vez, las previsualiza por el endpoint público de media, las mueve de
 * orden y las quita. Cada acción es una petición propia del módulo de catálogo —subir es un POST
 * por imagen, ordenar un PUT con el orden final completo, quitar un DELETE— así que la tarjeta
 * guarda NADA por su cuenta: avisa del resultado y quien la pinta recarga la lista desde el
 * servidor, que es el dueño del orden real.
 *
 * El input nativo va oculto detrás de su propio botón —como en `FileInput`— porque `multiple` no
 * cabe en el componente compartido y ampliarlo llevaría el cambio a todos los que lo usan.
 */
function ShowcaseCard({
  kind,
  images,
  storeSlug,
  busy,
  error,
  onUpload,
  onRemove,
  onMove,
}: {
  kind: CatalogShowcaseKind;
  /** Imágenes YA guardadas de este conjunto, en el orden que dice el servidor. */
  images: CatalogShowcaseImage[];
  /** Slug público de la tienda: solo con él se previsualizan las imágenes publicadas. */
  storeSlug: string;
  /** true mientras hay una operación de ESTE conjunto en vuelo (subir, mover o quitar). */
  busy: boolean;
  /** Error del servidor para ESTE conjunto (null = nada que reportar). */
  error: string;
  /** Sube las imágenes y devuelve CUÁNTAS aceptó el servidor. */
  onUpload: (kind: CatalogShowcaseKind, files: File[], caption: string) => Promise<number>;
  onRemove: (kind: CatalogShowcaseKind, imageId: string) => void;
  /** Reordena ESTE conjunto: `orderedIds` es su orden final completo. */
  onMove: (kind: CatalogShowcaseKind, orderedIds: string[]) => void;
}) {
  const intl = useIntl();
  const ui = SHOWCASE_SET_UI[kind];
  const inputRef = useRef<HTMLInputElement>(null);
  /** Archivos elegidos y validados, todavía SIN subir. */
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState('');
  const [fileError, setFileError] = useState('');

  /** Cupo que queda en ESTE conjunto: el tope es por conjunto, no compartido. */
  const room = MAX_SHOWCASE_IMAGES - images.length;

  /**
   * Se retienen los archivos elegidos tras validar TODOS: si uno no cumple las reglas se rechaza
   * la selección entera, porque subir "las que valen" dejaría al dueño sin saber cuál se quedó
   * fuera. El pie de foto no se manda aquí —viaja en el POST— así que se conserva para la subida.
   */
  function handleSelectFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const fileList = event.target.files;
    if (!fileList) return;
    const selected = Array.from(fileList);
    if (selected.length === 0) return;
    if (!selected.every(isValidCatalogImage)) {
      setFileError(
        intl.formatMessage(
          { id: 'WEB_CATALOG.IMAGE_RULES' },
          { size: MAX_CATALOG_IMAGE_BYTES / (1024 * 1024) },
        ),
      );
      return;
    }
    setFileError('');
    setPendingFiles(selected.slice(0, Math.max(room, 0)));
  }

  async function handleUpload() {
    if (pendingFiles.length === 0) return;
    const uploaded = await onUpload(kind, pendingFiles, caption.trim());
    // Solo se suelta lo que el servidor aceptó: lo que se quedó colgado se reintenta sin volver a
    // elegir los archivos, y lo que ya está guardado no se vuelve a subir (sería un duplicado).
    if (uploaded > 0) {
      setPendingFiles((current) => current.slice(uploaded));
      setCaption('');
    }
  }

  /**
   * Mover una imagen envía el orden FINAL COMPLETO de este conjunto, no un desplazamiento: el
   * backend reescribe el índice de todas y rechaza (400) una lista incompleta o con repetidos.
   */
  function handleMove(index: number, direction: -1 | 1) {
    const ordered = images.map((image) => image.id);
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    onMove(kind, ordered);
  }

  return (
    <Card
      padding="tight"
      title={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{intl.formatMessage({ id: ui.titleId })}</span>
          <Button
            variant="fab"
            onClick={() => void handleUpload()}
            disabled={pendingFiles.length === 0 || busy || room <= 0}
            data-testid={ui.saveTestId}
          >
            {intl.formatMessage({ id: 'WEB_CATALOG.SHOWCASE_UPLOAD' })}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-text-muted">{intl.formatMessage({ id: ui.subtitleId })}</p>

      {error && (
        <InfoBox variant="danger" className="mt-2">
          <span data-testid={ui.errorTestId}>{error}</span>
        </InfoBox>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy || room <= 0}
          className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PaperclipIcon />
          {intl.formatMessage({ id: 'WEB_CATALOG.SHOWCASE_SELECT_FILES' })}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp"
          disabled={busy || room <= 0}
          onChange={handleSelectFiles}
          className="hidden"
          data-testid={ui.uploadTestId}
        />
        <span className="text-xs text-text-muted">
          {intl.formatMessage({ id: 'WEB_CATALOG.SHOWCASE_LIMIT' }, { max: MAX_SHOWCASE_IMAGES })}
        </span>
      </div>

      {/* Selección retenida: se anuncia y SOLO sube al pulsar "Subir imágenes". */}
      {pendingFiles.length > 0 && (
        <p className="mt-1 text-xs text-primary" data-testid={ui.pendingTestId}>
          {intl.formatMessage(
            { id: 'WEB_CATALOG.SHOWCASE_PENDING_COUNT' },
            { count: pendingFiles.length },
          )}
        </p>
      )}
      {fileError && <p className="mt-1 text-xs text-danger">{fileError}</p>}

      {/* El pie de foto se escribe AL SUBIR: el backend no tiene endpoint para cambiarlo después. */}
      <div className="mt-3">
        <label
          className="mb-1 block text-xs font-medium text-text-muted"
          htmlFor={`${ui.captionTestId}-field`}
        >
          {intl.formatMessage({ id: 'WEB_CATALOG.SHOWCASE_CAPTION' })}
        </label>
        <input
          id={`${ui.captionTestId}-field`}
          type="text"
          value={caption}
          disabled={busy}
          onChange={(event) => setCaption(event.target.value)}
          className={`w-full ${SHOWCASE_INPUT_CLASSES}`}
          data-testid={ui.captionTestId}
        />
        <p className="mt-1 text-xs text-text-muted">
          {intl.formatMessage({ id: 'WEB_CATALOG.SHOWCASE_CAPTION_HINT' })}
        </p>
      </div>

      {images.length === 0 ? (
        <p className="mt-3 text-xs text-text-muted">{intl.formatMessage({ id: 'WEB_CATALOG.SHOWCASE_EMPTY' })}</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-3" data-testid={ui.listTestId}>
          {images.map((image, index) => (
            <li key={image.id} className="flex w-28 flex-col items-center gap-1">
              <img
                src={apiFileUrl(`/api/v1/public/catalog/${storeSlug}/media/${image.key}`)}
                alt={image.caption ?? intl.formatMessage({ id: ui.titleId })}
                className="h-20 w-28 rounded-md border border-border object-cover"
                data-testid={`showcase-image-${image.id}`}
              />
              {image.caption && (
                <span className="w-full truncate text-center text-xs text-text-muted">
                  {image.caption}
                </span>
              )}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleMove(index, -1)}
                  disabled={busy || index === 0}
                  aria-label={intl.formatMessage({ id: 'WEB_CATALOG.SHOWCASE_MOVE_UP' })}
                  className="px-1 text-xs text-text-muted hover:text-text disabled:opacity-40"
                  data-testid={`showcase-move-up-${image.id}`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(index, 1)}
                  disabled={busy || index === images.length - 1}
                  aria-label={intl.formatMessage({ id: 'WEB_CATALOG.SHOWCASE_MOVE_DOWN' })}
                  className="px-1 text-xs text-text-muted hover:text-text disabled:opacity-40"
                  data-testid={`showcase-move-down-${image.id}`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(kind, image.id)}
                  disabled={busy}
                  aria-label={intl.formatMessage({ id: 'WEB_CATALOG.SHOWCASE_REMOVE' })}
                  className="px-1 text-danger hover:opacity-80 disabled:opacity-40"
                  data-testid={`showcase-remove-${image.id}`}
                >
                  <TrashIcon className="h-3 w-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
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

  /**
   * Marca (F8): la del catálogo público, guardada con SU PROPIO botón y en SU PROPIA petición.
   * Vive aparte del diff de productos a propósito — el PUT de marca es un parche y el de
   * productos es un lote, así que mezclarlos haría que cada botón tocara columnas que no son suyas.
   */
  const [branding, setBranding] = useState<CatalogBranding | null>(null);
  const [brandError, setBrandError] = useState('');
  const [pendingLogo, setPendingLogo] = useState<File | null>(null);
  /** Logo marcado para borrar, NO borrado todavía: lo aplica el botón de marca. */
  const [removeLogo, setRemoveLogo] = useState(false);
  const [isSavingBrand, setIsSavingBrand] = useState(false);
  /**
   * Plantilla (vista) elegida, PENDIENTE de guardar. `null` = el dueño todavía no la cambió y se
   * usa la que devolvió el servidor (`branding.templateId`). Se confirma con el mismo botón de
   * marca: el PUT de marca es parcial y también escribe la plantilla.
   */
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  /**
   * Showcase (carrusel + imágenes del día): los dos conjuntos son independientes (decisión C1) y
   * cada uno va con SUS peticiones —nada de esto entra en el guardado por lotes de productos—.
   */
  const [showcase, setShowcase] = useState<CatalogShowcaseImages | null>(null);
  const [showcaseError, setShowcaseError] = useState('');
  /** Conjuntos con una operación en vuelo: uno ocupado deja al otro usable. */
  const [busyShowcaseKinds, setBusyShowcaseKinds] = useState<readonly CatalogShowcaseKind[]>([]);

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

  /**
   * La marca se carga APARTE del catálogo: si este endpoint falla (una tienda con la fila de
   * pedidos pero sin la de marca, un 403 puntual) el catálogo y sus productos siguen siendo
   * utilizables. Solo la sección de marca se queda sin configurar.
   */
  const loadBranding = useCallback(async () => {
    try {
      const result = await catalogHttpService.getBranding();
      if (!result.succeeded) {
        setBrandError(intl.formatMessage({ id: 'WEB_CATALOG.BRAND_LOAD_ERROR' }));
        return;
      }
      setBranding(result.data);
      setBrandError('');
    } catch (err) {
      setBrandError(intl.formatMessage({ id: httpErrorKey(err, 'WEB_CATALOG.BRAND_LOAD_ERROR') }));
    }
  }, [intl]);

  useEffect(() => {
    void loadBranding();
  }, [loadBranding]);

  /**
   * El showcase se carga APARTE del catálogo, igual que la marca: si este endpoint falla (una
   * tienda recién sincronizada, un 403 puntual) el catálogo y sus productos siguen utilizables y
   * solo los dos bloques de imágenes se quedan sin configurar.
   */
  const loadShowcase = useCallback(async () => {
    try {
      const result = await catalogHttpService.getShowcaseImages();
      if (!result.succeeded) {
        setShowcaseError(intl.formatMessage({ id: 'WEB_CATALOG.SHOWCASE_LOAD_ERROR' }));
        return;
      }
      setShowcase(result.data);
      setShowcaseError('');
    } catch (err) {
      setShowcaseError(intl.formatMessage({ id: httpErrorKey(err, 'WEB_CATALOG.SHOWCASE_LOAD_ERROR') }));
    }
  }, [intl]);

  useEffect(() => {
    void loadShowcase();
  }, [loadShowcase]);

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

  // ── Marca (F8): subir / quitar el logo y guardarlo con SU botón ───────────────────
  // La validación local es la MISMA que la de la imagen de producto (formatos + tamaño): el
  // backend usa las mismas reglas (`CatalogImageUploadRules`) y así no se sube en balde.
  function handleBrandFile(
    file: File | null,
    onValid: (file: File) => void,
    onInvalid: (error: string) => void,
  ) {
    if (!file) return;
    if (!isValidCatalogImage(file)) {
      onInvalid(
        intl.formatMessage(
          { id: 'WEB_CATALOG.IMAGE_RULES' },
          { size: MAX_CATALOG_IMAGE_BYTES / (1024 * 1024) },
        ),
      );
      return;
    }
    onValid(file);
  }

  function handleSelectLogo(file: File | null) {
    setBrandError('');
    handleBrandFile(
      file,
      (valid) => {
        // Elegir una imagen y quitar la vigente son intenciones opuestas: gana la última.
        setRemoveLogo(false);
        setPendingLogo(valid);
      },
      setBrandError,
    );
  }

  const effectiveTemplate = branding?.templateId ?? DEFAULT_TEMPLATE_ID;
  const templateChanged = selectedTemplate !== null && selectedTemplate !== effectiveTemplate;
  const hasBrandChanges = pendingLogo !== null || removeLogo || templateChanged;

  async function handleSaveBrand() {
    if (!hasBrandChanges) return;

    const payload: CatalogBrandingUpdate = {};
    if (pendingLogo) payload.logo = pendingLogo;
    if (removeLogo) payload.removeLogo = true;
    if (templateChanged) payload.templateId = selectedTemplate!;

    setIsSavingBrand(true);
    try {
      const result = await catalogHttpService.updateBranding(payload);
      if (!result.succeeded) {
        showBlockingError(
          intl.formatMessage({ id: 'GENERAL.ERROR' }),
          intl.formatMessage({ id: 'WEB_CATALOG.BRAND_SAVE_ERROR' }),
        );
        return;
      }
      setPendingLogo(null);
      setRemoveLogo(false);
      setSelectedTemplate(null);
      setBrandError('');
      showToastSuccess(intl.formatMessage({ id: 'WEB_CATALOG.BRAND_SAVED' }));
      // El servidor manda: se recarga para que la previsualización sea la que quedó guardada
      // (la clave nueva lleva guid, así que el navegador no sirve la imagen vieja desde caché).
      await loadBranding();
    } catch (err) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        intl.formatMessage({ id: httpErrorKey(err, 'WEB_CATALOG.BRAND_SAVE_ERROR') }),
      );
    } finally {
      setIsSavingBrand(false);
    }
  }

  // ── Showcase: subir, mover y quitar imágenes del carrusel y de las del día ───────────
  /**
   * Envoltorio de las operaciones del showcase: marca SOLO ese conjunto como ocupado (el otro
   * sigue usable) y unifica el reporte de errores, que vive en el servidor y por tanto falla de
   * verdad cuando no hay conexión.
   */
  async function runShowcaseAction(kind: CatalogShowcaseKind, action: () => Promise<boolean>) {
    setBusyShowcaseKinds((current) => [...current, kind]);
    try {
      return await action();
    } catch (err) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        intl.formatMessage({ id: httpErrorKey(err, 'WEB_CATALOG.SHOWCASE_SAVE_ERROR') }),
      );
      return false;
    } finally {
      setBusyShowcaseKinds((current) => current.filter((busy) => busy !== kind));
    }
  }

  /**
   * Sube las imágenes de UN conjunto, de una en una (el backend acepta una por POST) y con el pie
   * de foto que el dueño escribió, que es el mismo para todas. Devuelve CUÁNTAS aceptó el
   * servidor: la tarjeta suelta solo esas y deja retenidas las que fallaron, para poder
   * reintentarlas sin volver a elegir los archivos.
   */
  async function handleShowcaseUpload(
    kind: CatalogShowcaseKind,
    files: File[],
    caption: string,
  ): Promise<number> {
    let uploaded = 0;
    await runShowcaseAction(kind, async () => {
      // Secuencial a propósito: son pocas imágenes y así el fallo se para en la que lo causó.
      for (const file of files) {
        const result = await catalogHttpService.uploadShowcaseImage({
          kind,
          file,
          ...(caption ? { caption } : {}),
        });
        if (!result.succeeded) break;
        uploaded += 1;
      }

      // El servidor manda: la lista se recarga para que las previsualizaciones y el orden sean
      // los que quedaron guardados (la clave nueva lleva guid, así que no hay imagen cacheada).
      await loadShowcase();

      if (uploaded !== files.length) {
        showBlockingError(
          intl.formatMessage({ id: 'GENERAL.ERROR' }),
          intl.formatMessage(
            { id: 'WEB_CATALOG.SHOWCASE_UPLOAD_PARTIAL' },
            { uploaded, total: files.length },
          ),
        );
        return false;
      }
      showToastSuccess(
        intl.formatMessage(
          files.length === 1
            ? { id: 'WEB_CATALOG.SHOWCASE_UPLOADED_ONE' }
            : { id: 'WEB_CATALOG.SHOWCASE_UPLOADED' },
          { count: files.length },
        ),
      );
      return true;
    });
    return uploaded;
  }

  function handleShowcaseRemove(kind: CatalogShowcaseKind, imageId: string) {
    void runShowcaseAction(kind, async () => {
      const result = await catalogHttpService.removeShowcaseImage(imageId);
      if (!result.succeeded) {
        showBlockingError(
          intl.formatMessage({ id: 'GENERAL.ERROR' }),
          intl.formatMessage({ id: 'WEB_CATALOG.SHOWCASE_SAVE_ERROR' }),
        );
        return false;
      }
      await loadShowcase();
      showToastSuccess(intl.formatMessage({ id: 'WEB_CATALOG.SHOWCASE_REMOVED' }));
      return true;
    });
  }

  /** Reordena UN conjunto. Sin aviso de éxito: el botón ya está en su sitio y el orden se ve. */
  function handleShowcaseMove(kind: CatalogShowcaseKind, orderedIds: string[]) {
    void runShowcaseAction(kind, async () => {
      const result = await catalogHttpService.reorderShowcaseImages(kind, orderedIds);
      if (!result.succeeded) {
        showBlockingError(
          intl.formatMessage({ id: 'GENERAL.ERROR' }),
          intl.formatMessage({ id: 'WEB_CATALOG.SHOWCASE_SAVE_ERROR' }),
        );
        return false;
      }
      await loadShowcase();
      return true;
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

      {/* Marca (F8). Solo el LOGO: el control de banner se retiró el 2026-10-08 (decisión del
          owner) sin tocar el dato ni el backend. Su propio botón y su propio PUT: el guardado
          por lotes de productos, más abajo, no la toca, para que guardar descripciones nunca
          escriba (ni borre) el logo. */}
      <Card
        padding="tight"
        title={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{intl.formatMessage({ id: 'WEB_CATALOG.BRAND_TITLE' })}</span>
            <Button
              variant="fab"
              onClick={() => void handleSaveBrand()}
              disabled={!hasBrandChanges || isSavingBrand}
              data-testid="brand-save"
            >
              <SaveIcon />
              {intl.formatMessage({
                id: isSavingBrand ? 'WEB_CATALOG.BRAND_SAVING' : 'WEB_CATALOG.BRAND_SAVE',
              })}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text-muted">{intl.formatMessage({ id: 'WEB_CATALOG.BRAND_SUBTITLE' })}</p>

        {brandError && (
          <InfoBox variant="danger" className="mt-2">
            <span data-testid="brand-error">{brandError}</span>
          </InfoBox>
        )}

        {/* Plantilla (vista) del catálogo público: elige CÓMO SE VE la carta. La funcionalidad es
            idéntica en todas; se guarda con el mismo botón de marca (el PUT de marca es parcial). */}
        <div className="mt-3">
          <label
            className="mb-1 block text-sm font-medium text-text"
            htmlFor="brand-template"
          >
            {intl.formatMessage({ id: 'WEB_CATALOG.BRAND_TEMPLATE' })}
          </label>
          <select
            id="brand-template"
            value={selectedTemplate ?? effectiveTemplate}
            disabled={isSavingBrand}
            onChange={(event) => setSelectedTemplate(event.target.value)}
            className="w-full max-w-xs rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid="brand-template"
          >
            {CATALOG_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {intl.formatMessage({ id: template.labelId })}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-text-muted">
            {intl.formatMessage({ id: 'WEB_CATALOG.BRAND_TEMPLATE_HINT' })}
          </p>
        </div>

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <BrandSlot
            labelId="WEB_CATALOG.BRAND_LOGO"
            removeLabelId="WEB_CATALOG.BRAND_REMOVE_LOGO"
            pendingRemoveLabelId="WEB_CATALOG.BRAND_PENDING_REMOVE_LOGO"
            testId="brand-logo"
            uploadTestId="brand-logo-upload"
            removeTestId="brand-logo-remove"
            pendingTestId="brand-pending-logo"
            pendingRemoveTestId="brand-pending-logo-remove"
            slotTestId="brand-slot-logo"
            storeSlug={status?.storeSlug ?? ''}
            mediaKey={branding?.logoKey ?? null}
            pendingFile={pendingLogo}
            markedForRemoval={removeLogo}
            busy={isSavingBrand}
            previewClass="h-16 w-16 object-contain"
            onSelectFile={handleSelectLogo}
            onToggleRemove={() => {
              setPendingLogo(null);
              setRemoveLogo((current) => !current);
            }}
          />
        </div>
      </Card>

      {/* Showcase: carrusel e imágenes del día (decisión C1). Dos bloques INDEPENDIENTES con
          sus propias peticiones, y ninguno mezclado con el guardado por lotes de productos: la
          configuración de lo que se ve en el catálogo no toca las filas de los productos. */}
      {([CatalogShowcaseKind.Carousel, CatalogShowcaseKind.Daily] as const).map((kind) => (
        <ShowcaseCard
          key={kind}
          kind={kind}
          images={kind === CatalogShowcaseKind.Carousel ? (showcase?.carousel ?? []) : (showcase?.daily ?? [])}
          storeSlug={status?.storeSlug ?? ''}
          busy={busyShowcaseKinds.includes(kind)}
          error={showcaseError}
          onUpload={handleShowcaseUpload}
          onRemove={handleShowcaseRemove}
          onMove={handleShowcaseMove}
        />
      ))}

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
