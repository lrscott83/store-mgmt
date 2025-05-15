import { InventoryEntryCost } from "./inventory-item-cost.view";

export interface InventoryEntriesView {
    productId: string;
    productName: string;
    productAvailable: number;
    availableEntries: InventoryEntryCost[];
}