import { AuditableBaseModel } from "src/app/_services/_models/base.model";

export interface Product  extends AuditableBaseModel {
    id: string;
    name: string;
    categoryId: string;
    categoryName: string;
    price: number;
    order: number;
    availableToSale: boolean;
    discountFromInvantory: boolean;
    businessId: string;
}