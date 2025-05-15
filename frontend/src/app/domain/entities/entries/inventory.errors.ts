import { BaseError } from "src/app/_services/_models/base.model";

export class InventoryErrors {
    static EntryNotExists: BaseError = {
            code: "Inventory.EntryNotExists",
            description: 'La entrada no existe.'
    };
    static SaleExistsWithThisEntry: BaseError = {
        code: "Inventory.SaleExistsWithThisEntry",
        description: 'Existe una venta que corresponde con esta entrada.'
    };
    static SaleNotExistsWithThisEntry: BaseError = {
        code: "Inventory.SaleNotExistsWithThisEntry",
        description: 'No Existe una venta que corresponde con esta entrada.'
    };
    static ProductNotAvailable: BaseError = {
        code: "Inventory.ProductNotAvailable",
        description: 'El producto no está disponible'
    };
}