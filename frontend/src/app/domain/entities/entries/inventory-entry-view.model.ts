export interface InventoryEntryView {
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    costPrice: number;
    date: Date;
    isActive: boolean;
}