import { useIntl } from 'react-intl';
import { Button } from '~/shared/components/ui/button';
import { Modal } from '~/shared/components/ui/modal';
import { currencyFromCode, formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';
import { wholesaleUnitPluralOf } from '~/catalog/lib/catalog-wholesale';
import {
  isWholesaleLine,
  lineMinPacks,
  linePackPrice,
  linePacks,
  type StorefrontCartLine,
} from '~/catalog/lib/storefront-cart-store';

interface StorefrontCartProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Lines of THIS store: the cart is already isolated by slug. */
  readonly lines: readonly StorefrontCartLine[];
  /** Subtotal de presentación. El total real lo fija el servidor al crear el pedido. */
  readonly subtotal: number;
  /** Moneda de la carta del catálogo (la del primer producto; `null` si el carrito está vacío). */
  readonly currency: string | null;
  /** New amount of the line: PACKS on a wholesale line, UNITS on a per-unit one. */
  readonly onUpdateQuantity: (productId: string, quantity: number) => void;
  readonly onRemove: (productId: string) => void;
  readonly onClear: () => void;
  readonly onCheckout: () => void;
}

const INPUT_CLASSES =
  'rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary';

/**
 * Carrito del cliente anónimo (F3): qué lleva, cuánto y el subtotal. Modal, no panel lateral,
 * para que en móvil se comporte como hoja y desde `sm` como diálogo centrado (`Modal` ya lo
 * resuelve).
 *
 * El subtotal es ORIENTATIVO —el precio final lo recalcula la tienda—, y por eso la nota lo dice
 * en la propia vista en vez de dejar que el cliente lo tome por definitivo.
 */
export function StorefrontCart({
  open,
  onClose,
  lines,
  subtotal,
  currency,
  onUpdateQuantity,
  onRemove,
  onClear,
  onCheckout,
}: StorefrontCartProps) {
  const intl = useIntl();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={intl.formatMessage({ id: 'CATALOG_PUBLIC.CART_TITLE' })}
      testId="catalog-cart-modal"
    >
      {lines.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-sm text-text" data-testid="catalog-cart-empty">
            {intl.formatMessage({ id: 'CATALOG_PUBLIC.CART_EMPTY' })}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {intl.formatMessage({ id: 'CATALOG_PUBLIC.CART_EMPTY_HINT' })}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {lines.map((line) => (
            <li
              key={line.productId}
              className="flex items-center gap-3 py-3"
              data-testid={`catalog-cart-item-${line.productId}`}
            >
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium text-text">{line.name}</p>
                <p className="text-xs text-text-muted">
                  {intl.formatMessage({ id: 'CATALOG_PUBLIC.CART_SUBTOTAL' })}:{' '}
                  {isWholesaleLine(line) ? (
                    // Wholesale: the customer thinks in packs, so the line says "2 cajas × $240"
                    // (the pack price) instead of the per-unit price the server prices with.
                    // Same "price × amount" shape as the legacy line, with the pack count first.
                    <>
                      {linePacks(line)} {wholesaleUnitPluralOf(line.unitLabel)} ×{' '}
                      {formatMoneyWithCurrency(
                        linePackPrice(line),
                        currencyFromCode(line.currency),
                      )}
                    </>
                  ) : (
                    <>
                      {formatMoneyWithCurrency(
                        line.unitPrice,
                        currencyFromCode(line.currency),
                      )}{' '}
                      × {line.quantity}
                    </>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {/* ± move ONE PACK on a wholesale line and ONE UNIT otherwise: `linePacks` is the
                    number the customer is actually changing, so the store receives the pack count
                    and re-resolves the tier price itself. */}
                <button
                  type="button"
                  onClick={() => onUpdateQuantity(line.productId, linePacks(line) - 1)}
                  className="h-8 w-8 rounded-md border border-border text-sm text-text hover:bg-surface-hover"
                  aria-label={intl.formatMessage(
                    { id: 'CATALOG_PUBLIC.CART_DECREASE' },
                    { name: line.name },
                  )}
                  data-testid={`catalog-cart-decrease-${line.productId}`}
                >
                  −
                </button>
                <input
                  type="number"
                  min={lineMinPacks(line)}
                  step={1}
                  value={linePacks(line)}
                  // Un input VACIADO, o con algo que no sea un entero >= 1, NO toca el store: la
                  // cantidad manda sobre la línea, y `updateQuantity(<= 0)` la BORRA (F3-R4). Con
                  // `Number(v) || 0`, borrar el dígito para retocarlo se comía el producto entero
                  // —un fallo de datos, no de UX—. Quitar tiene sus propios gestos: el −, el
                  // "Quitar" y el "Vaciar".
                  onChange={(event) => {
                    const raw = event.target.value.trim();
                    const quantity = Number(raw);
                    if (raw === '' || !Number.isInteger(quantity) || quantity < 1) return;
                    onUpdateQuantity(line.productId, quantity);
                  }}
                  className={`${INPUT_CLASSES} w-16 text-center`}
                  aria-label={line.name}
                  data-testid={`catalog-cart-quantity-${line.productId}`}
                />
                <button
                  type="button"
                  onClick={() => onUpdateQuantity(line.productId, linePacks(line) + 1)}
                  className="h-8 w-8 rounded-md border border-border text-sm text-text hover:bg-surface-hover"
                  aria-label={intl.formatMessage(
                    { id: 'CATALOG_PUBLIC.CART_INCREASE' },
                    { name: line.name },
                  )}
                  data-testid={`catalog-cart-increase-${line.productId}`}
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(line.productId)}
                  className="ml-1 text-xs text-danger hover:underline"
                  aria-label={intl.formatMessage(
                    { id: 'CATALOG_PUBLIC.CART_REMOVE' },
                    { name: line.name },
                  )}
                  data-testid={`catalog-cart-remove-${line.productId}`}
                >
                  {intl.formatMessage({ id: 'CATALOG_PUBLIC.CART_REMOVE_PLAIN' })}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {lines.length > 0 && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text">
              {intl.formatMessage({ id: 'CATALOG_PUBLIC.CART_SUBTOTAL' })}
            </span>
            <span className="text-lg font-bold text-primary" data-testid="catalog-cart-subtotal">
              {formatMoneyWithCurrency(subtotal, currencyFromCode(currency ?? undefined))}
            </span>
          </div>
          <p className="text-xs text-text-muted">
            {intl.formatMessage({ id: 'CATALOG_PUBLIC.CART_TOTAL_NOTE' })}
          </p>
          <div className="flex flex-wrap justify-between gap-2">
            <Button
              variant="outline"
              onClick={onClear}
              data-testid="catalog-cart-clear"
            >
              {intl.formatMessage({ id: 'CATALOG_PUBLIC.CART_CLEAR' })}
            </Button>
            <Button onClick={onCheckout} data-testid="catalog-cart-checkout">
              {intl.formatMessage({ id: 'CATALOG_PUBLIC.CART_CHECKOUT' })}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
