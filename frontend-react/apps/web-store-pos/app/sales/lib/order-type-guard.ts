import { OrderType, ProductErrors, Result } from '@store-mgmt/domain';
import type { BaseError } from '@store-mgmt/domain';
import type { CartItem } from '~/shared/lib/stores/cart-store';

/**
 * Exclusividad Normal/Mayorista — no se puede mezclar tipos de venta en un mismo
 * carrito (el carrito es compartido y su `orderType` lo fija el primer ítem).
 *
 * Regla: si el carrito tiene ítems y su `orderType` difiere del tipo que se quiere
 * añadir, la adición se bloquea con un error descriptivo que las vistas muestran
 * en popup (showBlockingError). Carrito vacío siempre permite.
 */
export function guardOrderType(params: {
  items: CartItem[];
  cartOrderType: OrderType;
  requested: OrderType;
}): Result {
  const { items, cartOrderType, requested } = params;

  const hasItems = items.length > 0;
  const conflicts = hasItems && cartOrderType !== requested;
  if (!conflicts) return Result.Success();

  const inCourse =
    cartOrderType === OrderType.Mayorista
      ? 'venta mayorista'
      : 'venta normal';
  const requestedLabel =
    requested === OrderType.Mayorista ? 'venta mayorista' : 'venta normal';

  const description =
    `No se puede iniciar una ${requestedLabel} porque hay una ${inCourse} en curso. ` +
    'Complete o cancele la venta actual antes de comenzar la otra.';

  const error: BaseError = {
    code: ProductErrors.ProductNotAvailable.code,
    description,
  };
  return Result.Failure([error]);
}
