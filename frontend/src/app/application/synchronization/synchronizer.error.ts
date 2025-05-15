import { BaseError } from "src/app/_services/_models/base.model";

export class SynchronizerErrors {
    static ProductsUnexpectedError: BaseError = {
        code: "Synchronizer.ProductsUnexpectedError",
        description: `Ocurrió un error inesperado al sincronizar los productos.`
    };

    static CategoriesUnexpectedError: BaseError = {
        code: "Synchronizer.CategoriesUnexpectedError",
        description: `Ocurrió un error inesperado al sincronizar las categorias.`
    };

    static OrdersUnexpectedError: BaseError = {
        code: "Synchronizer.OrdersUnexpectedError",
        description: `Ocurrió un error inesperado al sincronizar las ventas.`
    };

    static InventoryUnexpectedError: BaseError = {
        code: "Synchronizer.InventoryUnexpectedError",
        description: `Ocurrió un error inesperado al sincronizar el inventario.`
    };
}