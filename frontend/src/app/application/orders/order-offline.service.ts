import { Injectable, Inject } from '@angular/core';
import { HttpClient } from "@angular/common/http";
import { Observable, of } from 'rxjs';
import { Guid } from 'guid-typescript';
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
import { DataResult, Result } from 'src/app/domain/commons/result';
import { ChartData } from 'src/app/presentation/_models/chart-data,model';
import { TopProduct } from 'src/app/presentation/_models/top-product.model';
import { PaymentType } from 'src/app/domain/commons/payment-type';
import { SaleCreditOfflineService } from '../credits/sale-credit-offline.service';
import { ExpenseOfflineService } from '../expenses/expense-offline.service';
import { startOfDay, addDays, subDays } from 'date-fns';

@Injectable({
    providedIn: "root"
})

export class OrderOfflineService extends BaseService<Order> {

    private static USER_ORDERS_KEY: string = "lizoft.store-orders-";

    private lastUserOrdersKey: string;
    private orders: Order[] = null;

    constructor(@Inject(HttpClient) http, private productRepository: ProductRepository, private authService: AuthService, private categoryRepository: ProductCategoryRepository, private inventoryService: InventoryOfflineService, private authorizationService: AuthorizationService, private saleCreditService: SaleCreditOfflineService, private expenseService: ExpenseOfflineService) {
        super(http);
    }

