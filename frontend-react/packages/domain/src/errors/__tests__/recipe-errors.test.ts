import { describe, expect, it } from 'vitest';
import { RecipeErrors } from '../recipe-errors';

describe('RecipeErrors', () => {
  it('ProductNotExists carries the Recipe.ProductNotExists code', () => {
    expect(RecipeErrors.ProductNotExists).toEqual({
      code: 'Recipe.ProductNotExists',
      description: 'El producto de la receta no existe.',
    });
  });

  it('DuplicateForProduct carries the Recipe.DuplicateForProduct code', () => {
    expect(RecipeErrors.DuplicateForProduct).toEqual({
      code: 'Recipe.DuplicateForProduct',
      description: 'Ya existe una receta activa para este producto.',
    });
  });

  it('EmptyComponents carries the Recipe.EmptyComponents code', () => {
    expect(RecipeErrors.EmptyComponents).toEqual({
      code: 'Recipe.EmptyComponents',
      description: 'La receta debe tener al menos un componente.',
    });
  });

  it('InvalidQty carries the Recipe.InvalidQty code', () => {
    expect(RecipeErrors.InvalidQty).toEqual({
      code: 'Recipe.InvalidQty',
      description:
        'La cantidad debe ser mayor que cero y el porcentaje de merma debe estar entre 0 y 100.',
    });
  });

  it('all entries expose code and description', () => {
    for (const [key, error] of Object.entries(RecipeErrors)) {
      expect(key.length).toBeGreaterThan(0);
      expect(error.code.startsWith('Recipe.')).toBe(true);
      expect(error.description.length).toBeGreaterThan(0);
    }
  });
});
