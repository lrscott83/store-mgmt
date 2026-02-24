import { Injectable, Inject } from '@angular/core';
import { HttpClient } from "@angular/common/http";
import { BaseService } from '../base.service';
import { Observable, BehaviorSubject } from 'rxjs';
import { CartItem } from '../_models/order/cart-item.model';
import { CartData } from '../_models/order/cart-data.model';
import { BaseResponseModel } from '../_models/base.model';
import { Product } from 'src/app/domain/entities/products/product.model';
import { ProductErrors } from 'src/app/domain/entities/products/product.errors';
import { InventoryOfflineService } from 'src/app/application/entries/inventory-offline.service';
import { Result } from 'src/app/domain/commons/result';
import { OrderType } from 'src/app/domain/entities/orders/order.model';
import { ProductService } from 'src/app/domain/interfaces/product.service';
import { PRODUCT_SERVICE } from '../tokens';

@Injectable({
    providedIn: "root"
})

export abstract class ShoppingCartService extends BaseService<CartItem> {

    private _cartData$: BehaviorSubject<CartData> = new BehaviorSubject<CartData>(this.getDefaultCartData());
    private orderType: OrderType = OrderType.Normal;
    private orderDescription: string;

    private getDefaultCartData(): CartData {
        return {
            items: [],
            itemsCount: 0,
            total: 0,
        };
    }

    constructor(@Inject(HttpClient) http, @Inject(PRODUCT_SERVICE) private productService: ProductService, private inventoryService: InventoryOfflineService) {
        super(http);
    }

    updateOrderDetails(orderType: OrderType = OrderType.Normal, orderDescription:string) {
        this.orderType = orderType;
        this.orderDescription = orderDescription;
    }

    getCartData$(): Observable<CartData> {
        return this._cartData$.asObservable();
    }

    getCartItems(): CartItem[] {
        return this.getCartData().items;
    }

    getOrderType(): OrderType {
        return this.orderType;
    }

    getOrderDescription(): string {
        return this.orderDescription;
    }

    private getCartData(): CartData {
        return this._cartData$.value;
    }

    addCartItem(orderType: OrderType, productId: string, quantity: number, price: number): Promise<BaseResponseModel<boolean>> {
        return new Promise((resolve, reject) => {
            this.productService.getProductById(productId)
                .subscribe(response => {
                    if (response.succeeded)
                        resolve(this.addItem(orderType, response.data, quantity, price));
                    else {
                        resolve(this.Failure(response.errors));
                    }
                }, error => {
                    resolve(this.Failure(error));
                });
        });
    }

    increaseCartItem(productId: string): Promise<BaseResponseModel<boolean>> {
        return this.addCartItem(this.orderType, productId, 1, null);
    }

    decreaseCartItem(productId: string): Promise<BaseResponseModel<boolean>> {
        return this.addCartItem(this.orderType, productId, -1, null);
    }

    private addItem(orderType: OrderType, product: Product, quantity: number, price: number): BaseResponseModel<boolean> {
        if (!product) {
            // if (!cartItem) {
            //     this.removeCartItem(product.id);
            //     return this.Failure([ShoppingCartErrors.productOutOfStock(product.name)]);
            // }
            return this.Failure([ProductErrors.NotExists]);
        }

        const itemAddedQty: number = this.getCartItemQuantity(product.id);
        const availableResult: Result = this.inventoryService.hasAvailableProductToSale(product.id, quantity + itemAddedQty);
        if (!availableResult.succeeded)
            return this.Failure([availableResult.errors && availableResult.errors.length > 0
                ? availableResult.errors[0]
                : ProductErrors.ProductNotAvailable]);

        const items: CartItem[] = [...this.getCartItems()];
        const cartItem: CartItem = this.findItem(items, product.id);
        if (cartItem) {
            if (cartItem.quantity + quantity > 0)
                cartItem.quantity = cartItem.quantity + quantity;
            else
                return this.removeCartItem(product.id);
        } else {
            this.orderType = orderType;
            // TODO. If order types are differents then confirm dialog should be shown.
            const qty = quantity > 0 ? quantity : 1;
            items.push({
                productId: product.id,
                name: product.name,
                quantity: qty,
                price: price,
            });
        }

        this.setNextCartData(items);
        return this.Success(true);
    }

    private setNextCartData(items: CartItem[]) {
        this._cartData$.next({
            items: items,
            itemsCount: this.getItemsCount(),
            total: this.getCartTotal(),
        });
    }

    private removeCartItem(productId: string): BaseResponseModel<boolean> {
        const items: CartItem[] = this.getCartItems()
            .filter(item => item.productId !== productId)
        this.setNextCartData(items);
        return this.Success(true);
    }

    private findItem(items: CartItem[], productId: string) {
        return items.find(i => i.productId === productId);
    }

    getCartTotal(): number {
        let totalSum: number = 0;
        this.getCartItems().forEach(
            (item) => (totalSum += item.price * item.quantity)
        );
        return totalSum;
    }

    getItemsCount(): number {
        let itemsCount: number = 0;
        this.getCartItems().forEach(
            (item) => (itemsCount += item.quantity)
        );
        return itemsCount;
    }

    clearCart() {
        this._cartData$.next(this.getDefaultCartData());
        this.orderType = OrderType.Normal;
        this.orderDescription = "";
    }

    getCartItemQuantity(productId: string): number {
        let itemsCount: number = 0;
        this.getCartItems()
            .filter(i => i.productId === productId)
            .forEach(
                (item) => (itemsCount += item.quantity)
            );
        return itemsCount;
    }
}