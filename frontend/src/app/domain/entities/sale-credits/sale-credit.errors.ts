import { BaseError } from "src/app/_services/_models/base.model";

export class SaleCreditErrors {
    static NotExists: BaseError = {
        code: "SaleCredit.NotExists",
        description: `El gasto no existe.`
    };
}