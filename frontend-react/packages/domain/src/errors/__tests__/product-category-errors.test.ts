import { describe, expect, it } from 'vitest';
import { ProductCategoryErrors } from '../product-category-errors';

// 1:1 port of Angular's
// frontend/src/app/domain/entities/product-categories/product-category.errors.ts —
// hardcoded Spanish literals there (not i18n keys), byte-identical here.
describe('ProductCategoryErrors — 1:1 port of Angular product-category.errors.ts', () => {
  it('NameExists', () => {
    expect(ProductCategoryErrors.NameExists).toEqual({
      code: 'ProductCategory.NameExists',
      description: 'El nombre de la categoría ya existe.',
    });
  });

  it('NotExists', () => {
    expect(ProductCategoryErrors.NotExists).toEqual({
      code: 'ProductCategory.NotExists',
      description: 'La categoría no existe.',
    });
  });
});
