import { Module } from "../modules/module.model";

export interface Store {
    id: string;
    name: string;
    displayName: string;
    ownerId: string;
    ownerName: string;
    address: string;
    description: string;
    approved: boolean;
    paymentStartDate: string | null;
    modules: Module[];
    isActive: boolean;
}