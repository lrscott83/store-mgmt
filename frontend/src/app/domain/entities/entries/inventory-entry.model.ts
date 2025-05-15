import { AuditableBaseModel } from "src/app/_services/_models/base.model";

export interface InventoryEntry extends AuditableBaseModel {
    id: string;
    productId: string;
    categoryId: string;
    quantity: number;
    available: number;
    costPrice: number;
    date: Date;
    order: number;
}