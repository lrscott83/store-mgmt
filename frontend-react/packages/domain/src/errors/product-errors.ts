import type { BaseError } from '../models/base';

/**
 * 1:1 port of Angular's `ProductErrors`
 * (frontend/src/app/domain/entities/products/product.errors.ts). Angular hardcodes
 * the Spanish description literals directly in this class (not routed through i18n) —
 * ported verbatim, byte-identical.
 */
export const ProductErrors = {
  NameExists: {
    code: 'Product.NameExists',
    description: 'El nombre del producto ya existe.',
  },
  BarcodeExists: {
    code: 'Product.BarcodeExists',
    description: 'El código de barras ya está asociado a otro producto.',
  },
  NotExists: {
    code: 'Product.NotExists',
    description: 'El producto no existe.',
  },
  ProductNotAvailable: {
    code: 'Product.ProductNotAvailable',
    description: 'El producto no está disponible en el inventario.',
  },
  ProductQuantityNotAvailable: {
    code: 'Product.ProductQuantityNotAvailable',
    description: 'La cantidad del producto no está disponible en el inventario.',
  },
  Inactive: {
    code: 'Product.Inactive',
    description: 'El producto no está activo.',
  },
  ProductNotAvailableToSale: {
    code: 'Product.ProductNotAvailableToSale',
    description: 'El producto no está disponible para la venta.',
  },
} as const satisfies Record<string, BaseError>;
