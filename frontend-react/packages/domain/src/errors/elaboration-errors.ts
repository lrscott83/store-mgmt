import type { BaseError } from '../models/base';

/**
 * Errors for the Elaboration module's production flow. Mirrors the
 * `WarehouseErrors`/`ExchangeRateErrors` convention: hardcoded neutral Spanish
 * description, English `code`.
 */
export const ElaborationErrors = {
  InsufficientStock: {
    code: 'Elaboration.InsufficientStock',
    description: 'No hay suficiente stock de un insumo para confirmar la elaboración.',
  },
  WarehouseNotExists: {
    code: 'Elaboration.WarehouseNotExists',
    description: 'El almacén de la elaboración no existe.',
  },
} as const satisfies Record<string, BaseError>;

/**
 * Builds the `ElaborationInsufficientStock` error naming the product, the
 * available quantity and the needed quantity (the service cannot know these
 * values until runtime).
 */
export function elaborationInsufficientStockError(
  productName: string,
  available: number,
  needed: number,
): BaseError {
  return {
    code: ElaborationErrors.InsufficientStock.code,
    description: `No hay suficiente stock de ${productName}: disponible ${available}, necesario ${needed}.`,
  };
}
