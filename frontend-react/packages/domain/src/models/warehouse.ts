import type { AuditableBaseModel } from './base';
import type { Currency } from '../enums';

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

/**
 * Tipos de movimiento en v1 (sin `adjustment_*` — decisión #2) + reversa
 * (plan 2026-09-09, D7a) + the two Elaboration-module movements:
 * `consumption_out` (ingredient consumed by an elaboration) and
 * `elaboration_in` (finished good produced).
 */
export type WarehouseMovementType =
  | 'purchase_in'
  | 'sale_out'
  | 'transfer_in'
  | 'transfer_out'
  | 'reversal'
  | 'consumption_out'
  | 'elaboration_in';

/** Lote de stock con costo exacto — el consumo es FIFO del más viejo al más nuevo (plan 2026-09-09, D8). */
export interface WarehouseStockLot {
  costPrice: number;
  quantity: number;
/** Moneda de `costPrice` (plan 2026-09-16). Ausente = CUP (DEFAULT_CURRENCY). */
  currency?: Currency;
  /**
   * Compra que originó la tanda (plan 2026-09-16, A4). Opcional para
   * compatibilidad con datos anteriores — la reversa lo usa para localizar
   * la tanda exacta y solo usa el costo como fallback legacy.
   */
  lotOriginMovementId?: string;
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
  /** Moneda de `costPrice` y de los lotes (plan 2026-09-16). Ausente = CUP. */
  currency?: Currency;
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
   * Costo EXACTO del lote que esta fila movió (plan 2026-09-09, D8). Ausente
   * solo en filas legacy anteriores al modelo de lotes (fallback al nivel).
   */
  costPrice?: number;
  /** Moneda de `costPrice` (plan 2026-09-16). Ausente = CUP (DEFAULT_CURRENCY). */
  currency?: Currency;
  /** Texto libre OPCIONAL en todos los tipos (decisión #6). */
  reason: string | null;
  createdDate: Date;
  createdByName: string;
  /** transfer_out → destino. */
  toWarehouseId?: string;
  /** transfer_in → origen. */
  fromWarehouseId?: string;
  /** sale_out → id de la tienda destino. El nombre se resuelve con user.storeList (multi-tienda). */
  toStoreId?: string;
  /** reversal → movimiento original que esta fila compensa (D7a). */
  reversalOfMovementId?: string;
  /**
   * sale_out → entrada de tienda creada (enlace 1:1 por fila, D11). Cada fila
   * de salida multi-lote enlaza exactamente una entrada.
   */
  inventoryEntryId?: string;
  /** reversal de sale_out → entrada de tienda restaurada/eliminada (D11). */
  reversalInventoryEntryId?: string;
  /**
   * Compra (`purchase_in`) que originó el lote consumido por esta fila
   * (plan 2026-09-16, Fase 3). Solo se escribe en `sale_out` cuando el lote
   * tocado traía `lotOriginMovementId`; es la referencia determinista
   * `compra → salida` que usa la propagación de costo. Opcional para
   * compatibilidad con filas anteriores — sin ella se cae al fallback por costo.
   */
  lotOriginMovementId?: string;
}
