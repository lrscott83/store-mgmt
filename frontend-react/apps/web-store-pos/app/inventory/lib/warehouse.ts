import type {
  BaseError,
  Order,
  WarehouseMovementType,
  WarehouseStockLevel,
  WarehouseStockLot,
  WarehouseStockMovement,
} from '@store-mgmt/domain';
import { Result, WarehouseErrors } from '@store-mgmt/domain';
import { round2 } from '~/shared/lib/money';

/**
 * Almacenes — helpers puros (sin I/O ni estado), portados del modelo de
 * referencia (`movementDirection`/`applyMovement` en
 * `packages/domain/src/inventory/*` de ECommerce templates):
 * - `movementDirection(type)`: `_in` = +1, `_out` = -1.
 * - `applyMovement(level, type, quantity)`: siguiente `onHand`; lanza
 *   `InsufficientStock` si quedaría negativo (las cantidades aceptan decimales
 *   con round2 — decisión #7).
 * - `computeWeightedCost(current, quantity, costPrice)`: promedio ponderado
 *   por unidad (decisión #1).
 * - `validateMovementQuantity(quantity)`: entero/decimal > 0 (decisión #7).
 *
 * Plan 2026-09-09 (lotes FIFO exactos + reversa, D8-D12):
 * - `splitByFifoLots(lots, quantity)`: divide una cantidad sobre los lotes del
 *   más viejo al más nuevo, round2 por tramo. Lanza `InsufficientStock` si los
 *   lotes no cubren la cantidad.
 * - `displayCost(lots)`: promedio ponderado de los lotes restantes (valor de
 *   display F1b — los números pineados de los E2E no cambian).
 * - `synthesizeLotFromLevel(level)`: nivel legacy sin `lots` → un único lote
 *   sintético al costo promedio vigente (D8).
 * - `reversalDirection(originalType)`: delta inverso del tipo original.
 * - `validateReversalQuantity(quantity)`: misma regla que los movimientos.
 *
 * Plan 2026-09-16 (edición de movimientos):
 * - `remainingPurchaseUnits(level, movement)`: unidades que QUEDAN de una
 *   compra — extracción exacta del cálculo de `reversePurchase` (A1).
 */

export function movementDirection(type: WarehouseMovementType): 1 | -1 {
  return type.endsWith('_out') ? -1 : 1;
}

export function applyMovement(
  level: { onHand: number },
  type: WarehouseMovementType,
  quantity: number,
): { onHand: number } {
  const nextOnHand = round2(level.onHand + movementDirection(type) * quantity);
  if (nextOnHand < 0) {
    throw new Error(WarehouseErrors.InsufficientStock.description);
  }
  return { onHand: nextOnHand };
}

export function computeWeightedCost(
  current: { onHand: number; costPrice: number },
  quantity: number,
  costPrice: number,
): number {
  const nextOnHand = current.onHand + quantity;
  if (nextOnHand === 0) return 0;
  return round2((current.onHand * current.costPrice + quantity * costPrice) / nextOnHand);
}

export function validateMovementQuantity(quantity: number): Result {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return Result.Failure([WarehouseErrors.QuantityInvalid]);
  }
  return Result.Success();
}

/** Divide `quantity` sobre los lotes FIFO del más viejo al más nuevo (D8). */
export function splitByFifoLots(
  lots: WarehouseStockLot[],
  quantity: number,
): WarehouseStockLot[] {
  if (quantity <= 0) return [];

  const slices: WarehouseStockLot[] = [];
  let remaining = round2(quantity);
  let totalAvailable = 0;
  for (const lot of lots) totalAvailable = round2(totalAvailable + lot.quantity);
  if (totalAvailable + 1e-9 < remaining) {
    throw new Error(WarehouseErrors.InsufficientStock.description);
  }

  for (const lot of lots) {
    if (remaining <= 0) break;
    const taken = round2(Math.min(remaining, lot.quantity));
    if (taken <= 0) continue;
    slices.push({
      costPrice: lot.costPrice,
      quantity: taken,
      ...(lot.lotOriginMovementId !== undefined
        ? { lotOriginMovementId: lot.lotOriginMovementId }
        : {}),
    });
    remaining = round2(remaining - taken);
  }
  if (remaining > 0) {
    // Cobertura con tolerancia de redondeo agotada — imposible tras la validación,
    // pero se mantiene el contrato de InsufficientStock (defensa en profundidad).
    throw new Error(WarehouseErrors.InsufficientStock.description);
  }
  return slices;
}

/** Promedio ponderado de los lotes restantes — el costo de display (F1b, D8). */
export function displayCost(lots: WarehouseStockLot[]): number {
  let totalQty = 0;
  let totalCost = 0;
  for (const lot of lots) {
    totalQty = round2(totalQty + lot.quantity);
    totalCost = round2(totalCost + lot.quantity * lot.costPrice);
  }
  if (totalQty === 0) return 0;
  return round2(totalCost / totalQty);
}

/** Nivel legacy sin `lots` → un único lote sintético al costo promedio vigente (D8). */
export function synthesizeLotFromLevel(level: {
  onHand: number;
  costPrice: number;
}): WarehouseStockLot[] {
  if (level.onHand <= 0) return [];
  return [{ costPrice: level.costPrice, quantity: round2(level.onHand) }];
}

