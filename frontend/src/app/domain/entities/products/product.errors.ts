import { BaseError } from 'src/app/_services/_models/base.model';

export class ProductErrors {
  static NameExists: BaseError = {
    code: 'Product.NameExists',
    description: `El nombre del producto ya existe.`
  };
  static BarcodeExists: BaseError = {
    code: 'Product.BarcodeExists',
    description: `El código de barras ya está asociado a otro producto.`
  };
  static NotExists: BaseError = {
    code: 'Product.NotExists',
    description: `El producto no existe.`
  };
  static ProductNotAvailable: BaseError = {
    code: 'Product.ProductNotAvailable',
    description: `El producto no está disponible en el inventario.`
  };
  static ProductQuantityNotAvailable: BaseError = {
    code: 'Product.ProductQuantityNotAvailable',
    description: `La cantidad del producto no está disponible en el inventario.`
  };
  static Inactive: BaseError = {
    code: 'Product.Inactive',
    description: `El producto no está activo.`
  };
  static ProductNotAvailableToSale: BaseError = {
    code: 'Product.ProductNotAvailableToSale',
    description: `El producto no está disponible para la venta.`
  };
}
