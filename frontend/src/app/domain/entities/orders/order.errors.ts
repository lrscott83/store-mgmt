import { BaseError } from "src/app/_services/_models/base.model";

export class OrderErrors {
    static NotExists: BaseError = {
            code: "Order.NotExists",
            description: 'La orden no existe'
    };
}