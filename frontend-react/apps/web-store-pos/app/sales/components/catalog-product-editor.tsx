import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Button } from '~/shared/components/ui/button';
import { FileInput } from '~/shared/components/ui/file-input';
import { Switch } from '~/shared/components/ui/switch';
import { SaveIcon, TrashIcon } from '~/shared/components/ui/icons';
import { confirmDialog } from '~/shared/lib/blocking-alert';
import { formatCurrency } from '~/shared/lib/format-currency';
import { apiFileUrl } from '~/shared/lib/http/media-url';
import type { CatalogProductFields, CatalogProductView } from '../lib/services/catalog-http-service';
import {
  MAX_CATALOG_IMAGES,
  MAX_CATALOG_IMAGE_BYTES,
  MAX_DESCRIPTION_LENGTH,
  computeFinalPrice,
  toDiscountAmount,
  toPercent,
  toScaledDiscountAmount,
  toScaledPercent,
} from '../lib/catalog/web-catalog-format';

/** Formatos aceptados por el backend (decisión D10) — se validan aquí para no subir en balde. */
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const INPUT_CLASSES =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary';

interface CatalogProductEditorProps {
  product: CatalogProductView;
  /** Slug público de la tienda: solo con él se pueden previsualizar las imágenes publicadas. */
  storeSlug: string;
  /** true mientras hay una operación de ESTE producto en vuelo (guardar o imágenes). */
  busy: boolean;
  onSave: (fields: CatalogProductFields) => void;
  onUploadImage: (file: File) => void;
  onRemoveImage: (path: string) => void;
  onSetMainImage: (key: string) => void;
  onReorderImages: (paths: string[]) => void;
}

/**
 * Fila editable de un producto en la vista Catálogo Web (módulo 18, plan 2026-09-27).
 *
 * Solo edita los campos del catálogo (decisión D8): descripción en TEXTO PLANO (D9 — un
 * `textarea`, nunca un editor HTML), `% de descuento`, `precio rebajado`, `Nuevo` y las imágenes
 * (principal + galería propietaria, decisión D10). El nombre, el precio de venta y el orden son
 * del catálogo de productos: aquí se muestran, no se tocan.
 */