    createOrder(cartItems: CartItem[], type: OrderType, isCredit: boolean, paymentType: PaymentType, details: string, client: string): Observable<BaseResponseModel<Order>> {
        const date: Date = new Date();
        const order: Order = {
            id: Guid.create().toString(),
            orderItems: this.createOrderItems(cartItems),
            total: this.getItemsTotal(cartItems),
            itemsCount: this.getItemsCount(cartItems),
            date: date,
            type: type,
            isCredit: isCredit,
            paymentType: paymentType,
            description: details,
            isActive: true,
            createdDate: date,
            createdByName: this.authService.currentUserValue.login,
            updatedDate: undefined,
            updatedByName: undefined,
        };
        this.getStorageOrders().push(order);
        this.setOrdersLocalStorage(this.orders);
        if (order.isCredit)
            this.saleCreditService.createSaleCredit(order.id, client, order.total, "");
        return this.Success$(order);
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
        const categoryItemsView: CategoryCartItemsView[] = [];
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
        const groups: Map<string, TItem[]> = new Map();
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

    private getActiveOrdersBetweenDates(startDate: Date, endDate: Date): Order[] {
        return this.getStorageOrders()
            .filter(order => order.isActive
                && order.date >= startDate && order.date < endDate)
            .sort((o1, o2) => o1.date.getTime() - o2.date.getTime());
    }

    private getActiveOrdersPriceBetweenDates(startDate: Date, endDate: Date): number {
        return this.getActiveOrdersBetweenDates(startDate, endDate)
            .reduce((total, order) => total + order.total, 0);
    }

    getActiveOrdersPriceToday(): number {
        const startDate = startOfDay(new Date());
        const endDate = addDays(startDate, 1);
        return this.getActiveOrdersPriceBetweenDates(startDate, endDate);
    }

    getActiveOrdersPriceYesterday(): number {
        const startDate = startOfDay(subDays(new Date(), 1));
        const endDate = startOfDay(new Date());
        return this.getActiveOrdersPriceBetweenDates(startDate, endDate);
    }

    getActiveOrdersProfitBetweenDates(startDate: Date, endDate: Date): number {
        let profit = 0;
        this.getActiveOrdersBetweenDates(startDate, endDate)
            .flatMap(order => order.orderItems)
            .forEach(orderItem => {
                profit += this.getOrderItemProfit(orderItem)
            })
        return profit;
    }

    private getOrderItemProfit(orderItem: OrderItem) {
        return orderItem.price * orderItem.quantity
            - orderItem.productCosts.reduce((total, pc) => total + (pc.costPrice * pc.quantity), 0);
    }

    getActiveOrdersProfitToday(): number {
        const startDate = startOfDay(new Date());
        const endDate = addDays(startDate, 1);
        return this.getActiveOrdersProfitBetweenDates(startDate, endDate);
    }

    getActiveOrdersProfitYesterday(): number {
        const startDate = startOfDay(subDays(new Date(), 1));
        const endDate = startOfDay(new Date());
        return this.getActiveOrdersProfitBetweenDates(startDate, endDate);
    }

    getLastMonthSaleProfits(): ChartData[] {
        const data: ChartData[] = [];
        const today = new Date();
        for (let i = 29; i >= 0; i--) {
            const date = subDays(today, i);
            const startDate = startOfDay(today);
            const endDate = i > 0
                ? startOfDay(subDays(today, i - 1))
                : addDays(today, 1);
            data.push({
                label: date,
                value: this.getActiveOrdersProfitBetweenDates(startDate, endDate)
                    - this.expenseService.getActiveExpensesPriceBetweenDates(startDate, endDate)
            });
        }
        return data;
    }

    getLastMonthSales(): ChartData[] {
        const data: ChartData[] = [];
        const today = new Date();
        for (let i = 29; i >= 0; i--) {
            const date = subDays(today, i);
            const startDate = startOfDay(today);
            const endDate = i > 0
                ? startOfDay(subDays(today, i - 1))
                : addDays(today, 1);
            data.push({
                label: date,
                value: this.getActiveOrdersPriceBetweenDates(startDate, endDate)
            });
        }
        return data;
    }

    private getActiveOrders(): Order[] {
        return this.getStorageOrders()
            .filter(order => order.isActive)
            .sort((o1, o2) => o1.date.getTime() - o2.date.getTime());
    }

    getTopProductsProfitInLastMonth() {
        return this.getTopProductsInLastMonth(true, 5);
    }

    getTopProductsSaleQuantityInLastMonth() {
        return this.getTopProductsInLastMonth(false, 5);
    }

    private getTopProductsInLastMonth(calculateProfit: boolean, top: number) {
        const now = new Date();
        const lastMonth = subDays(now, 29);
        const monthOrders: Order[] = this.getActiveOrders()
            .filter(order => order.date >= lastMonth && order.date < now);

        const topProductsMap: Map<string, TopProduct> = new Map<string, TopProduct>();
        monthOrders.flatMap(order => order.orderItems)
            .forEach(orderItem => {
                if (!topProductsMap.has(orderItem.productId))
                    topProductsMap.set(orderItem.productId, {
                        id: orderItem.productId,
                        name: orderItem.productName,
                        value: 0
                    })
                const profit: number = calculateProfit
                    ? this.getOrderItemProfit(orderItem)
                    : orderItem.quantity;
                topProductsMap.get(orderItem.productId).value += profit;
            });

        return Array.from(topProductsMap.values())
            .sort((p1, p2) => p2.value - p1.value)
            .slice(0, 5);
    }

    getActiveTodayOrdersObservable(): Observable<BaseResponseModel<Order[]>> {
        return this.Success$(this.getActiveOrdersInDay(new Date()));
    }

    filterOrdersObservable(isCredit: number, paymentType: PaymentType, startDate: Date, endDate: Date): Observable<BaseResponseModel<Order[]>> {
        const orders: Order[] = this.getActiveOrders()
            .filter(order => (isCredit === -1 || isCredit === 1 && order.isCredit || isCredit === 0 && !order.isCredit)
                && (!paymentType || paymentType === order.paymentType)
                && (!startDate || order.date >= startDate)
                && (!endDate || order.date < endDate));
        return of(this.Success(orders));
    }

    getActiveOrdersInDay(date: Date): Order[] {
        const startDate = startOfDay(new Date());
        const endDate = addDays(startDate, 1);
        return this.getActiveOrdersBetweenDates(startDate, endDate);
    }

    getOrdersInDay(date: Date): Order[] {
        const startDate = startOfDay(new Date());
        const endDate = addDays(startDate, 1);
        return this.getStorageOrders()
            .filter(order => order.date >= startDate && order.date < endDate)
            .sort((o1, o2) => o1.date.getTime() - o2.date.getTime());
    }

    activateOrder(id: string): Result {
        return this.updateOrderActive(id, true);
    }

    deactivateOrder(id: string): Result {
        let result: Result = this.updateOrderActive(id, false);
        if (!result.succeeded)
            return Result.Failure([]);

        result = this.saleCreditService.deactivateSaleCreditByOrderId(id);
        if (!result.succeeded)
            return Result.Failure([]);

        const order: Order = this.getOrderById(id);
        return this.inventoryService.increaseQuantitiesByOrderItems(order.orderItems);
    }

    private updateOrderActive(id: string, isActive: boolean): Result {
        const order = this.getOrderById(id);
        if (!order)
            return Result.Failure([OrderErrors.NotExists]);

        order.isActive = isActive;
        order.updatedDate = new Date();
        order.updatedByName = this.authService.currentUserValue.login;
        this.setOrdersLocalStorage(this.orders);
        return Result.Success();
    }

    public updateTodayOrder(id: string, paymentType: PaymentType): DataResult<Order> {
        const order = this.getOrderById(id);
        if (!order)
            return new DataResult(undefined, false, [OrderErrors.NotExists]);

        order.paymentType = paymentType;
        order.updatedDate = new Date();
        order.updatedByName = this.authService.currentUserValue.login;
        this.setOrdersLocalStorage(this.orders);
        return new DataResult(order, true, []);
    }

    private createOrderItems(cartItems: CartItem[]): OrderItem[] {
        const orderItems: OrderItem[] = [];
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
        const ordersJson = JSON.stringify(orders);
        localStorage.setItem(this.getStorageKey(), ordersJson);
    }

    updateOrders(orders: Order[]) {
        this.setOrdersLocalStorage(orders);
        this.orders = this.getOrdersFromLocalStorage();
    }

    addImportedOrder(order: Order): Result {
        this.orders = this.getOrdersFromLocalStorage();
        order.date = new Date(order.date);
        this.orders.push(order);
        this.setOrdersLocalStorage(this.orders);
        return Result.Success();
    }

    updateImportedOrder(importedOrder: Order): Result {
        this.orders = this.getOrdersFromLocalStorage();
        const order: Order = this.orders.find(o => o.id === importedOrder.id);
        if (order) {
            order.date = new Date(importedOrder.date);
            order.isActive = importedOrder.isActive;
            order.updatedDate = importedOrder.updatedDate;
            order.updatedByName = importedOrder.updatedByName;
            this.setOrdersLocalStorage(this.orders);
        }
        return Result.Success();
    }

    private getOrdersFromLocalStorage(): Order[] {
        try {
            const ordersJson = localStorage.getItem(this.getStorageKey());
            if (ordersJson) {
                const orders = JSON.parse(ordersJson);
                return orders.map(order => {
                    order.date = new Date(order.date);
                    if (!order.isCredit)
                        order.isCredit = false;
                    if (!order.paymentType)
                        order.paymentType = PaymentType.Efectivo;
                    return order;
                });
            }
        } catch (ignore) {

        }
        this.setOrdersLocalStorage([]);
        return [];
    }
}