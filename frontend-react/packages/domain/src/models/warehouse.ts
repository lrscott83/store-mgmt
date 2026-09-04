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
 * - Los movimientos no se editan ni se borran (log de auditoría).
 */

/** Tipos de movimiento en v1 (sin `adjustment_*` — decisión #2). */
export type WarehouseMovementType =
  | 'purchase_in'
  | 'sale_out'
  | 'transfer_in'
  | 'transfer_out';

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
  /** Promedio ponderado por unidad (decisión #1). */
  costPrice: number;
  createdDate: Date;
  updatedDate?: Date;
}

/** Movimiento de almacén — log append-only (no se edita ni borra). */
export interface WarehouseStockMovement {
  id: string;
  /** Almacén origen (sale_out/transfer_out) o destino (purchase_in/transfer_in). */
  warehouseId: string;
  productId: string;
  type: WarehouseMovementType;
  /** Magnitud positiva, round2 (decisión #7). */
  quantity: number;
  /** Texto libre OPCIONAL en todos los tipos (decisión #6). */
  reason: string | null;
  createdDate: Date;
  createdByName: string;
  /** transfer_out → destino. */
  toWarehouseId?: string;
  /** transfer_in → origen. */
  fromWarehouseId?: string;
}