import { ProductCartItemsView } from './product-cart-items.view';

export interface CategoryCartItemsView {
    id: string;
    name: string;
    order: number;
    total: number;
    itemsCount: number;
    productItems: ProductCartItemsView[];
}