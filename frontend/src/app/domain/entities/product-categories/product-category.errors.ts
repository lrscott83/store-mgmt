import { BaseError } from "src/app/_services/_models/base.model";

export class ProductCategoryErrors {
    // static NameExists(name: string): string {
    //     return `El nombre de la categoría '${name}' ya existe`;
    // }
    static NameExists: BaseError = {
            code: "ProductCategory.NameExists",
            description: `El nombre de la categoría ya existe.`
    };
    static NotExists: BaseError = {
        code: "ProductCategory.NotExists",
        description: `La categoría no existe.`
    };
}