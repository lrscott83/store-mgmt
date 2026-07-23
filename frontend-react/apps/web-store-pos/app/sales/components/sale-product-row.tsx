import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { Product, Result } from '@store-mgmt/domain';
import { OrderType } from '@store-mgmt/domain';
import { ProductErrors } from '@store-mgmt/domain';
import { showBlockingError } from '~/shared/lib/blocking-alert';

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
}

/**
 * Per-product row on the Sale/POS screen. Strict parity with Angular's
 * sale-product-row.component.html: name + price (read-only for Normal sales, editable
 * input for other order types) + quantity input + a single "add to cart" action.
 */
export function SaleProductRow({ product, orderType, onAdded, checkAvailability }: SaleProductRowProps) {
  const intl = useIntl();
  const isNormalSale = orderType === OrderType.Normal;

  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(product.price);

  function handleAddToCart() {
    if (checkAvailability) {
      const result = checkAvailability(product.id, quantity);
      if (!result.succeeded) {
        // Angular: Swal.fire({ title: GENERAL.RESPONSE.ERROR_TITLE, text: message,
        // icon: 'error' }) — blocking, aborts the add (sale-product-row.component.ts:58-73).
        // Angular reads `availableResult.errors[0].description` directly (already
        // hardcoded Spanish text in ProductErrors, not an i18n key lookup), falling back to
        // ProductErrors.ProductNotAvailable.description when errors is empty.
        const message = result.errors[0]?.description ?? ProductErrors.ProductNotAvailable.description;
        showBlockingError(intl.formatMessage({ id: 'GENERAL.RESPONSE.ERROR_TITLE' }), message);
        return;
      }
    }

    const effectivePrice = isNormalSale ? product.price : price;
    onAdded(product.id, quantity, effectivePrice);
  }

  return (
    <form className="flex flex-col gap-1 border-b border-border py-2 last:border-b-0">
      {/* Angular sale-product-row.component.html: the product name spans its own line on top;
          the price + quantity fields and the add-to-cart button sit on the row below, aligned. */}
      <p className="truncate text-sm text-text">{product.name}</p>

      <div className="flex items-end gap-3">
        {isNormalSale ? (
          <span className="text-sm text-primary">${product.price.toFixed(2)}</span>
        ) : (
          <label className="flex flex-col gap-0.5 text-xs text-muted">
            {intl.formatMessage({ id: 'GENERAL.PRICE' })}
            <input
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              className="w-24 rounded-md border border-border px-2 py-1 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
        )}

        <label className="flex flex-col gap-0.5 text-xs text-muted">
          {intl.formatMessage({ id: 'GENERAL.QUANTITY' })}
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="w-24 rounded-md border border-border px-2 py-1 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </label>

        <button
          type="button"
          onClick={handleAddToCart}
          aria-label={intl.formatMessage({ id: 'GENERAL.ADD' })}
          className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white shadow-card hover:bg-primary-hover transition-colors"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </button>
      </div>
    </form>
  );
}
