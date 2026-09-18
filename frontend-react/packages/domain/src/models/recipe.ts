import type { AuditableBaseModel } from './base';

/**
 * Recetas — the bill of materials (BoM) for a finished product. A recipe
 * declares which ingredients are consumed to produce `outputQty` units of the
 * finished product, plus the fixed labor cost and overhead applied per batch.
 *
 * Offline-first, per-store entity (localStorage), same persistence shape as
 * expenses/exchange-rates/warehouses. Validation lives in the service layer,
 * not in the domain types — this module only describes the shape.
 */
export interface RecipeComponent {
  /** Ingredient product id (must exist). */
  productId: string;
  /**
   * Quantity of the ingredient consumed per ONE output unit of the finished
   * product (round2, > 0). The effective consumed quantity at elaboration time
   * is `qty × (1 + scrapPct/100)`.
   */
  qty: number;
  /** Planned mermas: the theoretical consumption is inflated by this percentage (0–100). */
  scrapPct: number;
}

/** A recipe for a finished product — one ACTIVE recipe per product in v1. */
export interface Recipe extends AuditableBaseModel {
  id: string;
  /** Finished product id (must exist, any category). */
  productId: string;
  /** Units of the finished product ONE batch produces (rende). round2, > 0. */
  outputQty: number;
  /** Ingredients consumed per output unit — at least one component. */
  components: RecipeComponent[];
  /** Fixed labor cost per batch (optional, 0 default). */
  laborCost: number;
  /** Overhead (energy/fuel) as a percentage of the ingredients cost (0–100). */
  overheadPct: number;
  /** Soft-delete flag — deactivating frees the product for a new active recipe. */
  isActive: boolean;
}
