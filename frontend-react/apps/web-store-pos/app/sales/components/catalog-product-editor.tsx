import { useState } from 'react';
import { useIntl } from 'react-intl';
import { FileInput } from '~/shared/components/ui/file-input';
import { TrashIcon } from '~/shared/components/ui/icons';
// import { confirmDialog } from '~/shared/lib/blocking-alert'; ← solo lo usaba la galería (ver abajo).
import { currencyFromCode, formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';
import { apiFileUrl } from '~/shared/lib/http/media-url';
import type { CatalogProductView } from '../lib/services/catalog-http-service';
// MAX_CATALOG_IMAGES solo lo usaba la galería (y su aviso de "Hasta {max} imágenes…"), ahora
// comentada: vuelve con ella, junto a `galleryFull` y el `<span>` de la cabecera.
import {
  MAX_CATALOG_IMAGE_BYTES,
  MAX_DESCRIPTION_LENGTH,
} from '../lib/catalog/web-catalog-format';

/**
 * NOTA DE RESTAURACIÓN (galería comentada): al volver a habilitarla descomenta — el import
 * `confirmDialog`, los props `onRemoveImage` / `onSetMainImage` / `onReorderImages` (su
 * desestructuración en la firma), las funciones `handleRemoveImage` y `handleMove`, la constante
 * `galleryFull` con su uso en `disabled={busy || galleryFull}`, el `<span>` del límite de la
 * cabecera, el `<ul>` de miniaturas bajo el bloque de imagen y el `MAX_CATALOG_IMAGES` del
 * import (el aviso nuevo `WEB_CATALOG.IMAGE_RULES` no lleva `{max}`).
 *
 * NOTA DE RESTAURACIÓN (descuentos y "Nuevo" comentados): la descripción YA es editable
 * (decisión del owner, 2026-10-01); lo que sigue COMENTADO es el resto del grid de actualización.
 * Al volver a habilitarlo, descomenta también — los estados `percent/discount/isNew`, su botonera
 * de Guardar en el padre, `parseNumber`, `finalPrice` y `handleSave` (con sus
 * validaciones), el grid de campos del JSX, el badge de -% de la cabecera y los imports `Switch`,
 * `computeFinalPrice`, `toPercent`, `toScaledPercent`, `toDiscountAmount`, `toScaledDiscountAmount`.
 * `INPUT_CLASSES` y `MAX_DESCRIPTION_LENGTH` ya existen (los usa el textarea).
 */

/** Formatos aceptados por el backend (decisión D10) — se validan aquí para no subir en balde. */
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Mismas clases que los inputs del catálogo público (`public-catalog.tsx`): el diseño es uno. */
const INPUT_CLASSES =
  'rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary';

interface CatalogProductEditorProps {
  product: CatalogProductView;
  /** Slug público de la tienda: solo con él se pueden previsualizar las imágenes publicadas. */
  storeSlug: string;
  /** true mientras hay una operación de ESTE producto en vuelo (subir o aplicar cambios). */
  busy: boolean;
  /** Borrador de la descripción: lo edita el padre, esta fila solo lo pinta y lo reporta. */
  description: string;
  onDescriptionChange: (value: string) => void;
  /** Archivo retenido (ya validado, todavía sin subir): también lo posee el padre. */
  pendingImage: File | null;
  /** Se llama SOLO cuando el archivo seleccionado pasa la validación local. */
  onSelectImage: (file: File | null) => void;
  /** true cuando el dueño marcó la principal para borrar: se aplica al guardar. */
  pendingImageRemoval: boolean;
  onToggleImageRemoval: () => void;
  /** true cuando este producto tiene cambios pendientes de guardar. */
  dirty: boolean;
  // Los tres props siguientes SOLO los usaba la galería multi-imagen, que ahora está comentada.
  // Siguen declarados porque el padre los sigue pasando y el tipo debe seguir compilando.
  onRemoveImage: (path: string) => void;
  onSetMainImage: (key: string) => void;
  onReorderImages: (paths: string[]) => void;
}

/**
 * Fila editable de un producto en la vista Catálogo Web (módulo 18, plan 2026-09-27).
 *
 * Es un editor CONTROLADO y SIN botón propio: la descripción y la imagen retenida viven en el
 * padre (`web-catalog.tsx`), que reúne los cambios de todos los productos y los aplica con UN
 * único botón al final de la página. Aquí solo se pinta el borrador, se avisa del estado
 * pendiente y se validan los archivos antes de retenerlos — seleccionar no dispara NADA de red.
 *
 * Solo la descripción es editable (decisión del owner, 2026-10-01): el % de descuento, el precio
 * rebajado y el switch "Nuevo" siguen COMENTADOS — no borrados — para restaurarlos más adelante.
 * Y la imagen es una sola: la galería multi-imagen (miniaturas, "Usar como principal", mover y
 * borrar) queda COMENTADA — no borrada — para restaurarla más adelante. Subir una imagen
 * REEMPLAZA la principal: el guardado borra la anterior (ver `applyProductChanges` en la vista).
 * El nombre, el precio de venta y el orden son del catálogo de productos: aquí se muestran, no se
 * tocan.
 */
export function CatalogProductEditor({
  product,
  storeSlug,
  busy,
  description,
  onDescriptionChange,
  pendingImage,
  onSelectImage,
  pendingImageRemoval,
  onToggleImageRemoval,
  dirty,
  // onRemoveImage, onSetMainImage y onReorderImages quedan sin desestructurar: solo los usaba la
  // galería multi-imagen, que está comentada (se restauran descomentando aquí y arriba).
}: CatalogProductEditorProps) {
  const intl = useIntl();

  const [error, setError] = useState<string | null>(null);

  // ── CAMPOS DE ACTUALIZACIÓN COMENTADOS (se restauran descomentando) ─────────────
  // Estado local del formulario para el resto del grid (la descripción ya vive en el padre).
  // const [percent, setPercent] = useState(toPercent(product.percentDiscountPrice).toString());
  // const [discount, setDiscount] = useState(toDiscountAmount(product.discountPrice).toString());
  // const [isNew, setIsNew] = useState(product.isNew);
  // ────────────────────────────────────────────────────────────────────────────────

  /** true mientras el borrador supere el límite del backend (espejo de ProductEntityLimits). */
  const descriptionTooLong = description.length > MAX_DESCRIPTION_LENGTH;

  // ── CAMPOS DE ACTUALIZACIÓN COMENTADOS (se restauran descomentando) ─────────────
  // function parseNumber(raw: string): number {
  //   const parsed = Number(raw.trim().replace(',', '.'));
  //   return Number.isFinite(parsed) ? parsed : 0;
  // }
  //
  // const percentNumber = parseNumber(percent);
  // const discountNumber = parseNumber(discount);
  // // El precio final es el mismo cálculo del backend (D7): % primero, monto rebajado después y
  // // nunca por debajo de 0. Solo es una previsualización; el dueño del dato es el backend.
  // const finalPrice = computeFinalPrice(
  //   product.price,
  //   toScaledPercent(percentNumber),
  //   toScaledDiscountAmount(discountNumber),
  // );
  // ────────────────────────────────────────────────────────────────────────────────

  /** Moneda del producto como valor del enum (el DTO la trae como código: "CUP", "USD", …). */
  const currency = currencyFromCode(product.currency);

  function handleFile(file: File | null) {
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type) || file.size > MAX_CATALOG_IMAGE_BYTES) {
      // Sin galería no hay "cuántas imágenes": el aviso solo habla de formatos y tamaño.
      setError(
        intl.formatMessage(
          { id: 'WEB_CATALOG.IMAGE_RULES' },
          { size: MAX_CATALOG_IMAGE_BYTES / (1024 * 1024) },
        ),
      );
      return;
    }
    setError(null);
    // SOLO se retiene (el padre lo guarda): nada de red al seleccionar; la subida ocurre al
    // pulsar el botón único de Guardar cambios.
    onSelectImage(file);
  }

  // ── GALERÍA COMENTADA (se restaura descomentando) ──────────────────────────────
  // Necesita el import `confirmDialog` y el prop `onRemoveImage` (ver NOTA DE RESTAURACIÓN).
  // async function handleRemoveImage(path: string) {
  //   const confirmed = await confirmDialog({
  //     title: intl.formatMessage({ id: 'WEB_CATALOG.REMOVE_IMAGE' }),
  //     message: intl.formatMessage({ id: 'WEB_CATALOG.REMOVE_IMAGE_CONFIRM' }),
  //     confirmButtonText: intl.formatMessage({ id: 'GENERAL.YES' }),
  //     cancelButtonText: intl.formatMessage({ id: 'GENERAL.NO' }),
  //   });
  //   if (confirmed) onRemoveImage(path);
  // }
  //
  // function handleMove(index: number, direction: -1 | 1) {
  //   const next = [...product.images];
  //   const target = index + direction;
  //   if (target < 0 || target >= next.length) return;
  //   [next[index], next[target]] = [next[target], next[index]];
  //   onReorderImages(next);
  // }
  //
  // Con la galería oculta, subir una imagen reemplaza la principal: un producto que ya tenga 6
  // imágenes vuelve a poder subirlas todas, así que el tope ya no bloquea el FileInput.
  // const galleryFull = product.images.length >= MAX_CATALOG_IMAGES;
  // ────────────────────────────────────────────────────────────────────────────────

  return (
    <article
      className={`rounded-lg border border-border bg-surface p-4 ${
        product.availableToSale ? '' : 'opacity-80'
      }`.trim()}
      data-testid={`catalog-product-${product.id}`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h4 className="flex-1 text-base font-medium text-text">{product.name}</h4>
        {/* Sin categoría junto al precio: la categoría ya nombra el panel colapsable que
            contiene este producto. Precio con su moneda (código, no símbolo). */}
        <span className="text-sm font-medium text-text">
          {formatMoneyWithCurrency(product.price, currency)}
        </span>
        {!product.availableToSale && (
          <span className="rounded-full bg-border px-2 py-0.5 text-xs font-medium text-text-muted">
            {intl.formatMessage({ id: 'WEB_CATALOG.UNPUBLISHED' })}
          </span>
        )}
        {product.isNew && (
          <span className="rounded-full bg-primary-light px-2 py-0.5 text-xs font-medium text-primary">
            {intl.formatMessage({ id: 'WEB_CATALOG.IS_NEW' })}
          </span>
        )}
        {/* Cambios de ESTE producto esperando al botón único del final de la página. */}
        {dirty && (
          <span
            className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning"
            data-testid={`catalog-unsaved-${product.id}`}
          >
            {intl.formatMessage({ id: 'WEB_CATALOG.UNSAVED_BADGE' })}
          </span>
        )}
        {/* El badge de -% del header vuelve junto a los campos de actualización (comentados). */}
      </header>

      {/* Descripción: TEXTO PLANO (decisión D9), nunca HTML. Es un borrador controlado por el
          padre: esta fila no guarda nada por su cuenta.

          SIN `md:grid-cols-2`: el grid de dos columnas solo tenía sentido cuando la fila de
          descuentos ocupaba la segunda. Con la descripción sola, media columna en escritorio
          dejaba el textarea estrecho sin nada al lado. Al restaurar los descuentos, el grid
          vuelve con el commented block de abajo. */}
      <div className="mt-3">
        <div>
          <label
            className="mb-1 block text-xs font-medium text-text-muted"
            htmlFor={`catalog-description-${product.id}`}
          >
            {intl.formatMessage({ id: 'WEB_CATALOG.DESCRIPTION' })}
          </label>
          <textarea
            id={`catalog-description-${product.id}`}
            rows={5}
            value={description}
            placeholder={intl.formatMessage({ id: 'WEB_CATALOG.DESCRIPTION_PLACEHOLDER' })}
            onChange={(event) => onDescriptionChange(event.target.value)}
            className={INPUT_CLASSES}
            data-testid={`catalog-description-${product.id}`}
          />
          <p className="mt-1 text-right text-xs text-text-muted">
            {intl.formatMessage(
              { id: 'WEB_CATALOG.DESCRIPTION_COUNTER' },
              { count: description.length, max: MAX_DESCRIPTION_LENGTH },
            )}
          </p>
          {descriptionTooLong && (
            <p className="mt-1 text-xs text-danger">
              {intl.formatMessage(
                { id: 'WEB_CATALOG.DESCRIPTION_TOO_LONG' },
                { max: MAX_DESCRIPTION_LENGTH },
              )}
            </p>
          )}
        </div>

        {/* ── CAMPOS DE ACTUALIZACIÓN COMENTADOS (se restauran descomentando) ─────────

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className="mb-1 block text-xs font-medium text-text-muted"
                htmlFor={`catalog-percent-${product.id}`}
              >
                {intl.formatMessage({ id: 'WEB_CATALOG.PERCENT_DISCOUNT' })}
              </label>
              <input
                id={`catalog-percent-${product.id}`}
                type="text"
                inputMode="decimal"
                value={percent}
                onChange={(event) => setPercent(event.target.value)}
                className={INPUT_CLASSES}
                data-testid={`catalog-percent-${product.id}`}
              />
            </div>
            <div>
              <label
                className="mb-1 block text-xs font-medium text-text-muted"
                htmlFor={`catalog-discount-${product.id}`}
              >
                {intl.formatMessage({ id: 'WEB_CATALOG.DISCOUNT_PRICE' })}
              </label>
              <input
                id={`catalog-discount-${product.id}`}
                type="text"
                inputMode="decimal"
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
                className={INPUT_CLASSES}
                data-testid={`catalog-discount-${product.id}`}
              />
            </div>
          </div>

          <Switch
            checked={isNew}
            onChange={setIsNew}
            label={intl.formatMessage({ id: 'WEB_CATALOG.IS_NEW' })}
            disabled={busy}
          />

          <p className="text-sm" data-testid={`catalog-final-price-${product.id}`}>
            <span className="font-medium text-text">
              {intl.formatMessage({ id: 'WEB_CATALOG.FINAL_PRICE' })}:{' '}
              {formatMoneyWithCurrency(finalPrice, currency)}
            </span>
            {finalPrice < product.price && (
              <span className="ml-2 text-xs text-text-muted line-through">
                {formatMoneyWithCurrency(product.price, currency)}
              </span>
            )}
          </p>
        </div>
        ─────────────────────────────────────────────────────────────────────────────── */}
      </div>

      {/* Imagen: UNA sola por producto. La galería multi-imagen y su texto de límite ("Hasta {max}
          imágenes…") quedan comentados — no borrados — y vuelven con esa funcionalidad. */}
      <div className="mt-4 border-t border-border pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-text-muted">
            {intl.formatMessage({ id: 'WEB_CATALOG.IMAGE' })}
          </span>
          {/* GALERÍA COMENTADA (se restaura descomentando): con una sola imagen el aviso de "hasta
              N imágenes" ya no describe nada real. Necesita MAX_CATALOG_IMAGES.
          <span className="text-xs text-text-muted">
            {intl.formatMessage(
              { id: 'WEB_CATALOG.GALLERY_LIMIT' },
              { max: MAX_CATALOG_IMAGES, size: MAX_CATALOG_IMAGE_BYTES / (1024 * 1024) },
            )}
          </span>
          */}
        </div>

        <div className="mt-2 flex flex-wrap items-start gap-3">
          {product.image ? (
            <figure className="flex flex-col items-center gap-1">
              <img
                src={apiFileUrl(`/api/v1/public/catalog/${storeSlug}/media/${product.image}`)}
                alt={product.name}
                className="h-20 w-20 rounded-md border border-border object-cover"
                data-testid={`catalog-main-image-${product.id}`}
              />
              {/* Quitar imagen NO borra nada aquí: marca la eliminación y la aplica el guardado. */}
              <button
                type="button"
                onClick={onToggleImageRemoval}
                disabled={busy}
                className="inline-flex items-center gap-1 text-xs text-danger hover:underline disabled:opacity-50"
                data-testid={`catalog-clear-main-${product.id}`}
              >
                <TrashIcon className="h-3 w-3" />
                {intl.formatMessage({ id: 'WEB_CATALOG.REMOVE_IMAGE' })}
              </button>
            </figure>
          ) : (
            <p className="text-xs text-text-muted">—</p>
          )}

          <div className="min-w-56 flex-1">
            <FileInput
              onFileChange={handleFile}
              accept=".jpg,.jpeg,.png,.webp"
              disabled={busy}
              data-testid={`catalog-upload-${product.id}`}
            />
            {/* Selección retenida: se anuncia y SOLO se sube al pulsar Guardar cambios. */}
            {pendingImage && (
              <p
                className="mt-1 text-xs text-primary"
                data-testid={`catalog-pending-image-${product.id}`}
              >
                {pendingImage.name}
                {` · ${intl.formatMessage({ id: 'WEB_CATALOG.WILL_BE_MAIN' })}`}
              </p>
            )}
            {/* El padre garantiza que imagen retenida y borrado marcado son excluyentes. */}
            {pendingImageRemoval && (
              <p
                className="mt-1 text-xs text-danger"
                data-testid={`catalog-pending-image-removal-${product.id}`}
              >
                {intl.formatMessage({ id: 'WEB_CATALOG.PENDING_IMAGE_REMOVE' })}
              </p>
            )}
          </div>
        </div>

        {/* GALERÍA COMENTADA (se restaura descomentando): miniaturas con "Usar como principal",
            mover antes/después y borrar. Al volver hacen falta `onSetMainImage`, `onReorderImages`,
            `handleRemoveImage`, `handleMove`, `galleryFull` y el import `confirmDialog`.
        {product.images.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-3">
            {product.images.map((key, index) => (
              <li key={key} className="flex flex-col items-center gap-1">
                <img
                  src={apiFileUrl(`/api/v1/public/catalog/${storeSlug}/media/${key}`)}
                  alt={product.name}
                  className={`h-16 w-16 rounded-md border object-cover ${
                    key === product.image ? 'border-primary' : 'border-border'
                  }`}
                  data-testid={`catalog-image-${product.id}-${index}`}
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onSetMainImage(key)}
                    disabled={busy || key === product.image}
                    className="text-xs text-primary hover:underline disabled:opacity-40"
                    data-testid={`catalog-set-main-${product.id}-${index}`}
                  >
                    {intl.formatMessage({ id: 'WEB_CATALOG.SET_MAIN_IMAGE' })}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(index, -1)}
                    disabled={busy || index === 0}
                    aria-label={intl.formatMessage({ id: 'WEB_CATALOG.MOVE_LEFT' })}
                    className="px-1 text-xs text-text-muted hover:text-text disabled:opacity-40"
                    data-testid={`catalog-move-left-${product.id}-${index}`}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(index, 1)}
                    disabled={busy || index === product.images.length - 1}
                    aria-label={intl.formatMessage({ id: 'WEB_CATALOG.MOVE_RIGHT' })}
                    className="px-1 text-xs text-text-muted hover:text-text disabled:opacity-40"
                    data-testid={`catalog-move-right-${product.id}-${index}`}
                  >
                    ›
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRemoveImage(key)}
                    disabled={busy}
                    aria-label={intl.formatMessage({ id: 'WEB_CATALOG.REMOVE_IMAGE' })}
                    className="px-1 text-danger hover:opacity-80 disabled:opacity-40"
                    data-testid={`catalog-remove-image-${product.id}-${index}`}
                  >
                    <TrashIcon className="h-3 w-3" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        */}
      </div>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </article>
  );
}

export default CatalogProductEditor;
