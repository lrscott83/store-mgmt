import type { AuditableBaseModel } from './base';

export interface ProductCategory {
  id: string;
  name: string;
  order: number;
  isActive: boolean;
}

export interface ProductCategoryView extends ProductCategory {
  productsCount: number;
}

/**
 * Escalón de precio mayorista: a partir de `minPacks` paquetes se aplica `pricePerUnit`
 * (precio por UNIDAD dentro del paquete). Ej: beer con packSize 24 → 12×24×660.
 */
export interface WholesaleTier {
  minPacks: number;
  pricePerUnit: number;
}

/** Configuración mayorista de un producto: tamaño de paquete + escalones de precio. */
export interface WholesaleConfig {
  packSize: number;
  tiers: WholesaleTier[];
  /**
   * Unidad de medida como la entiende el usuario para este producto ("caja", "paquete",
   * "fardo"…). Opcional: sin valor los textos muestran "paquete" (label por defecto).
   */
  unitLabel?: string;
}

export interface Product extends AuditableBaseModel {
  id: string;
  name: string;
  barcode?: string;
  categoryId: string;
  categoryName: string;
  price: number;
  order: number;
  availableToSale: boolean;
  discountFromInvantory: boolean;
  businessId: string;
  /** Se vende también por mayor (paquetes). Cuando es true, `wholesalePackSize`/`wholesaleTiers` están presentes. */
  wholesaleEnabled?: boolean;
  /** Unidades por paquete/caja (6, 10, 12, 24, 30…). */
  wholesalePackSize?: number;
  /** Escalones de precio mayorista, ordenados por `minPacks` ascendente. */
  wholesaleTiers?: WholesaleTier[];
  /** Unidad de medida configurable ("caja", "paquete"…). Ausente → los textos usan "paquete". */
  wholesaleUnitLabel?: string;
}

/**
 * 1:1 port of Angular's `ProductSelectView`
 * (application/products/product-select.view.ts) — the flattened shape
 * `ProductService.getProductsToSelect()` returns for dropdown/select UIs.
 */
export interface ProductSelectView {
  id: string;
  fullName: string;
}