export function CatalogProductEditor({
  product,
  storeSlug,
  busy,
  onSave,
  onUploadImage,
  onRemoveImage,
  onSetMainImage,
  onReorderImages,
}: CatalogProductEditorProps) {
  const intl = useIntl();

  // Estado local del formulario: el producto de la lista es la referencia, lo editado vive aquí
  // hasta que se guarda.
  const [description, setDescription] = useState(product.description);
  const [percent, setPercent] = useState(toPercent(product.percentDiscountPrice).toString());
  const [discount, setDiscount] = useState(toDiscountAmount(product.discountPrice).toString());
  const [isNew, setIsNew] = useState(product.isNew);
  const [error, setError] = useState<string | null>(null);

  function parseNumber(raw: string): number {
    const parsed = Number(raw.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const percentNumber = parseNumber(percent);
  const discountNumber = parseNumber(discount);
  // El precio final es el mismo cálculo del backend (D7): % primero, monto rebajado después y
  // nunca por debajo de 0. Solo es una previsualización; el dueño del dato es el backend.
  const finalPrice = computeFinalPrice(
    product.price,
    toScaledPercent(percentNumber),
    toScaledDiscountAmount(discountNumber),
  );

  function handleSave() {
    if (percentNumber < 0 || percentNumber > 100) {
      setError(intl.formatMessage({ id: 'WEB_CATALOG.PERCENT_RANGE' }));
      return;
    }
    if (discountNumber < 0) {
      setError(intl.formatMessage({ id: 'WEB_CATALOG.DISCOUNT_RANGE' }));
      return;
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      setError(
        intl.formatMessage(
          { id: 'WEB_CATALOG.DESCRIPTION_TOO_LONG' },
          { max: MAX_DESCRIPTION_LENGTH },
        ),
      );
      return;
    }
    setError(null);
    onSave({
      description,
      percentDiscountPrice: toScaledPercent(percentNumber),
      discountPrice: toScaledDiscountAmount(discountNumber),
      isNew,
    });
  }

  function handleFile(file: File | null) {
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type) || file.size > MAX_CATALOG_IMAGE_BYTES) {
      setError(
        intl.formatMessage(
          { id: 'WEB_CATALOG.GALLERY_LIMIT' },
          { max: MAX_CATALOG_IMAGES, size: MAX_CATALOG_IMAGE_BYTES / (1024 * 1024) },
        ),
      );
      return;
    }
    setError(null);
    onUploadImage(file);
  }

  async function handleRemoveImage(path: string) {
    const confirmed = await confirmDialog({
      title: intl.formatMessage({ id: 'WEB_CATALOG.REMOVE_IMAGE' }),
      message: intl.formatMessage({ id: 'WEB_CATALOG.REMOVE_IMAGE_CONFIRM' }),
      confirmButtonText: intl.formatMessage({ id: 'GENERAL.YES' }),
      cancelButtonText: intl.formatMessage({ id: 'GENERAL.NO' }),
    });
    if (confirmed) onRemoveImage(path);
  }

  function handleMove(index: number, direction: -1 | 1) {
    const next = [...product.images];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onReorderImages(next);
  }

  const galleryFull = product.images.length >= MAX_CATALOG_IMAGES;

  return (
    <article
      className={`rounded-lg border border-border bg-surface p-4 ${
        product.availableToSale ? '' : 'opacity-80'
      }`.trim()}
      data-testid={`catalog-product-${product.id}`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h4 className="flex-1 text-base font-medium text-text">{product.name}</h4>
        <span className="text-xs text-text-muted">{product.categoryName}</span>
        <span className="text-sm font-medium text-text">{formatCurrency(product.price)}</span>
        {!product.availableToSale && (
          <span className="rounded-full bg-border px-2 py-0.5 text-xs font-medium text-text-muted">
            {intl.formatMessage({ id: 'WEB_CATALOG.UNPUBLISHED' })}
          </span>
        )}
        {isNew && (
          <span className="rounded-full bg-primary-light px-2 py-0.5 text-xs font-medium text-primary">
            {intl.formatMessage({ id: 'WEB_CATALOG.IS_NEW' })}
          </span>
        )}
        {percentNumber > 0 && (
          <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
            -{percentNumber}%
          </span>
        )}
      </header>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {/* Descripción: texto plano, sin editor ni HTML (decisión D9). */}
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
            onChange={(event) => setDescription(event.target.value)}
            className={INPUT_CLASSES}
            data-testid={`catalog-description-${product.id}`}
          />
          <p className="mt-1 text-right text-xs text-text-muted">
            {intl.formatMessage(
              { id: 'WEB_CATALOG.DESCRIPTION_COUNTER' },
              { count: description.length, max: MAX_DESCRIPTION_LENGTH },
            )}
          </p>
        </div>

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
              {formatCurrency(finalPrice)}
            </span>
            {finalPrice < product.price && (
              <span className="ml-2 text-xs text-text-muted line-through">
                {formatCurrency(product.price)}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Imágenes: principal + galería (máx. 6 por producto, 2 MB cada una — decisión D10). */}
      <div className="mt-4 border-t border-border pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-text-muted">
            {intl.formatMessage({ id: 'WEB_CATALOG.MAIN_IMAGE' })}
          </span>
          <span className="text-xs text-text-muted">
            {intl.formatMessage(
              { id: 'WEB_CATALOG.GALLERY_LIMIT' },
              { max: MAX_CATALOG_IMAGES, size: MAX_CATALOG_IMAGE_BYTES / (1024 * 1024) },
            )}
          </span>
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
              <button
                type="button"
                onClick={() => onSave({ removeImage: true })}
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
              disabled={busy || galleryFull}
              data-testid={`catalog-upload-${product.id}`}
            />
          </div>
        </div>

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
      </div>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <div className="mt-3 flex justify-end">
        <Button variant="fab" onClick={handleSave} disabled={busy} data-testid={`catalog-save-${product.id}`}>
          <SaveIcon />
          {intl.formatMessage({ id: 'WEB_CATALOG.SAVE' })}
        </Button>
      </div>
    </article>
  );
}

export default CatalogProductEditor;
