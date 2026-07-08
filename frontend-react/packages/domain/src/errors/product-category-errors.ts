import type { BaseError } from '../models/base';

/**
 * 1:1 port of Angular's `ProductCategoryErrors`
 * (frontend/src/app/domain/entities/product-categories/product-category.errors.ts). Angular
 * hardcodes the Spanish description literals directly in this class (not routed through
 * i18n) — ported verbatim, byte-identical.
 */
export const ProductCategoryErrors = {
  NameExists: {
    code: 'ProductCategory.NameExists',
    description: 'El nombre de la categoría ya existe.',
  },
  NotExists: {
    code: 'ProductCategory.NotExists',
    description: 'La categoría no existe.',
  },
} as const satisfies Record<string, BaseError>;
