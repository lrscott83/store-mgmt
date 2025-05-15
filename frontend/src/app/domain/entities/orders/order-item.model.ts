import { InventoryEntryCost } from "src/app/application/entries/inventory-item-cost.view";

export interface OrderItem {
    productId: string;
    productName: string;
    categoryId: string;
    categoryName: string;
    name: string;
    quantity: number;
    price: number;
    productBusinessId: string;
    productCosts: InventoryEntryCost[];
    order: number;
}