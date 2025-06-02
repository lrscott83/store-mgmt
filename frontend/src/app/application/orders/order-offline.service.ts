import { Injectable, Inject } from '@angular/core';
import { HttpClient } from "@angular/common/http";
import { Observable, of } from 'rxjs';
import { Guid } from 'guid-typescript';
import * as _moment from 'moment';
import { BaseService } from 'src/app/_services/base.service';
import { Order, OrderType } from 'src/app/domain/entities/orders/order.model';
import { ProductRepository } from '../products/product.repository';
import { AuthService } from 'src/app/_services/services.index';
import { ProductCategoryRepository } from '../categories/product-category.repository';
import { InventoryOfflineService } from '../entries/inventory-offline.service';
import { CartItem } from 'src/app/_services/_models/order/cart-item.model';
import { BaseResponseModel } from 'src/app/_services/_models/base.model';
import { OrderErrors } from 'src/app/domain/entities/orders/order.errors';
import { CategoryCartItemsView } from './category-cart-items.view';
import { OrderItem } from 'src/app/domain/entities/orders/order-item.model';
import { ProductCartItemsView } from './product-cart-items.view';
import { InventoryEntryCost } from '../entries/inventory-item-cost.view';
import { AuthorizationService } from 'src/app/_services/authorization/authorization.service';
import { UserModel } from 'src/app/_services/auth/_models/auth-user.model';
import { Result } from 'src/app/domain/commons/result';

@Injectable({
    providedIn: "root"
})

export class OrderOfflineService extends BaseService<Order> {

    private static USER_ORDERS_KEY: string = "lizoft.store-orders-";

    private lastUserOrdersKey: string;
    private orders: Order[] = null;

    constructor(@Inject(HttpClient) http, private productRepository: ProductRepository, private authService: AuthService, private categoryRepository: ProductCategoryRepository, private inventoryService: InventoryOfflineService, private authorizationService: AuthorizationService) {
        super(http);
    }

    createOrder(cartItems: CartItem[], type: OrderType, details: string): Observable<BaseResponseModel<boolean>> {
        const date: Date = new Date();
        var order: Order = {
            id: Guid.create().toString(),
            orderItems: this.createOrderItems(cartItems),
            total: this.getItemsTotal(cartItems),
            itemsCount: this.getItemsCount(cartItems),
            date: date,
            type: type,
            description: details,
            isActive: true,
            createdDate: date,
            //createdByName: this.authService.currentUserValue.login,
            createdByName: "admin",
            updatedDate: undefined,
            updatedByName: undefined,
        };
        this.getStorageOrders().push(order);
        this.setOrdersLocalStorage(this.orders);
        return this.Success$(true);
    }

    getOrderById(id: string): Order {
        return this.getStorageOrders().find(order => order.id === id);
    }

    getCategoryCartItemsViewObservable(date: Date): Observable<BaseResponseModel<CategoryCartItemsView[]>> {
        const categoryItemsView = this.getCategoryCartItemsView(date);
        return of(categoryItemsView);
    }

    getCategoryCartItemsView(date: Date): BaseResponseModel<CategoryCartItemsView[]> {
        // TODO. Que pasa si hay distinto precio y distinto categoryId ??
        // Quizas hacer los groupBy por todos los campos por si hay algun cambio.
        const storageCategories = this.categoryRepository.getProductCategories();
        let categoryItemsView: CategoryCartItemsView[] = [];
        const orderItemsArray = this.getActiveOrdersInDay(date).map(order => order.orderItems);
        const orderItems: OrderItem[] = this.flatMap(orderItemsArray);
        const categoryGroups: Map<string, OrderItem[]> = this.groupBy(orderItems, "categoryId");
        categoryGroups.forEach((categoryItems, key) => {
            const item = categoryItems[0];
            const productGroups: Map<string, OrderItem[]> = this.groupBy(categoryItems, "productId");
            const productItems: ProductCartItemsView[] = [];
            productGroups.forEach((products, key) => {
                const product = products[0];
                productItems.push({
                    name: product.name,
                    order: product.order,
                    total: this.getOrderItemsTotal(products),
                    itemsCount: this.getOrderItemsCount(products),
                    price: product.price,
                });
            });
            const storageCategory = storageCategories.find(c => c.id === item.categoryId);
            categoryItemsView.push({
                id: item.categoryId,
                name: item.categoryName,
                order: (storageCategory ? storageCategory.order : Number.MAX_VALUE),
                total: this.getOrderItemsTotal(categoryItems),
                itemsCount: this.getOrderItemsCount(categoryItems),
                productItems: productItems,
            });
        });
        return this.Success(categoryItemsView);
    }

    private getOrderItemsTotal(items: OrderItem[]): number {
        let totalSum: number = 0;
        items.forEach(
            (item) => (totalSum += item.price * item.quantity)
        );
        return totalSum;
    }

    private getOrderItemsCount(items: OrderItem[]): number {
        let itemsCount: number = 0;
        items.forEach(
            (item) => (itemsCount += item.quantity)
        );
        return itemsCount;
    }

    private groupBy<TItem>(items: TItem[], key: string): Map<string, TItem[]> {
        let groups: Map<string, TItem[]> = new Map();
        items.forEach(item => {
            const groupId = item[key];
            const collection = groups.get(groupId);
            if (collection)
                collection.push(item);
            else
                groups.set(groupId, [item]);
        });
        return groups;
    }

    private groupBy2<TItem>(items: TItem[], key: string): TItem[] {
        return items.reduce((r, x) => {
            (r[x[key]] = r[x[key]] || []).push(x);
            return r[x[key]];
        }, []);
    }

