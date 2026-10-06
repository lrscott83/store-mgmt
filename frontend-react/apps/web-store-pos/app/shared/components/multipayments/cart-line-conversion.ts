import { ChannelRateErrors, Currency, RATE_MICRO, convertLineAmount, resolveCurrencyRate } from '@store-mgmt/domain';
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
  /** Precio unitario en la moneda ORIGINAL del producto, antes de convertir. */
  readonly originalUnitPrice: number;
  /** Moneda de `originalUnitPrice`. */
  readonly originalCurrency: Currency;
  /** Tasa moneda-por-USD de la moneda original usada; `1` sin conversión, null si no aplicó. */
  readonly conversionRate: number | null;
  /** Id de la fila de `ChannelRate` de la moneda original; null sin provenance. */
  readonly conversionRateId: string | null;
  /** Momento desde el que aplicaba la tasa de la moneda original; null sin provenance. */
  readonly conversionRateEffectiveFrom: Date | null;
}

/** Snapshot de la tasa de la moneda de venta, compartido por todas las líneas. */
export interface SaleCurrencyRateSnapshot {
  readonly value: number;
  readonly id: string | null;
  readonly effectiveFrom: Date | null;
}

/** Resultado de convertir el carrito completo a la moneda de la venta. */
export interface CartConversionResult {
  /** Una entrada por ítem, en el mismo orden que `items`. */
  readonly lines: readonly CartLineConversion[];
  /** Suma de `round2(convertedUnitPrice * quantity)` sobre las líneas convertibles. */
  readonly total: number;
  /** Primer error tipado de conversión, o null cuando todas convirtieron. */
  readonly firstError: BaseError | null;
  /** Tasa de la moneda de venta; null cuando no es resoluble (nunca un 1x1 silencioso). */
  readonly saleCurrencyRate: SaleCurrencyRateSnapshot | null;
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

  // Sale-currency rate, resolved once for the whole cart. `null` when it is not
  // resolvable (a non-USD currency with no rate) so it can never read as a silent 1x1.
  const resolvedSaleCurrency = resolveCurrencyRate(rates, saleCurrency, at);
  const saleCurrencyRate =
    resolvedSaleCurrency.succeeded && resolvedSaleCurrency.data
      ? {
          value: resolvedSaleCurrency.data.buyValue / RATE_MICRO,
          id: resolvedSaleCurrency.data.id ?? null,
          effectiveFrom: resolvedSaleCurrency.data.effectiveFrom ?? null,
        }
      : null;

  for (const item of items) {
    const fromCurrency = productCurrency(item.product) as Currency;
    const unitPrice = item.price ?? item.product.price;
    // Frontera de entrada: unidades -> centavos enteros.
    const unitPriceCents = Math.round(unitPrice * 100);
    const converted = convertLineAmount(unitPriceCents, fromCurrency, saleCurrency, rates, at);

    // Snapshot of the rate used to convert the ORIGINAL currency: identity (1, no
    // provenance) for a same-currency line, the resolved row otherwise, null when the
    // original currency has no resolvable rate.
    const sameCurrency = Number(fromCurrency) === Number(saleCurrency);
    const resolvedSource = sameCurrency ? undefined : resolveCurrencyRate(rates, fromCurrency, at);
    const usedRate = sameCurrency
      ? { conversionRate: 1, conversionRateId: null, conversionRateEffectiveFrom: null }
      : resolvedSource?.succeeded && resolvedSource.data
        ? {
            conversionRate: resolvedSource.data.buyValue / RATE_MICRO,
            conversionRateId: resolvedSource.data.id ?? null,
            conversionRateEffectiveFrom: resolvedSource.data.effectiveFrom ?? null,
          }
        : { conversionRate: null, conversionRateId: null, conversionRateEffectiveFrom: null };

    if (!converted.succeeded || converted.data === undefined) {
      const error = converted.errors[0] ?? ChannelRateErrors.RateNotFound;
      lines.push({
        productId: item.product.id,
        fromCurrency,
        convertedUnitPrice: null,
        error,
        originalUnitPrice: unitPrice,
        originalCurrency: fromCurrency,
        ...usedRate,
      });
      if (firstError === null) firstError = error;
      continue;
    }

    // Frontera de salida: centavos -> unidades.
    const convertedUnitPrice = converted.data / 100;
    lines.push({
      productId: item.product.id,
      fromCurrency,
      convertedUnitPrice,
      error: null,
      originalUnitPrice: unitPrice,
      originalCurrency: fromCurrency,
      ...usedRate,
    });
    total += round2(convertedUnitPrice * item.quantity);
  }

  return { lines, total: round2(total), firstError, saleCurrencyRate };
}
