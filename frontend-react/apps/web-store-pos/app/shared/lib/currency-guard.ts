import { Currency, ProductErrors, Result } from '@store-mgmt/domain';
import type { BaseError } from '@store-mgmt/domain';
import type { CartItem } from '~/shared/lib/stores/cart-store';

/**
 * Una sola moneda por venta (MultiMonedas) — no se pueden mezclar productos de
 * monedas distintas en un mismo carrito (la moneda la fija el primer ítem).
 *
 * Regla: si el carrito tiene ítems y la moneda del producto que se quiere añadir
 * difiere de la de la venta en curso, la adición se bloquea con un error
 * descriptivo que las vistas muestran en popup (showBlockingError). Carrito
 * vacío siempre permite. El campo `currency` ausente = CUP (default del dominio).
 *
 * MultiPayments (módulo 16): `allowMixedCurrencies` LIFTA el guard — con el
 * módulo activo el carrito admite monedas mezcladas porque cada línea se
 * convierte a la moneda de la venta antes de cobrar (`cart-line-conversion`).
 * Ausente/false = comportamiento legado EXACTO (una sola moneda por venta).
 */
export function productCurrency(product: { currency?: number }): number {
  return product.currency ?? Currency.CUP;
}

export function guardCurrency(params: {
  items: CartItem[];
  requestedProduct: { currency?: number };
  allowMixedCurrencies?: boolean;
}): Result {
  const { items, requestedProduct, allowMixedCurrencies = false } = params;

  // Módulo 16: mezclar monedas deja de ser un error; la conversión por línea
  // ocurre en el carrito (cart-shell) al cobrar.
  if (allowMixedCurrencies) return Result.Success();

  const hasItems = items.length > 0;
  if (!hasItems) return Result.Success();

  const cartCurrency = productCurrency(items[0].product);
  const incoming = productCurrency(requestedProduct);
  const conflicts = cartCurrency !== incoming;
  if (!conflicts) return Result.Success();

  const description =
    `No se puede agregar el producto porque su moneda (${currencyCode(incoming)}) es distinta ` +
    `a la de la venta en curso (${currencyCode(cartCurrency)}). ` +
    'Complete o cancele la venta actual antes de comenzar una venta en otra moneda.';

  const error: BaseError = {
    code: ProductErrors.ProductNotAvailable.code,
    description,
  };
  return Result.Failure([error]);
}

function currencyCode(currency: number): string {
  switch (currency) {
    case Currency.USD:
      return 'USD';
    case Currency.EUR:
      return 'EUR';
    case Currency.CLA:
      return 'CLA';
    case Currency.MLC:
      return 'MLC';
    case Currency.CAD:
      return 'CAD';
    case Currency.MXN:
      return 'MXN';
    default:
      return 'CUP';
  }
}
