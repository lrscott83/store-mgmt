import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { Product } from '@store-mgmt/domain';
import { OrderType } from '@store-mgmt/domain';

interface SaleProductRowProps {
  product: Product;
  orderType: OrderType;
  onAdded: (productId: string, quantity: number, price: number) => void;
  /**
   * Stock-availability check, mirrors Angular's InventoryOfflineService.hasAvailableProductToSale
   * gated to `product.discountFromInvantory` (sale-product-row.component.ts:61). Only called when
   * the product deducts from inventory. Optional so existing callers without inventory wiring keep
   * working (defaults to always-available), consistent with how this stage does not yet own the
   * `hasInventoryModuleAvailable()` feature-gate (deferred to Stage 6/Sync cross-cutting audit).
   */
  checkAvailability?: (productId: string, quantity: number) => boolean;
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
  const [error, setError] = useState<string | null>(null);

  function handleAddToCart() {
    setError(null);

    if (product.discountFromInvantory && checkAvailability) {
      const available = checkAvailability(product.id, quantity);
      if (!available) {
        // SALES.NOT_INVENTORY_AVAILABLE_MESSAGE
        setError(intl.formatMessage({ id: 'SALES.NOT_INVENTORY_AVAILABLE_MESSAGE' }));
        return;
      }
    }

    const effectivePrice = isNormalSale ? product.price : price;
    onAdded(product.id, quantity, effectivePrice);
  }

  return (
    <form className="flex items-center gap-3 border-b border-border py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text">{product.name}</p>
        {isNormalSale ? (
          <span className="text-sm text-primary">${product.price.toFixed(2)}</span>
        ) : (
          <label className="mt-1 flex flex-col gap-0.5 text-xs text-muted">
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
      </div>

      <label className="flex flex-col gap-0.5 text-xs text-muted">
        {intl.formatMessage({ id: 'GENERAL.QUANTITY' })}
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
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
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      </button>

      {error && (
        <p className="w-full text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
