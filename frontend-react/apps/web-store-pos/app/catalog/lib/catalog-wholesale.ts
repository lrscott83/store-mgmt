import type { PublicCatalogProduct } from '~/sales/lib/services/catalog-http-service';
import { round2 } from '~/shared/lib/money';
import {
  getWholesaleMinPacks,
  wholesaleTierUnitPrice,
  wholesaleUnitName,
  wholesaleUnitPlural,
} from '~/sales/lib/wholesale';

/**
 * Lectura del bloque MAYORISTA del catálogo público, para la carta y el carrito del cliente.
 *
 * Este módulo NO implementa la regla de precios: `sales/lib/wholesale.ts` es la única fórmula
 * (escalón aplicable = el de mayor `minPacks <= packs`, precio POR UNIDAD, total =
 * `packs × packSize × unitPrice`) y aquí solo se ADAPTA el DTO público a la forma que esos helpers
 * entienden. Escribir una segunda fórmula del mismo dinero es la forma más segura de que la carta
 * y la venta mayorista del POS empiecen a cobrar distinto.
 *
 * El único dato que el DTO no trae y hay que decidir aquí es el de presentación: `unitLabel` es la
 * unidad que configuró el dueño ("caja", "fardo"), con "paquete" como fallback — el mismo que usa
 * el POS (`wholesaleUnitName`).
 */

/** Escalón reducido a lo que la regla de precio necesita. */
export interface CatalogWholesaleTier {
  readonly minPacks: number;
  readonly pricePerUnit: number;
}

/** Config mayorista mínima para que un producto se pueda pedir en paquetes. */
export interface CatalogWholesaleConfig {
  readonly packSize: number;
  /** Unidad configurada, sin normalizar (null = el producto no la definió). */
  readonly unitLabel: string | null;
  readonly tiers: readonly CatalogWholesaleTier[];
}

/**
 * Precio de UN paquete en el escalón de entrada, y la unidad para los textos.
 *
 * `packPrice` se prefiere del servidor (`wholesalePackPrice`) y solo se recalcula cuando la
 * respuesta no lo trae (payload anterior a la funcionalidad): el número que ve el cliente no puede
 * depender de que el cliente sepa multiplicar ni de un redondeo distinto.
 */
export interface CatalogWholesaleDisplay {
  readonly packSize: number;
  /** Unidad tal como la escribió el dueño ("caja"), nunca vacía. */
  readonly unit: string;
  /** Plural de `unit` para "desde 1 cajas" — el mismo pluralizador del POS. */
  readonly unitPlural: string;
  /** Menor cantidad vendible, en paquetes. */
  readonly minPacks: number;
  /** Precio de UN paquete en el escalón de entrada. */
  readonly packPrice: number;
}

/**
 * Config mayorista publicada, o `null` si el producto no se vende por paquetes.
 *
 * La validez es la MISMA del POS (`getWholesaleConfig`): activada, paquete de tamaño positivo y al
 * menos un escalón. En modo mayorista el servidor ya no publica productos sin config válida (S2),
 * pero la guarda se queda igual: una respuesta vieja, o un modo que cambió a mitad de sesión, no
 * puede dejar al cliente con una ficha sin precio.
 */
export function wholesaleConfigOf(product: PublicCatalogProduct): CatalogWholesaleConfig | null {
  const packSize = product.wholesalePackSize ?? 0;
  const tiers = (product.wholesaleTiers ?? []).map<CatalogWholesaleTier>((tier) => ({
    minPacks: tier.minPacks,
    pricePerUnit: tier.pricePerUnit,
  }));
  if (!product.wholesaleEnabled || packSize <= 0 || tiers.length === 0) return null;
  return { packSize, unitLabel: product.wholesaleUnitLabel ?? null, tiers };
}

/**
 * Published wholesale config, or `null` when this product must be sold by the unit.
 *
 * The MODE is part of the check: the sync always carries both prices (S3), so a product can have a
 * perfectly valid wholesale config and still be published at unit prices. Reading the config alone
 * would put packs in the cart of a unit-mode catalog.
 */
export function publishedWholesaleConfigOf(
  product: PublicCatalogProduct,
): CatalogWholesaleConfig | null {
  if (product.priceMode !== 'Wholesale') return null;
  return wholesaleConfigOf(product);
}

/** Unidad para los textos ("caja"), con el fallback histórico del POS. */
export function wholesaleUnitLabelOf(unitLabel: string | null | undefined): string {
  return wholesaleUnitName({ wholesaleUnitLabel: unitLabel ?? undefined });
}

/** Plural de la unidad ("cajas"): el MISMO pluralizador del POS, no una gramática nueva. */
export function wholesaleUnitPluralOf(unitLabel: string | null | undefined): string {
  return wholesaleUnitPlural(wholesaleUnitLabelOf(unitLabel));
}

/**
 * Adaptador a la forma que esperan los helpers del POS. `price` va en 0: el precio minorista solo
 * es el fallback de `resolveWholesalePrice`, y aquí nunca se pregunta por debajo del primer escalón
 * (para eso está `wholesaleTierUnitPrice`, que devuelve `undefined` en vez de inventar un precio).
 */
function pricingProductOf(tiers: readonly CatalogWholesaleTier[], packSize: number) {
  return {
    price: 0,
    wholesaleEnabled: true,
    wholesalePackSize: packSize,
    wholesaleTiers: tiers.map((tier) => ({
      minPacks: tier.minPacks,
      pricePerUnit: tier.pricePerUnit,
    })),
  };
}

/** Cantidad mínima vendible en paquetes (el `minPacks` del primer escalón). 0 sin escalones. */
export function wholesaleMinPacksOf(tiers: readonly CatalogWholesaleTier[]): number {
  return getWholesaleMinPacks(pricingProductOf(tiers, 1));
}

/**
 * Precio por UNIDAD del escalón que aplica a `packs`, o `undefined` si ningún escalón aplica (por
 * debajo del mínimo). `undefined` es información, no un hueco: la línea no debería existir.
 */
export function wholesaleUnitPriceFor(
  tiers: readonly CatalogWholesaleTier[],
  packSize: number,
  packs: number,
): number | undefined {
  return wholesaleTierUnitPrice(pricingProductOf(tiers, packSize), packs);
}

/** Does the catalog publish this product by the pack? Single predicate for the views. */
export function isWholesaleProduct(product: PublicCatalogProduct): boolean {
  return wholesaleDisplayOf(product) !== null;
}

/**
 * Presentación mayorista de un producto, o `null` para pintarlo como siempre.
 *
 * Se apoya en el `priceMode` del PROPIO producto (el servidor repite el de la cabecera) para que
 * una tarjeta no dependa de un dato que llega en otra llamada.
 */
export function wholesaleDisplayOf(product: PublicCatalogProduct): CatalogWholesaleDisplay | null {
  const config = publishedWholesaleConfigOf(product);
  if (!config) return null;

  const minPacks = wholesaleMinPacksOf(config.tiers);
  const entryUnitPrice =
    wholesaleUnitPriceFor(config.tiers, config.packSize, minPacks) ??
    product.wholesaleUnitPrice ??
    0;
  const serverPackPrice = product.wholesalePackPrice;
  const packPrice =
    serverPackPrice != null && serverPackPrice > 0
      ? serverPackPrice
      : round2(entryUnitPrice * config.packSize);

  return {
    packSize: config.packSize,
    unit: wholesaleUnitLabelOf(config.unitLabel),
    unitPlural: wholesaleUnitPluralOf(config.unitLabel),
    minPacks,
    packPrice,
  };
}
