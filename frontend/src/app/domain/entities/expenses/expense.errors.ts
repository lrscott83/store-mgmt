import { BaseError } from "src/app/_services/_models/base.model";

export class ExpenseErrors {
    static NotExists: BaseError = {
        code: "Expense.NotExists",
        description: `El gasto no existe.`
    };
}