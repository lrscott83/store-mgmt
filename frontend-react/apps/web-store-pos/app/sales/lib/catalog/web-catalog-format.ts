/**
 * Reglas del catálogo web (módulo 18, plan 2026-09-27) en el cliente.
 *
 * El backend guarda y transporta los descuentos como ENTEROS escalados con 2
 * decimales: `percentDiscountPrice = 1250` significa 12.50 % y
 * `discountPrice = 500` significa 5.00. Estos helpers son el espejo de
 * `Domain/Common/Catalog/CatalogScales.cs` y `CatalogPricing.cs`: la vista
 * muestra el resultado y el backend sigue siendo el dueño del cálculo.
 */

/** 1250 == 12.50 % (2 decimales). */
export const PERCENT_SCALE = 100;

/** 500 == 5.00 (2 decimales). */
export const DISCOUNT_PRICE_SCALE = 100;

/** Porcentaje máximo: 10000 == 100.00 %. */
export const MAX_PERCENT_SCALED = 100 * PERCENT_SCALE;

/** Límites de las imágenes del catálogo (decisión D10 del plan). */
export const MAX_CATALOG_IMAGES = 6;
export const MAX_CATALOG_IMAGE_BYTES = 2 * 1024 * 1024;

/** Longitud máxima de la descripción (espejo de ProductEntityLimits.DescriptionMaxLength). */
export const MAX_DESCRIPTION_LENGTH = 4000;

/** Entero escalado -> porcentaje decimal (1250 -> 12.5). */
export function toPercent(scaledPercent: number): number {
  return scaledPercent / PERCENT_SCALE;
}

/** Porcentaje decimal -> entero escalado (12.5 -> 1250), redondeando a 2 decimales. */
export function toScaledPercent(percent: number): number {
  return Math.round(percent * PERCENT_SCALE);
}

/** Entero escalado -> monto decimal (500 -> 5). */
export function toDiscountAmount(scaledDiscountPrice: number): number {
  return scaledDiscountPrice / DISCOUNT_PRICE_SCALE;
}

/** Monto decimal -> entero escalado (5 -> 500), redondeando a 2 decimales. */
export function toScaledDiscountAmount(amount: number): number {
  return Math.round(amount * DISCOUNT_PRICE_SCALE);
}

/**
 * Precio final del catálogo (decisión D7): primero el porcentaje y después el
 * monto rebajado, sin bajar nunca de 0.
 *
 *   final = max(0, round(price * (10000 - percent) / 10000, 2) - discount)
 */
export function computeFinalPrice(
  price: number,
  scaledPercentDiscountPrice: number,
  scaledDiscountPrice: number,
): number {
  const percent = toPercent(scaledPercentDiscountPrice);
  const withPercent = Math.round(((price * (100 - percent)) / 100) * 100) / 100;
  const finalPrice = withPercent - toDiscountAmount(scaledDiscountPrice);
  return finalPrice < 0 ? 0 : finalPrice;
}

/** true si el producto tiene algún descuento de catálogo. */
export function hasCatalogDiscount(
  scaledPercentDiscountPrice: number,
  scaledDiscountPrice: number,
): boolean {
  return scaledPercentDiscountPrice > 0 || scaledDiscountPrice > 0;
}
