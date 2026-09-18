import type { BaseError } from '../models/base';

/**
 * Errors for the Elaboration module's recipes (BoM). Mirrors the
 * `WarehouseErrors`/`ExchangeRateErrors` convention: hardcoded neutral Spanish
 * description, English `code`.
 */
export const RecipeErrors = {
  ProductNotExists: {
    code: 'Recipe.ProductNotExists',
    description: 'El producto de la receta no existe.',
  },
  DuplicateForProduct: {
    code: 'Recipe.DuplicateForProduct',
    description: 'Ya existe una receta activa para este producto.',
  },
  EmptyComponents: {
    code: 'Recipe.EmptyComponents',
    description: 'La receta debe tener al menos un componente.',
  },
  InvalidQty: {
    code: 'Recipe.InvalidQty',
    description:
      'La cantidad debe ser mayor que cero y el porcentaje de merma debe estar entre 0 y 100.',
  },
} as const satisfies Record<string, BaseError>;
