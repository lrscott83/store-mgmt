import { AuditableBaseModel } from "src/app/_services/_models/base.model";
import { PaymentType } from "../../commons/payment-type";

export interface SaleCredit extends AuditableBaseModel {
    id: string;
    orderId: string;
    client: string;
    total: number;
    date: Date;
    paid: number;
    isPaid: boolean;
    paidDate: Date;
    paidType: PaymentType;
    note: string;
}