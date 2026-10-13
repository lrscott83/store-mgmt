import { Currency } from '@store-mgmt/domain';

/**
 * Moneda de un producto. El campo `currency` ausente = CUP (default del dominio).
 *
 * La regla de "una sola moneda por venta" (guardCurrency + su popup bloqueante)
 * fue RETIRADA por decisión del propietario el 2026-10-13: mezclar monedas en
 * una misma venta o movimiento siempre se permite. El bloqueo ya era
 * inalcanzable para las tiendas nuevas — todas nacen en el plan Superior, que
 * incluye el módulo 15 "Múltiples monedas" y por lo tanto levantaba el guard —
 * así que se retiró en lugar de re-encuadrarlo.
 *
 * La conversión de cada línea a la moneda de la venta vive en
 * `multipayments/cart-line-conversion.ts`, que sigue usando este helper para
 * leer la moneda original de cada línea.
 */
export function productCurrency(product: { currency?: number }): number {
  return product.currency ?? Currency.CUP;
}