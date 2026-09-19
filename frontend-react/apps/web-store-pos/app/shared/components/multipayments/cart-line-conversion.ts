import { ChannelRateErrors, Currency, convertLineAmount } from '@store-mgmt/domain';
import type { BaseError, ChannelRate } from '@store-mgmt/domain';
import type { CartItem } from '~/shared/lib/stores/cart-store';
import { round2 } from '~/shared/lib/money';
import { productCurrency } from '~/shared/lib/currency-guard';

/**
 * multipayments (módulo 16, T8) — convierte cada línea del carrito a la moneda
 * de la venta elegida, usando la conversión de línea RF-09 del dominio
 * (`convertLineAmount`, enteros en centavos, un solo redondeo HALF-UP).
 *
 * Pureza: la función no toca el store ni la UI; recibe ítems, moneda de venta,
 * tasas y el instante `at`, y devuelve un resultado inmutable. Sin el módulo 16
 * el carrito sigue siendo de una sola moneda (guard intacto) y este módulo no
 * se usa.
 *
 * Frontera de unidades: el dominio trabaja en CENTAVOS enteros, la UI en
 * UNIDADES (mismo criterio que `multi-payment-list`/`multi-payment-settlement`).
 * `Math.round(unitPrice * 100)` convierte en la entrada y `convertedCents / 100`
 * en la salida. Las líneas en la misma moneda que la venta son identidad.
 *
 * Una línea trans-moneda sin tasa resoluble produce `ChannelRateErrors.RateNotFound`
 * — nunca un 0 silencioso.
 */

/** Una línea del carrito convertida a la moneda de la venta. */
export interface CartLineConversion {
  readonly productId: string;
  readonly fromCurrency: Currency;
  /** Precio unitario convertido, en UNIDADES de la moneda de venta; null si falló. */
  readonly convertedUnitPrice: number | null;
  /** Error tipado de conversión (p. ej. RateNotFound); null significa OK. */
  readonly error: BaseError | null;
}

/** Resultado de convertir el carrito completo a la moneda de la venta. */
export interface CartConversionResult {
  /** Una entrada por ítem, en el mismo orden que `items`. */
  readonly lines: readonly CartLineConversion[];
  /** Suma de `round2(convertedUnitPrice * quantity)` sobre las líneas convertibles. */
  readonly total: number;
  /** Primer error tipado de conversión, o null cuando todas convirtieron. */
  readonly firstError: BaseError | null;
}

export function convertCartLines(
  items: readonly CartItem[],
  saleCurrency: Currency,
  rates: readonly ChannelRate[],
  at: Date,
): CartConversionResult {
  const lines: CartLineConversion[] = [];
  let total = 0;
  let firstError: BaseError | null = null;

  for (const item of items) {
    const fromCurrency = productCurrency(item.product) as Currency;
    const unitPrice = item.price ?? item.product.price;
    // Frontera de entrada: unidades -> centavos enteros.
    const unitPriceCents = Math.round(unitPrice * 100);
    const converted = convertLineAmount(unitPriceCents, fromCurrency, saleCurrency, rates, at);

    if (!converted.succeeded || converted.data === undefined) {
      const error = converted.errors[0] ?? ChannelRateErrors.RateNotFound;
      lines.push({ productId: item.product.id, fromCurrency, convertedUnitPrice: null, error });
      if (firstError === null) firstError = error;
      continue;
    }

    // Frontera de salida: centavos -> unidades.
    const convertedUnitPrice = converted.data / 100;
    lines.push({ productId: item.product.id, fromCurrency, convertedUnitPrice, error: null });
    total += round2(convertedUnitPrice * item.quantity);
  }

  return { lines, total: round2(total), firstError };
}
