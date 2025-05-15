import { AuditableBaseModel } from "src/app/_services/_models/base.model";
import { OwnerStoreModule } from "./owner-store-module.model";

export interface Owner extends AuditableBaseModel {
    id: string;
    userId: string;
    fullName: string;
    cellPhone: string;
    email: string;
    description: string;
    guest: boolean;
    storeModules: OwnerStoreModule[];
    reSellerName: string;
}