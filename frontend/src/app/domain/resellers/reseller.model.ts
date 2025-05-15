import { AuditableBaseModel } from "src/app/_services/_models/base.model";

export interface ReSeller extends AuditableBaseModel {
    id: string;
    userId: string;
    fullName: string;
    percentDiscountPrice: number;
    discountPrice: number;
    cellPhone: string;
    email: string;
    description: string;
    guest: boolean;
}