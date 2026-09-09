import type { BaseError, WarehouseMovementType, WarehouseStockLot } from '@store-mgmt/domain';
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
    slices.push({ costPrice: lot.costPrice, quantity: taken });
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

export type { BaseError };
