import type { AuditableBaseModel } from './base';

/**
 * Elaboraciones — the production order (Odoo MO / ERPNext Work Order). An
 * elaboration consumes ingredient stock from a warehouse and produces the
 * finished good, recording the REAL cost per produced unit as a snapshot.
 *
 * Elaborations are immutable once confirmed: the component quantities and the
 * weighted-average costs used are frozen as an audit snapshot. Stock only
 * mutates through append-only warehouse movements.
 */
export interface ElaborationComponentActual {
  /** Ingredient product id. */
  productId: string;
  /** Theoretical consumption (scrap-inflated), snapshot of the estimate. */
  theoreticalQty: number;
  /** Real consumed quantity confirmed by the user (>= 0). */
  actualQty: number;
  /** Weighted-average cost per unit at elaboration time — snapshot. */
  costPrice: number;
}

/** A confirmed elaboration — immutable, with its real unit cost snapshot. */
export interface Elaboration extends AuditableBaseModel {
  id: string;
  /** Source recipe id. */
  recipeId: string;
  /** Denormalized recipe name snapshot (recipes are editable later). */
  recipeName: string;
  /** Finished product snapshot. */
  productId: string;
  /** Warehouse the ingredients were consumed from. */
  warehouseId: string;
  /** Number of batches produced (>= 1). */
  batches: number;
  /** Total units produced = `recipe.outputQty × batches`. */
  producedQty: number;
  /** Per-component consumption and cost snapshots. */
  components: ElaborationComponentActual[];
  /** Labor cost snapshot = `recipe.laborCost × batches`. */
  laborCost: number;
  /** Overhead percentage snapshot. */
  overheadPct: number;
  /** Real total cost = Σ(actualQty × costPrice) + laborCost + overheadCost. */
  totalCost: number;
  /** Real cost per produced unit = `totalCost / producedQty`. */
  unitCost: number;
  /** Date the elaboration was confirmed. */
  createdDate: Date;
  /** Name of the user who confirmed the elaboration. */
  createdByName: string;
}
