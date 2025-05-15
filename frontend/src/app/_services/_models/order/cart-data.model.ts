import { CartItem } from './cart-item.model';

export interface CartData {
    items: CartItem[];
    itemsCount: number;
    total: number;
}