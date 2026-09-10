import type { AuditableBaseModel } from './base';

/**
 * Almacenes — portado del modelo de referencia (ECommerce templates,
 * `packages/domain/src/inventory/*` + Prisma `warehouse`/`stock_level`/
 * `stock_movement`), adaptado a la persistencia local offline-first.
 *
 * Invariantes del modelo de referencia que se conservan:
 * - `onHand` de un `WarehouseStockLevel` SOLO muta vía un `WarehouseStockMovement`
 *   (append-only) — nunca se escribe directo.
 * - `quantity` de un movimiento es siempre magnitud positiva (round2, acepta
 *   decimales); la dirección la da el `type` (`_in` suma, `_out` resta).
 * - Los movimientos no se mutan: la corrección/eliminación opera mediante un
 *   movimiento de reversa que compensa la fila original (plan 2026-09-09,
 *   D1/D8) — el log permanece íntegro como auditoría.
 */

/** Tipos de movimiento en v1 (sin `adjustment_*` — decisión #2) + reversa (plan 2026-09-09, D7a). */
export type WarehouseMovementType =
  | 'purchase_in'
  | 'sale_out'
  | 'transfer_in'
  | 'transfer_out'
  | 'reversal';

/** Lote de stock con costo exacto — el consumo es FIFO del más viejo al más nuevo (plan 2026-09-09, D8). */
export interface WarehouseStockLot {
  costPrice: number;
  quantity: number;
}

/** Maestro de almacén — soft-delete vía `isActive`. */
export interface Warehouse extends AuditableBaseModel {
  id: string;
  name: string;
}

/** Stock de un producto en un almacén. Único por `(warehouseId, productId)`. */
export interface WarehouseStockLevel {
  id: string;
  warehouseId: string;
  productId: string;
  /** Solo muta vía `recordMovement` (invariante del modelo de referencia). */
  onHand: number;
  /**
   * Promedio ponderado de los lotes restantes (valor de display, F1b) — se
   * recalcula en cada mutación (plan 2026-09-09, D8). Los niveles legacy sin
   * `lots` equivalen a un único lote sintético a este costo.
   */
  costPrice: number;
  /** Lotes FIFO con costo exacto. Ausente en niveles legacy (D8: lote sintético). */
  lots?: WarehouseStockLot[];
  createdDate: Date;
  updatedDate?: Date;
}

/** Movimiento de almacén — log append-only corregible solo vía reversa (D1). */
export interface WarehouseStockMovement {
  id: string;
  /** Almacén origen (sale_out/transfer_out) o destino (purchase_in/transfer_in). */
  warehouseId: string;
  productId: string;
  type: WarehouseMovementType;
  /** Magnitud positiva, round2 (decisión #7). */
  quantity: number;
  /**
   * Costo unitario de la transacción (decisión: movimientos sin cambio de costo).
   * `purchase_in` → costo real de compra; `sale_out` → promedio ponderado vigente;
   * transferencias → costo propagado del origen. Permite reconstruir el valor
   * total como Σ(costPrice × quantity) con signo (entradas +, salidas −).
   * Ausente en datos previos al cambio (fallback al nivel).
   */
  costPrice?: number;
  /** Texto libre OPCIONAL en todos los tipos (decisión #6). */
  reason: string | null;
  createdDate: Date;
  createdByName: string;
  /** transfer_out → destino. */
  toWarehouseId?: string;
  /** transfer_in → origen. */
  fromWarehouseId?: string;
  /**
   * Costo EXACTO del lote que esta fila movió (plan 2026-09-09, D8). Ausente
   * solo en filas legacy anteriores al modelo de lotes.
   */
  costPrice?: number;
  /** reversal → movimiento original que esta fila compensa (D7a). */
  reversalOfMovementId?: string;
  /**
   * sale_out → entrada de tienda creada (enlace 1:1 por fila, D11). Cada fila
   * de salida multi-lote enlaza exactamente una entrada.
   */
  inventoryEntryId?: string;
  /** reversal de sale_out → entrada de tienda restaurada/eliminada (D11). */
  reversalInventoryEntryId?: string;
}