    private flatMap<TItem>(items: TItem[][]): TItem[] {
        return [].concat.apply([], items);
    }

    private flatMap2<TItem>(items: TItem[][]): TItem[] {
        return items.reduce((a, b) => { return a.concat(b) }, []);
    }

    // private flatMap3<TItem>(items: TItem[][]): TItem[] {
    //     let flatten = items => Array.isArray(items) ? [].concat(...items.map(flatten)) : items;
    //     return flatten;
    // }

    getActiveOrdersInDay(date: Date): Order[] {
        //const momentDate = _moment(date);
        const startMoment = _moment(date).startOf('day');
        const startDate = startMoment.toDate();
        const endDate = startMoment.add(1, 'days').toDate();
        //const startDate = new Date(date.getFullYear(), date.getMonth() + 1, date.getDate()).getTime();

        return this.getStorageOrders()
            .filter(order => order.isActive
                && order.date >= startDate && order.date < endDate)
            .sort((o1, o2) => o1.date.getTime() - o2.date.getTime());
    }

    getOrdersInDay(date: Date): Order[] {
        const startMoment = _moment(date).startOf('day');
        const startDate = startMoment.toDate();
        const endDate = startMoment.add(1, 'days').toDate();
        return this.getStorageOrders()
            .filter(order => order.date >= startDate && order.date < endDate)
            .sort((o1, o2) => o1.date.getTime() - o2.date.getTime());
    }

    activateOrder(id: string): Result {
        return this.updateOrderActive(id, true);
    }

    deactivateOrder(id: string): Result {
        return this.updateOrderActive(id, false);
    }

    private updateOrderActive(id: string, isActive: boolean): Result {
        let order = this.getOrderById(id);
        if (!order)
            return Result.Failure([OrderErrors.NotExists]);

        order.isActive = isActive;
        this.setOrdersLocalStorage(this.orders);
        return Result.Success();
    }

    private createOrderItems(cartItems: CartItem[]): OrderItem[] {
        let orderItems: OrderItem[] = [];
        cartItems.forEach(item => {
            const product = this.productRepository.getProductById(item.productId);
            if (product) {
                const inventoryCosts: InventoryEntryCost[]
                    = product.discountFromInvantory && this.authorizationService.hasInventoryModuleAvailable()
                        ? this.inventoryService.getAvailableInventoryCosts(item.productId, item.quantity)
                        : [];
                // const inventoryCosts: InventoryEntryCost[]
                //     = product.discountFromInvantory
                //         ? this.inventoryService.getAvailableInventoryCosts(item.productId, item.quantity)
                //         : [];
                orderItems.push({
                    productId: item.productId,
                    productName: item.name,
                    categoryId: product.categoryId,
                    categoryName: product.categoryName,
                    name: product.name,
                    price: item.price,
                    quantity: item.quantity,
                    productBusinessId: product.businessId,
                    productCosts: inventoryCosts,
                    order: product.order,
                });
            }
        });
        return orderItems;
    }

    private getItemsTotal(items: CartItem[]): number {
        let totalSum: number = 0;
        items.forEach(
            (item) => (totalSum += item.price * item.quantity)
        );
        return totalSum;
    }

    private getItemsCount(items: CartItem[]): number {
        let count = 0;
        items.forEach(
            (item) => (count += item.quantity)
        );
        return count;
    }

    getStorageOrders(): Order[] {
        if (!this.orders || this.orders.length === 0
            || this.getCurrentStorageKey() !== this.lastUserOrdersKey)
            this.orders = this.getOrdersFromLocalStorage();
        return this.orders;
    }

    private getStorageKey() {
        this.lastUserOrdersKey = this.getCurrentStorageKey();
        return this.lastUserOrdersKey;
    }

    private getCurrentStorageKey() {
        return OrderOfflineService.USER_ORDERS_KEY + this.authService.currentUserValue.selectedStoreId;
    }

    getOrdersJson(): string {
        return localStorage.getItem(this.getStorageKey()) || "[]";
    }

    private setOrdersLocalStorage(orders: Order[]) {
        let ordersJson = JSON.stringify(orders);
        localStorage.setItem(this.getStorageKey(), ordersJson);
    }

    updateOrders(orders: Order[]) {
        this.setOrdersLocalStorage(orders);
        this.orders = this.getOrdersFromLocalStorage();
    }

    addImportedOrder(order: Order): Result {
        this.orders = this.getOrdersFromLocalStorage();
        order.date = _moment(order.date).toDate();
        this.orders.push(order);
        this.setOrdersLocalStorage(this.orders);
        return Result.Success();
    }

    updateImportedOrder(importedOrder: Order): Result {
        this.orders = this.getOrdersFromLocalStorage();
        let order: Order = this.orders.find(o => o.id === importedOrder.id);
        if (order) {
            order.date = _moment(importedOrder.date).toDate();
            order.isActive = importedOrder.isActive;
            this.setOrdersLocalStorage(this.orders);
        }
        return Result.Success();
    }

    private getOrdersFromLocalStorage(): Order[] {
        try {
            let ordersJson = localStorage.getItem(this.getStorageKey());
            if (ordersJson) {
                const orders = JSON.parse(ordersJson);
                return orders.map(order => {
                    order.date = _moment(order.date).toDate();
                    return order;
                });
            }
        } catch (ignore) {

        }
        this.setOrdersLocalStorage([]);
        return [];
    }

    private parseDate(key, value) {
        // Date.prototype.toJSON = function(){ return moment(this).format(); }
        //if (typeof value === "string") {
        if (key === "date") {
            return _moment(value).format();
        }
        return value;
    }
}