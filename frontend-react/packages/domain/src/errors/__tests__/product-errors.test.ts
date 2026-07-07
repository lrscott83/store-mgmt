import { describe, expect, it } from 'vitest';
import { ProductErrors } from '../product-errors';

// 1:1 port of Angular's frontend/src/app/domain/entities/products/product.errors.ts —
// hardcoded Spanish literals there (not i18n keys), byte-identical here.
describe('ProductErrors — 1:1 port of Angular product.errors.ts', () => {
  it('NotExists', () => {
    expect(ProductErrors.NotExists).toEqual({ code: 'Product.NotExists', description: 'El producto no existe.' });
  });

  it('Inactive', () => {
    expect(ProductErrors.Inactive).toEqual({ code: 'Product.Inactive', description: 'El producto no está activo.' });
  });

  it('ProductNotAvailableToSale', () => {
    expect(ProductErrors.ProductNotAvailableToSale).toEqual({
      code: 'Product.ProductNotAvailableToSale',
      description: 'El producto no está disponible para la venta.',
    });
  });

  it('ProductNotAvailable', () => {
    expect(ProductErrors.ProductNotAvailable).toEqual({
      code: 'Product.ProductNotAvailable',
      description: 'El producto no está disponible en el inventario.',
    });
  });

  it('ProductQuantityNotAvailable', () => {
    expect(ProductErrors.ProductQuantityNotAvailable).toEqual({
      code: 'Product.ProductQuantityNotAvailable',
      description: 'La cantidad del producto no está disponible en el inventario.',
    });
  });

  it('NameExists', () => {
    expect(ProductErrors.NameExists).toEqual({
      code: 'Product.NameExists',
      description: 'El nombre del producto ya existe.',
    });
  });

  it('BarcodeExists', () => {
    expect(ProductErrors.BarcodeExists).toEqual({
      code: 'Product.BarcodeExists',
      description: 'El código de barras ya está asociado a otro producto.',
    });
  });
});
