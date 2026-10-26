import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Currency } from '@store-mgmt/domain';
import { Button } from '~/shared/components/ui/button';
import { FileInput } from '~/shared/components/ui/file-input';
import { SaveIcon } from '~/shared/components/ui/icons';
import { InfoBox } from '~/shared/components/ui/info-box';
import { Modal } from '~/shared/components/ui/modal';
import {
  isValidCatalogImage,
  MAX_CATALOG_IMAGE_BYTES,
  MAX_DESCRIPTION_LENGTH,
} from '../lib/catalog/web-catalog-format';

const INPUT_CLASSES =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary';

// The SuperAdmin session has no store module context, so the module-gated `CurrencySelect` would
// render nothing and every product would silently be created in CUP. The catalog accepts a
// currency on its own, so this form always offers the full list.
const CURRENCY_OPTIONS: { value: number; label: string }[] = [
  { value: Currency.CUP, label: 'CUP' },
  { value: Currency.USD, label: 'USD' },
  { value: Currency.EUR, label: 'EUR' },
  { value: Currency.CLA, label: 'CLA' },
  { value: Currency.MLC, label: 'MLC' },
  { value: Currency.CAD, label: 'CAD' },
  { value: Currency.MXN, label: 'MXN' },
];

/** Lo que el modal entrega al alta: los campos del contrato más la imagen, que va después. */
export interface CatalogProductDraft {
  categoryId: string;
  name: string;
  price: number;
  currency: number;
  description?: string;
  /** La subida necesita el id que devuelve el alta, así que la imagen NO viaja en el POST. */
  image: File | null;
}

interface CatalogCreateProductModalProps {
  categories: { id: string; name: string }[];
  /** Categoría del panel desde el que se abrió: llega precargada. */
  defaultCategoryId: string;
  /** Alta real; true = creado (y la imagen ya se intentó subir), así que el modal puede cerrarse. */
  onSave: (draft: CatalogProductDraft) => Promise<boolean>;
  onClose: () => void;
}

/**
 * Alta de producto desde la vista store-scoped del SuperAdmin: categoría, nombre, precio, moneda,
 * descripción e imagen principal opcional. Se guarda en `Product`, la MISMA tabla que el import
 * CSV y el POS; sin imagen el producto queda sin imagen principal.
 */