/**
 * Unidades de una COMPRA que quedan vivas en el almacén (plan 2026-09-16, A1).
 *
 * Es la MISMA cuenta que usa `WarehouseOfflineService.reversePurchase` para saber
 * cuánto revertir; está aquí para que la ruta pueda precargar el tope de edición
 * sin duplicar la regla (fuente única de verdad).
 *
 * - Fila SIN costo: FIFO hasta el `onHand` del nivel (A9b).
 * - Cantidades: por referencia `lotOriginMovementId`; si ninguna tanda la trae
 *   (datos viejos), por coincidencia de costo.
 */
export function remainingPurchaseUnits(
  level: WarehouseStockLevel | undefined,
  movement: { id: string; quantity: number; costPrice?: number },
): number {
  if (!level || level.onHand <= 0) return 0;
  if (movement.costPrice === undefined) {
    return round2(Math.min(movement.quantity, level.onHand));
  }
  const lots = level.lots ?? synthesizeLotFromLevel(level);
  const useOrigin = lots.some((l) => l.lotOriginMovementId !== undefined);
  const remaining = (useOrigin
    ? lots.filter((l) => l.lotOriginMovementId === movement.id)
    : lots.filter((l) => l.costPrice === movement.costPrice)
  ).reduce((sum, l) => round2(sum + l.quantity), 0);
  return round2(Math.min(movement.quantity, Math.max(0, remaining)));
}

/** Delta inverso del tipo original para una reversa (D7a). */
export function reversalDirection(
  originalType: Exclude<WarehouseMovementType, 'reversal'>,
): 1 | -1 {
  return movementDirection(originalType) === 1 ? -1 : 1;
}

/** Misma regla de cantidad para las reversas (D7a/decisión #7). */
export function validateReversalQuantity(quantity: number): Result {
  return validateMovementQuantity(quantity);
}

/**
 * Atribución de las filas `sale_out` a una COMPRA (plan 2026-09-16, Fase 3).
 * Puro (sin I/O): recibe los movimientos y un predicado `isReversed`.
 */
export interface PurchaseOutflowAttribution {
  succeeded: boolean;
  /** Filas de salida a tienda vivas atribuidas a la compra. */
  saleOutMovements: WarehouseStockMovement[];
  /** true = no se puede decidir (varias compras al mismo costo sin referencia). */
  ambiguous: boolean;
}

/**
 * Devuelve las filas `sale_out` vivas atribuibles a `purchase`:
 * 1. Ruta determinista: `m.lotOriginMovementId === purchase.id` (campo nuevo).
 * 2. Fallback legacy por costo EXACTO — solo si ninguna fila trae referencia y
 *    no hay más de una compra viva del mismo producto a ese costo (si la hay,
 *    la atribución es ambigua y se bloquea: `PurchasePropagationAmbiguous`).
 */
export function attributePurchaseOutflow(
  purchase: Pick<WarehouseStockMovement, 'id' | 'productId' | 'costPrice'>,
  movements: WarehouseStockMovement[],
  isReversed: (movementId: string) => boolean,
): PurchaseOutflowAttribution {
  const liveSaleOuts = movements.filter(
    (m) => m.type === 'sale_out' && m.productId === purchase.productId && !isReversed(m.id),
  );

  const referenced = liveSaleOuts.filter((m) => m.lotOriginMovementId === purchase.id);
  if (referenced.length > 0) {
    return { succeeded: true, saleOutMovements: referenced, ambiguous: false };
  }

  if (purchase.costPrice === undefined) {
    return { succeeded: true, saleOutMovements: [], ambiguous: false };
  }

  const livePurchasesAtCost = movements.filter(
    (m) =>
      m.type === 'purchase_in' &&
      m.productId === purchase.productId &&
      m.costPrice !== undefined &&
      round2(m.costPrice) === round2(purchase.costPrice as number) &&
      !isReversed(m.id),
  );
  if (livePurchasesAtCost.length > 1) {
    return { succeeded: false, saleOutMovements: [], ambiguous: true };
  }

  const legacy = liveSaleOuts.filter(
    (m) =>
      m.costPrice !== undefined &&
      round2(m.costPrice) === round2(purchase.costPrice as number),
  );
  return { succeeded: true, saleOutMovements: legacy, ambiguous: false };
}

/** Impacto de una corrección de costo sobre las órdenes (Fase 3). */
export interface PurchaseOrderImpact {
  /**
   * Órdenes ACTIVAS afectadas — solo estas se actualizan (decisión ratificada
   * 2026-09-20, #2). Las desactivadas se cuentan pero se dejan intactas.
   */
  activeOrders: number;
  /** Órdenes desactivadas con líneas afectadas (excluidas del update). */
  deactivatedOrders: number;
  /** Unidades vendidas (en órdenes activas) que referencian las entradas dadas. */
  soldUnits: number;
}

/**
 * Cuenta las órdenes afectadas por una corrección de costo, sin mutarlas.
 * Puro (sin I/O): recibe las órdenes y el conjunto de `inventoryId` de las
 * entradas de tienda a corregir.
 */
export function summarizeOrderImpact(
  orders: Order[],
  inventoryIds: ReadonlySet<string>,
): PurchaseOrderImpact {
  let activeOrders = 0;
  let deactivatedOrders = 0;
  let soldUnits = 0;
  for (const order of orders) {
    let touched = false;
    let quantity = 0;
    for (const item of order.orderItems) {
      for (const cost of item.productCosts) {
        if (!inventoryIds.has(cost.inventoryId)) continue;
        touched = true;
        quantity += cost.quantity;
      }
    }
    if (!touched) continue;
    if (order.isActive) {
      activeOrders += 1;
      soldUnits = round2(soldUnits + quantity);
    } else {
      deactivatedOrders += 1;
    }
  }
  return { activeOrders, deactivatedOrders, soldUnits };
}

export type { BaseError };
