import { BaseError } from "src/app/_services/_models/base.model";

export class ProductErrors {
    // static NameExists(name: string): string {
    //     return `El nombre de la categoría '${name}' ya existe`;
    // }
    static NameExists: BaseError = {
        code: "Product.NameExists",
        description: `El nombre del producto ya existe.`
    };
    static NotExists: BaseError = { 
        code: "Product.NotExists", 
        description: `El producto no existe.` 
    };
    static ProductNotAvailable: BaseError = { 
        code: "Product.ProductNotAvailable", 
        description: `El producto no está disponible en el inventario.` 
    };
    static ProductQuantityNotAvailable: BaseError = { 
        code: "Product.ProductQuantityNotAvailable", 
        description: `La cantidad del producto no está disponible en el inventario.` 
    };
    static Inactive: BaseError = { 
        code: "Product.Inactive", 
        description: `El producto no está activo.` 
    };
    static ProductNotAvailableToSale: BaseError = { 
        code: "Product.ProductNotAvailableToSale", 
        description: `El producto no está disponible para la venta.` 
    };
}