export function CatalogCreateProductModal({
  categories,
  defaultCategoryId,
  onSave,
  onClose,
}: CatalogCreateProductModalProps) {
  const intl = useIntl();
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState<number>(Currency.CUP);
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [errors, setErrors] = useState<{
    category?: string;
    name?: string;
    price?: string;
    description?: string;
    image?: string;
  }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleFile(file: File | null) {
    if (!file) return;
    if (!isValidCatalogImage(file)) {
      setImage(null);
      setErrors((current) => ({
        ...current,
        image: intl.formatMessage(
          { id: 'WEB_CATALOG.IMAGE_RULES' },
          { size: MAX_CATALOG_IMAGE_BYTES / (1024 * 1024) },
        ),
      }));
      return;
    }
    setImage(file);
    setErrors((current) => ({ ...current, image: undefined }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();

    if (!categoryId) {
      nextErrors.category = intl.formatMessage(
        { id: 'GENERAL.VALIDATION.REQUIRED' },
        { name: intl.formatMessage({ id: 'WEB_CATALOG.CATEGORY' }) },
      );
    }
    if (!trimmedName) {
      nextErrors.name = intl.formatMessage(
        { id: 'GENERAL.VALIDATION.REQUIRED' },
        { name: intl.formatMessage({ id: 'PRODUCTS.FORM.NAME' }) },
      );
    }
    const parsedPrice = Number(price);
    if (price.trim() === '' || Number.isNaN(parsedPrice)) {
      nextErrors.price = intl.formatMessage(
        { id: 'GENERAL.VALIDATION.REQUIRED' },
        { name: intl.formatMessage({ id: 'PRODUCTS.FORM.PRICE' }) },
      );
    } else if (parsedPrice < 0) {
      nextErrors.price = intl.formatMessage(
        { id: 'GENERAL.VALIDATION.NUMBER_GREADER_THAN_ZERO' },
        { name: intl.formatMessage({ id: 'GENERAL.PRICE' }) },
      );
    }
    if (trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
      nextErrors.description = intl.formatMessage(
        { id: 'WEB_CATALOG.DESCRIPTION_TOO_LONG' },
        { max: MAX_DESCRIPTION_LENGTH },
      );
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      const saved = await onSave({
        categoryId,
        name: trimmedName,
        price: parsedPrice,
        currency,
        ...(trimmedDescription ? { description: trimmedDescription } : {}),
        image,
      });
      if (saved) onClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={intl.formatMessage({ id: 'WEB_CATALOG.NEW_PRODUCT' })}
      testId="catalog-new-product-modal"
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label
            className="mb-1 block text-xs font-medium text-text-muted"
            htmlFor="catalog-new-product-category"
          >
            {intl.formatMessage({ id: 'WEB_CATALOG.CATEGORY' })}
          </label>
          <select
            id="catalog-new-product-category"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className={INPUT_CLASSES}
            data-testid="catalog-new-product-category"
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {errors.category && <p className="mt-1 text-xs text-danger">{errors.category}</p>}
        </div>

        <div>
          <label
            className="mb-1 block text-xs font-medium text-text-muted"
            htmlFor="catalog-new-product-name"
          >
            {intl.formatMessage({ id: 'PRODUCTS.FORM.NAME' })}
          </label>
          <input
            id="catalog-new-product-name"
            type="text"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={INPUT_CLASSES}
            data-testid="catalog-new-product-name"
          />
          {errors.name && <p className="mt-1 text-xs text-danger">{errors.name}</p>}
        </div>

        <div>
          <label
            className="mb-1 block text-xs font-medium text-text-muted"
            htmlFor="catalog-new-product-price"
          >
            {intl.formatMessage({ id: 'PRODUCTS.FORM.PRICE' })}
          </label>
          <input
            id="catalog-new-product-price"
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className={INPUT_CLASSES}
            data-testid="catalog-new-product-price"
          />
          {errors.price && <p className="mt-1 text-xs text-danger">{errors.price}</p>}
        </div>

        <div>
          <label
            className="mb-1 block text-xs font-medium text-text-muted"
            htmlFor="catalog-new-product-currency"
          >
            {intl.formatMessage({ id: 'PRODUCTS.FORM.PRICE_CURRENCY' })}
          </label>
          <select
            id="catalog-new-product-currency"
            value={currency}
            onChange={(event) => setCurrency(Number(event.target.value))}
            className={INPUT_CLASSES}
            disabled={isSubmitting}
            data-testid="catalog-new-product-currency"
          >
            {CURRENCY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            className="mb-1 block text-xs font-medium text-text-muted"
            htmlFor="catalog-new-product-description"
          >
            {intl.formatMessage({ id: 'WEB_CATALOG.DESCRIPTION' })}
          </label>
          <textarea
            id="catalog-new-product-description"
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className={INPUT_CLASSES}
            data-testid="catalog-new-product-description"
          />
          <p className="mt-1 text-right text-xs text-text-muted">
            {intl.formatMessage(
              { id: 'WEB_CATALOG.DESCRIPTION_COUNTER' },
              { count: description.length, max: MAX_DESCRIPTION_LENGTH },
            )}
          </p>
          {errors.description && <p className="mt-1 text-xs text-danger">{errors.description}</p>}
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium text-text-muted">
            {intl.formatMessage({ id: 'WEB_CATALOG.IMAGE' })}
          </span>
          <FileInput
            onFileChange={handleFile}
            accept=".jpg,.jpeg,.png,.webp"
            disabled={isSubmitting}
            data-testid="catalog-new-product-image"
          />
          {image && (
            <p className="mt-1 text-xs text-primary" data-testid="catalog-new-product-image-name">
              {image.name}
            </p>
          )}
          {errors.image && (
            <InfoBox variant="danger" className="mt-2">
              {errors.image}
            </InfoBox>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button
            variant="fab"
            type="submit"
            disabled={isSubmitting}
            data-testid="catalog-new-product-submit"
          >
            <SaveIcon />
            {intl.formatMessage({ id: 'GENERAL.SAVE' })}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
