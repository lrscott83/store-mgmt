import type { BaseError, WarehouseMovementType } from '@store-mgmt/domain';
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
  if (!(quantity > 0) || Number.isNaN(quantity)) {
    return Result.Failure([WarehouseErrors.QuantityInvalid]);
  }
  return Result.Success();
}

export type { BaseError };