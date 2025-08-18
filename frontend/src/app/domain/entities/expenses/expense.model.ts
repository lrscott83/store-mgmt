import { AuditableBaseModel } from "src/app/_services/_models/base.model";
import { TypeData } from "../../commons/type-data";
import { PaymentType } from "../../commons/payment-type";

export interface Expense extends AuditableBaseModel {
    id: string;
    type: ExpenseType;
    total: number;
    date: Date;
    paymentType: PaymentType;
    note: string;
}

export enum ExpenseType {
    Salario = 1,
    Transporte = 2,
    Alquiler = 3,
    Corriente = 4,
    Agua = 5,
    Comida = 6,
    Operaciones = 7,
    Viaje = 8,
    Divisa = 9,
    Impuesto = 10,
    Otro = 100
}

export class ExpenseTypeUtils {
    static getExpenseTypes(): TypeData[] {
        return Object.keys(ExpenseType)
            .filter(key => isNaN(Number(key)))
            .map(key => ({
                label: key,
                value: ExpenseType[key as keyof typeof ExpenseType]
            }));
    }

    static getExpenseTypeText(orderType: ExpenseType): string {
        // const entry = Object.entries(ExpenseType).find(([_, v]) => v === this.orderType);
        // return entry?.[0];
        return ExpenseTypeUtils.getExpenseTypes()
            .find(type => type.value === orderType)
            ?.label;
    }
}