import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { Product, Result } from '@store-mgmt/domain';
import { OrderType } from '@store-mgmt/domain';
import { ProductErrors } from '@store-mgmt/domain';
import { showBlockingError } from '~/shared/lib/blocking-alert';
import { formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';

/**
 * T8: parsea el borrador de un input numérico. Vacío o no finito → undefined,
 * para que el valor confirmado conserve el último válido en vez de un 0 basura.
 */
function parseNumericDraft(draft: string): number | undefined {
  if (draft.trim() === '') return undefined;
  const parsed = Number(draft);
  return Number.isFinite(parsed) ? parsed : undefined;
}

interface SaleProductRowProps {
  product: Product;
  orderType: OrderType;
  onAdded: (productId: string, quantity: number, price: number) => void;
  /**
   * Stock-availability check, 1:1 port of Angular's
   * InventoryOfflineService.hasAvailableProductToSale, called unconditionally from
   * addProductToCart (sale-product-row.component.ts:58-104) — no discountFromInvantory gate
   * at the component level, the gate lives inside the service (branch 4). Optional so
   * existing callers without inventory wiring keep working (defaults to always-available).
   */
  checkAvailability?: (productId: string, quantity: number) => Result;
  /**
   * Cantidad disponible en inventario del producto, solo cuando el producto descuenta
   * inventario (discountFromInvantory) y hay módulo de inventario activo. Se muestra
   * entre paréntesis al lado del precio. Undefined → no se muestra nada.
   */
  availableQuantity?: number;
}

/**
 * Per-product row on the Sale/POS screen. Strict parity with Angular's
 * sale-product-row.component.html: name + price (read-only for Normal sales, editable
 * input for other order types) + quantity input + a single "add to cart" action.
 */
export function SaleProductRow({
  product,
  orderType,
  onAdded,
  checkAvailability,
  availableQuantity,
}: SaleProductRowProps) {
  const intl = useIntl();
  const isNormalSale = orderType === OrderType.Normal;

  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(product.price);
  // T8: el input muestra un BORRADOR de texto para poder vaciar el campo (borrar
  // el "0") mientras se escribe; el valor confirmado (`quantity`/`price`) solo se
  // actualiza con un número finito y, al confirmar (blur o agregar), un borrador
  // vacío/inválido vuelve al último válido.
  const [quantityDraft, setQuantityDraft] = useState('1');
  const [priceDraft, setPriceDraft] = useState(String(product.price));

  function changeQuantity(raw: string) {
    setQuantityDraft(raw);
    const parsed = parseNumericDraft(raw);
    if (parsed !== undefined) setQuantity(parsed);
  }

  function commitQuantity(): number {
    const next = parseNumericDraft(quantityDraft) ?? quantity;
    setQuantity(next);
    setQuantityDraft(String(next));
    return next;
  }

  function changePrice(raw: string) {
    setPriceDraft(raw);
    const parsed = parseNumericDraft(raw);
    if (parsed !== undefined) setPrice(parsed);
  }

  function commitPrice(): number {
    const next = parseNumericDraft(priceDraft) ?? price;
    setPrice(next);
    setPriceDraft(String(next));
    return next;
  }

  function handleAddToCart() {
    const effectiveQuantity = commitQuantity();
    const effectivePrice = commitPrice();
    if (checkAvailability) {
      const result = checkAvailability(product.id, effectiveQuantity);
      if (!result.succeeded) {
        // Angular: Swal.fire({ title: GENERAL.RESPONSE.ERROR_TITLE, text: message,
        // icon: 'error' }) — blocking, aborts the add (sale-product-row.component.ts:58-73).
        // Angular reads `availableResult.errors[0].description` directly (already
        // hardcoded Spanish text in ProductErrors, not an i18n key lookup), falling back to
        // ProductErrors.ProductNotAvailable.description when errors is empty.
        // The stock ceiling is appended when the caller supplied it (sale.tsx
        // passes availableQuantity for inventory-discounting products).
        const message =
          result.errors[0]?.description ?? ProductErrors.ProductNotAvailable.description;
        const detail =
          result.errors[0]?.code === ProductErrors.ProductQuantityNotAvailable.code &&
          availableQuantity !== undefined
            ? `\n${intl.formatMessage({ id: 'SALES.AVAILABLE_STOCK' }, { available: availableQuantity })}`
            : '';
        showBlockingError(
          intl.formatMessage({ id: 'GENERAL.RESPONSE.ERROR_TITLE' }),
          message + detail,
        );
        return;
      }
    }

    const finalPrice = isNormalSale ? product.price : effectivePrice;
    onAdded(product.id, effectiveQuantity, finalPrice);
  }

  return (
    <form className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text">{product.name}</p>
        {isNormalSale ? (
          <span className="text-sm text-primary">
            {formatMoneyWithCurrency(product.price, product.currency)}
            {product.discountFromInvantory && availableQuantity !== undefined && (
              <span className="ml-1 text-xs text-muted">({availableQuantity})</span>
            )}
          </span>
        ) : (
          <label className="mt-1 flex items-center gap-2 text-xs text-muted">
            {intl.formatMessage({ id: 'GENERAL.PRICE' })}
            <input
              type="number"
              min={0}
              value={priceDraft}
              onChange={(e) => changePrice(e.target.value)}
              onBlur={() => commitPrice()}
              className="w-24 rounded-md border border-border px-2 py-1 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
        )}
      </div>

      <label className="flex flex-col gap-0.5 text-xs text-muted">
        {intl.formatMessage({ id: 'GENERAL.QUANTITY' })}
        <input
          type="number"
          min={0}
          step="any"
          value={quantityDraft}
          onChange={(e) => changeQuantity(e.target.value)}
          onBlur={() => commitQuantity()}
          className="w-16 rounded-md border border-border px-2 py-1 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </label>

      <button
        type="button"
        onClick={handleAddToCart}
        aria-label={intl.formatMessage({ id: 'GENERAL.ADD' })}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white shadow-card hover:bg-primary-hover transition-colors"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      </button>
    </form>
  );
}
