import { useIntl } from 'react-intl';
import { Button } from '~/shared/components/ui/button';
import { Modal } from '~/shared/components/ui/modal';
import { currencyFromCode, formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';
import type { StorefrontCartLine } from '~/catalog/lib/storefront-cart-store';

interface StorefrontCartProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Líneas de ESTA tienda: el carrito ya viene aislado por slug. */
  readonly lines: readonly StorefrontCartLine[];
  /** Subtotal de presentación. El total real lo fija el servidor al crear el pedido. */
  readonly subtotal: number;
  /** Moneda de la carta del catálogo (la del primer producto; `null` si el carrito está vacío). */
  readonly currency: string | null;
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
                  {formatMoneyWithCurrency(
                    line.unitPrice,
                    currencyFromCode(line.currency),
                  )}{' '}
                  × {line.quantity}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => onUpdateQuantity(line.productId, line.quantity - 1)}
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
                  min={1}
                  step={1}
                  value={line.quantity}
                  onChange={(event) =>
                    onUpdateQuantity(line.productId, Number(event.target.value) || 0)
                  }
                  className={`${INPUT_CLASSES} w-16 text-center`}
                  aria-label={line.name}
                  data-testid={`catalog-cart-quantity-${line.productId}`}
                />
                <button
                  type="button"
                  onClick={() => onUpdateQuantity(line.productId, line.quantity + 1)}
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
