import { TypeData } from "./type-data";

export enum PaymentType {
    Efectivo = 1,
    Tarjeta = 2,
    Zelle = 3,
}

export class PaymentTypeUtils {
    static getPaymentTypes(): TypeData[] {
        return Object.keys(PaymentType)
            .filter(key => isNaN(Number(key)))
            .map(key => ({
                label: key,
                value: PaymentType[key as keyof typeof PaymentType]
            }));
    }

    static getPaymentTypeText(paymentType: PaymentType): string {
        return PaymentTypeUtils.getPaymentTypes()
            .find(type => type.value === paymentType)
            ?.label;
    }

    static getPaymentTypeIcon(paymentType: PaymentType): string {
        switch (paymentType) {
            case PaymentType.Efectivo:
                return "bi-cash-stack";
            case PaymentType.Tarjeta:
                return "bi-credit-card";
            case PaymentType.Zelle:
                return "bi-phone";
            default:
                return "bi-currency-dollar";
        }
    }
}