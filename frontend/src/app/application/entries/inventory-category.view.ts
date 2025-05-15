import { InventoryProductView } from './inventory-product-view';

export interface InventoryCategoryView {
    categoryId: string;
    categoryName: string;
    totalQuantity: number;
    totalCostPrice: number;
    products: InventoryProductView[];
}