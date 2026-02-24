import { Injectable, Inject } from '@angular/core';
import { Guid } from 'guid-typescript';
import { Observable, of } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { BaseService } from 'src/app/_services/base.service';
import { InventoryEntry } from 'src/app/domain/entities/entries/inventory-entry.model';
import { ProductRepository } from '../products/product.repository';
import { AuthService } from 'src/app/_services/services.index';
import { ProductCategoryRepository } from '../categories/product-category.repository';
import { Product } from 'src/app/domain/entities/products/product.model';
import { DataResult, Result } from 'src/app/domain/commons/result';
import { InventoryEntryView } from 'src/app/domain/entities/entries/inventory-entry-view.model';
import { InventoryErrors } from 'src/app/domain/entities/entries/inventory.errors';
import { ProductErrors } from 'src/app/domain/entities/products/product.errors';
import { BaseResponseModel } from 'src/app/_services/_models/base.model';
import { InventoryCategoryView } from './inventory-category.view';
import { InventoryProductView } from './inventory-product-view';
import { InventoryEntriesView } from './inventory-entries.view';
import { InventoryEntryCost } from './inventory-item-cost.view';
import { AuthorizationService } from 'src/app/_services/authorization/authorization.service';
import { OrderItem } from 'src/app/domain/entities/orders/order-item.model';
import { startOfDay, addDays } from 'date-fns';

@Injectable({
    providedIn: "root"
})

export class InventoryOfflineService extends BaseService<InventoryEntry> {
    private static INVENTORIES_KEY: string = "lizoft.store-inventory-entries";
    private static USER_INVENTORIES_KEY: string = "lizoft.store-inventory-entries-";

    private lastUserInventoryEntriesKey: string;
    private inventories: Map<string, InventoryEntry[]> = null;

    constructor(@Inject(HttpClient) http, private productRepository: ProductRepository, private authService: AuthService, private categoryRepository: ProductCategoryRepository, private authorizationService: AuthorizationService) {
        super(http);
    }

    public getStorageInventoriesMap(): Map<string, InventoryEntry[]> {
        if (!this.inventories || this.inventories.size === 0
            || this.getCurrentStorageKey() !== this.lastUserInventoryEntriesKey)
            this.inventories = this.getInventoriesFromLocalStorage();
        return this.inventories;
    }

    private getStorageInventoryEntries(): InventoryEntry[] {
        return this.flatMap([...this.getStorageInventoriesMap().values()]);
    }

    private getStorageActiveInventoryEntries(): InventoryEntry[] {
        return this.getStorageInventoryEntries().filter(entry => entry.isActive);
    }

    public getProductInventoriesByProductId(productId: string): InventoryEntry[] {
        return this.getStorageInventoriesMap().get(productId);
    }

    // Begin Entries management

    createInventoryEntry(productId: string, quantity: number, costPrice: number): DataResult<InventoryEntryView> {
        const product: Product = this.productRepository.getProductById(productId);
        if (!product)
            return null;

        let inventories = this.getProductInventoriesByProductId(productId);
        if (!inventories)
            inventories = [];
        // TODO. Verify costPrice and sum count if exists
        const maxOrder: number = this.getMaxInventoryOrder(inventories);
        const date: Date = new Date();
        const id: string = Guid.create().toString();
        const storageProductsMap = this.productRepository.getStorageProductsMap();
        inventories.push({
            id: id,
            productId: productId,
            categoryId: storageProductsMap.get(productId).categoryId,
            quantity: quantity,
            available: quantity,
            costPrice: costPrice,
            date: date,
            order: maxOrder + 1,
            isActive: true,
            createdDate: date,
            createdByName: this.authService.currentUserValue.login,
            updatedDate: undefined,
            updatedByName: undefined,
        });
        this.inventories.set(productId, inventories);
        this.setInventoriesLocalStorage(this.inventories);

        return new DataResult({
            id: id,
            productId: productId,
            productName: product.name,
            quantity: quantity,
            costPrice: costPrice,
            date: date,
            isActive: true,
        }, true, []);
    }

    updateInventoryEntry(oldProductId: string, entryId: string, newProductId: string, quantity: number, costPrice: number): DataResult<InventoryEntryView> {
        const isNotSoldEntryResult: Result = this.isNotSoldEntry(oldProductId, entryId);
        if (!isNotSoldEntryResult.succeeded)
            return new DataResult(undefined, false, isNotSoldEntryResult.errors);

        if (!this.productRepository.getAvailableProductById(newProductId))
            return new DataResult(undefined, false, [InventoryErrors.ProductNotAvailable]);

        const newInventories = this.getProductInventoriesByProductId(newProductId);
        let entry: InventoryEntry = newInventories.find(e => e.id === entryId);
        if (oldProductId !== newProductId) {
            let oldInventories = this.getProductInventoriesByProductId(newProductId);
            entry = oldInventories.find(e => e.id === entryId);
            oldInventories = oldInventories.filter(entry => entry.id !== entryId);
            this.inventories.set(oldProductId, oldInventories);
        }

        entry.quantity = quantity;
        entry.available = quantity;
        entry.costPrice = costPrice;
        entry.productId = newProductId;
        entry.updatedDate = new Date();
        entry.updatedByName = this.authService.currentUserValue.login;
        if (oldProductId !== newProductId)
            newInventories.push(entry);
        this.inventories.set(newProductId, newInventories);
        this.setInventoriesLocalStorage(this.inventories);

        const product: Product = this.productRepository.getProductById(oldProductId);
        return new DataResult({
            id: entry.id,
            productId: newProductId,
            productName: product.name,
            quantity: quantity,
            costPrice: costPrice,
            date: entry.date,
            isActive: true,
        }, true, []);
    }

    amortizeSoldEntry(productId: string, entryId: string): Result {
        let inventories = this.getProductInventoriesByProductId(productId);
        if (!inventories)
            inventories = [];

        const entry: InventoryEntry = inventories.find(e => e.id === entryId);
        if (!entry)
            return Result.Failure([InventoryErrors.EntryNotExists]);

        if (entry.quantity === entry.available)
            return Result.Failure([InventoryErrors.SaleNotExistsWithThisEntry]);

        entry.quantity -= entry.available;
        entry.available = 0;
        this.inventories.set(productId, inventories);
        this.setInventoriesLocalStorage(this.inventories);

        return Result.Success();
    }

    public isNotSoldEntry(productId: string, entryId: string): Result {
        if (!this.productRepository.getProductById(productId))
            return Result.Failure([ProductErrors.NotExists]);

        let inventories = this.getProductInventoriesByProductId(productId);
        if (!inventories)
            inventories = [];

        const entry: InventoryEntry = inventories.find(e => e.id === entryId);
        if (!entry)
            return Result.Failure([InventoryErrors.EntryNotExists]);

        return entry.quantity === entry.available
            ? Result.Success()
            : Result.Failure([InventoryErrors.SaleExistsWithThisEntry]);
    }

    deleteInventoryEntry(productId: string, entryId: string): Result {
        const isNotSoldEntryResult: Result = this.isNotSoldEntry(productId, entryId);
        if (!isNotSoldEntryResult.succeeded)
            return isNotSoldEntryResult;

        const inventories = this.getProductInventoriesByProductId(productId);
        const entry: InventoryEntry = inventories.find(e => e.id === entryId);
        entry.isActive = false;
        entry.updatedDate = new Date();
        entry.updatedByName = this.authService.currentUserValue.login;
        this.inventories.set(productId, inventories);
        this.setInventoriesLocalStorage(this.inventories);

        return Result.Success();
    }

    public increaseQuantitiesByOrderItems(orderItems: OrderItem[]) {
        const entries: Map<string, InventoryEntry[]> = this.getStorageInventoriesMap();
        orderItems.forEach(orderItem => {
            const productEntries: InventoryEntry[] = entries.get(orderItem.productId);
            if (productEntries && orderItem.productCosts) {
                orderItem.productCosts.forEach(cost => {
                    const entry: InventoryEntry = productEntries.find(e => e.id === cost.inventoryId);
                    if (entry) {
                        entry.available += cost.quantity;
                    }
                });
            }
        });
        return Result.Success();
    }

    // End Entries management

    getInventoryEntriesInDayObservable(date: Date): Observable<BaseResponseModel<InventoryEntryView[]>> {
        return of(this.getInventoryEntriesInDay(date));
    }

    filterInventoryEntries(productId: string, startDate: Date, endDate: Date)
        : Observable<BaseResponseModel<InventoryEntryView[]>> {
        const credits: InventoryEntryView[] = this.getActiveInventoryEntriesStorage()
            .filter(entry => (!productId || productId === entry.productId)
                && (!startDate || entry.date >= startDate)
                && (!endDate || entry.date < endDate));
        return of(this.Success(credits));
    }

    private getActiveInventoryEntriesStorage(): InventoryEntryView[] {
        const inventoryEntries: InventoryEntryView[] = [];
        const inventories: Map<string, InventoryEntry[]> = this.getStorageInventoriesMap();
        if (inventories.size === 0)
            return [];
        inventories.forEach((entries, productId) => {
            const product: Product = this.productRepository.getProductById(productId);
            if (product) {
                entries
                    .filter(entry => entry.isActive)
                    .forEach(entry => {
                        inventoryEntries.push({
                            id: entry.id,
                            productId: productId,
                            productName: product.name,
                            quantity: entry.quantity,
                            costPrice: entry.costPrice,
                            date: entry.date,
                            isActive: true
                        });
                    });
            }
        });
        return inventoryEntries;
    }

    getInventoryEntriesInDay(date: Date): BaseResponseModel<InventoryEntryView[]> {
        const startDate = startOfDay(new Date());
        const endDate = addDays(startDate, 1);
        const inventoryEntries: InventoryEntryView[] = this.getActiveInventoryEntriesStorage()
            .filter(entry => entry.date >= startDate && entry.date < endDate);
        return this.Success(inventoryEntries.sort((e1, e2) => e2.date.getTime() - e1.date.getTime()));
    }

    getInventoryCategoriesViewObservable(): Observable<BaseResponseModel<InventoryCategoryView[]>> {
        return of(this.getInventoryCategoriesView());
    }

    getInventoryCostTotalBefore(date: Date): number {
        const entries: InventoryEntry[] = this.getStorageActiveInventoryEntries();
        let totalSum: number = 0;
        entries
            .filter(entry => entry.date < date)
            .forEach((entry) => {
                totalSum += entry.available * entry.costPrice;
            });
        return totalSum;
    }

    getInventoryCostTotal(): number {
        const startDate = startOfDay(new Date());
        const endDate = addDays(startDate, 1);
        return this.getInventoryCostTotalBefore(endDate);
    }

    getInventoryCostTotalYesterday(): number {
        const startDate = startOfDay(new Date());
        return this.getInventoryCostTotalBefore(startDate);
    }

    getInventoryCategoriesView(): BaseResponseModel<InventoryCategoryView[]> {
        const inventoryCategories: InventoryCategoryView[] = [];
        const storageCategoriesMap = this.categoryRepository.getStorageCategoriesMap();
        const storageProductsMap = this.productRepository.getStorageProductsMap();
        const inventoryEntries: InventoryEntry[] = this.getStorageActiveInventoryEntries();
        const categoryGroups: Map<string, InventoryEntry[]> = this.groupBy(inventoryEntries, "categoryId");
        categoryGroups.forEach((categoryItems, key) => {
            const item = categoryItems[0];
            const productGroups: Map<string, InventoryEntry[]> = this.groupBy(categoryItems, "productId");
            const productItems: InventoryProductView[] = [];
            productGroups.forEach((products, key) => {
                const product = products[0];
                productItems.push({
                    productId: product.productId,
                    productName: storageProductsMap.get(product.productId).name,
                    quantity: this.getAvailableProducts(products),
                    costPrice: this.getAverageCostPrice(products),
                });
            });
            const storageCategory = storageCategoriesMap.get(item.categoryId);
            inventoryCategories.push({
                categoryId: item.categoryId,
                categoryName: storageCategory.name,
                totalQuantity: this.getTotalQuantity(productItems),
                totalCostPrice: this.getTotalCostPrice(productItems),
                products: productItems,
            });
        });
        return this.Success(inventoryCategories);
    }

    private getTotalQuantity(inventoryProducts: InventoryProductView[]): number {
        let totalSum: number = 0;
        inventoryProducts.forEach(
            (entry) => (totalSum += entry.quantity)
        );
        return totalSum;
    }

    private getTotalCostPrice(inventoryProducts: InventoryProductView[]): number {
        let totalSum: number = 0;
        inventoryProducts.forEach(
            (entry) => (totalSum += entry.costPrice * entry.quantity)
        );
        return totalSum;
    }

    private getAvailableProducts(entries: InventoryEntry[]): number {
        let totalSum: number = 0;
        entries.forEach(
            (entry) => (totalSum += entry.available)
        );
        return totalSum;
    }

    private getAverageCostPrice(entries: InventoryEntry[]): number {
        let totalSum: number = 0;
        let totalCount: number = 0;
        entries.forEach((entry) => {
            totalSum += entry.available * entry.costPrice;
            totalCount += entry.available;
        });
        return totalSum / totalCount;
    }

    private flatMap<TItem>(items: TItem[][]): TItem[] {
        return [].concat.apply([], items);
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

    getInventoryEntriesView(): Observable<BaseResponseModel<InventoryEntriesView[]>> {
        const inventoryEntries: InventoryEntriesView[] = [];
        const inventories: Map<string, InventoryEntry[]> = this.getStorageInventoriesMap();
        inventories.forEach((entries, productId) => {
            const product: Product = this.productRepository.getProductById(productId);
            if (product) {
                const availableEntries: InventoryEntryCost[] = entries
                    .filter(entry => entry.available > 0 && entry.isActive)
                    .sort((e1, e2) => e1.order - e2.order)
                    .map(entry => {
                        return {
                            inventoryId: entry.id,
                            costPrice: entry.costPrice,
                            quantity: entry.available
                        }
                    });
                let quantity = 0;
                availableEntries.forEach((entry) => (quantity += entry.quantity));
                inventoryEntries.push({
                    productId: productId,
                    productName: product.name,
                    productAvailable: quantity,
                    availableEntries: availableEntries,
                });
            }
        });
        return this.Success$(inventoryEntries);
    }

    hasAvailableProductToSale(productId: string, quantity: number): Result {
        const product = this.productRepository.getAvailableProductById(productId);
        if (!product)
            return Result.Failure([ProductErrors.NotExists]);
        if (!product.isActive)
            return Result.Failure([ProductErrors.Inactive]);
        if (!product.availableToSale)
            return Result.Failure([ProductErrors.ProductNotAvailableToSale]);

        //if (!product.discountFromInvantory)
        if (!this.authorizationService.hasInventoryModuleAvailable() || !product.discountFromInvantory)
            return Result.Success();

        const inventories = this.getProductInventoriesByProductId(productId);
        if (!inventories || inventories.length === 0)
            return Result.Failure([ProductErrors.ProductNotAvailable]);

        let available: number = 0;
        inventories
            .filter(entry => entry.isActive)
            .forEach(
                (entry) => (available += entry.available)
            );
        return available >= quantity
            ? Result.Success()
            : Result.Failure([ProductErrors.ProductQuantityNotAvailable]);
    }

    private getAvailableInventories(productId: string, quantity: number): InventoryEntry[] {
        const availableResult: Result = this.hasAvailableProductToSale(productId, quantity);
        if (!availableResult.succeeded)
            return [];

        const inventories = this.getProductInventoriesByProductId(productId)
            .filter(i => i.available > 0 && i.isActive)
            .sort((i1, i2) => i1.order - i2.order);

        const availableInventories: InventoryEntry[] = [];
        let total = quantity;
        inventories.forEach(i => {
            if (total > 0) {
                availableInventories.push(i);
                total -= i.available;
            }
        });
        return availableInventories;
    }

    getAvailableInventoryCosts(productId: string, quantity: number): InventoryEntryCost[] {
        const inventoryItemCosts: InventoryEntryCost[] = [];
        const availableInventories = this.getAvailableInventories(productId, quantity);
        let total = quantity;
        availableInventories.forEach(i => {
            inventoryItemCosts.push({
                inventoryId: i.id,
                costPrice: i.costPrice,
                quantity: total >= i.available ? i.available : total,
            });
            const available = Math.min(total, i.available);
            i.available -= available;
            total -= available;
        });
        this.setCurrentInventoriesLocalStorage();
        return inventoryItemCosts;
    }

    updateAvailableInventories(productId: string, quantity: number): boolean {
        const inventories = this.getAvailableInventories(productId, quantity)
        if (!inventories || inventories.length === 0)
            return false;

        let total = quantity;
        inventories.forEach(i => {
            if (total >= i.available)
                i.available = 0;
            else
                i.available -= total;
            total -= i.available;
        });
        return true;
    }

    private getMaxInventoryOrder(inventories: InventoryEntry[]): number {
        if (!inventories || inventories.length === 0)
            return -1;
        return Math.max(...inventories.map(i => i.order), 0);
    }

    private getStorageKey() {
        this.lastUserInventoryEntriesKey = this.getCurrentStorageKey();
        return this.lastUserInventoryEntriesKey;
    }

    private getCurrentStorageKey() {
        return InventoryOfflineService.USER_INVENTORIES_KEY + this.authService.currentUserValue.selectedStoreId;
    }

    getInventoryEntriesJson(): string {
        return localStorage.getItem(this.getStorageKey()) || "{}";
    }

    public updateImportedEntries(productId: string, entries: InventoryEntry[]): Result {
        this.inventories = this.getInventoriesFromLocalStorage();
        if (this.inventories.has(productId)) {
            const currentEntries: InventoryEntry[] = this.inventories.get(productId);
            entries.forEach(entry => {
                const currentEntry: InventoryEntry = currentEntries.find(e => e.id === entry.id);
                if (currentEntry) {
                    currentEntry.available = entry.available;
                    currentEntry.isActive = entry.isActive;
                    currentEntry.updatedDate = entry.updatedDate;
                    currentEntry.updatedByName = entry.updatedByName;
                } else
                    currentEntries.push(entry);
            });
        } else {
            this.inventories.set(productId, entries);
        }
        this.setInventoriesLocalStorage(this.inventories);
        return Result.Success();
    }

    public addImportedEntries(productId: string, entries: InventoryEntry[]): Result {
        this.inventories = this.getInventoriesFromLocalStorage();
        this.inventories.set(productId, entries);
        this.setInventoriesLocalStorage(this.inventories);
        return Result.Success();
    }

    private setInventoriesLocalStorage(inventories: Map<string, InventoryEntry[]>) {
        const entriesMapJson = JSON.stringify(Array.from(inventories.entries()));
        localStorage.setItem(this.getStorageKey(), entriesMapJson);
    }

    private setCurrentInventoriesLocalStorage() {
        this.setInventoriesLocalStorage(this.inventories);
    }

    private getInventoriesFromLocalStorage(): Map<string, InventoryEntry[]> {
        try {
            const inventoriesJson = localStorage.getItem(this.getStorageKey());
            if (inventoriesJson && inventoriesJson !== "{}") {
                const inventoryMap: Map<string, InventoryEntry[]> = new Map(JSON.parse(inventoriesJson));
                inventoryMap.forEach((entries, productId) => {
                    entries.map(entry => {
                        entry.date = new Date(entry.date);
                        return entry;
                    });
                });
                return inventoryMap;
            }
        } catch (ignore) {

        }
        const inventories: Map<string, InventoryEntry[]> = new Map<string, InventoryEntry[]>();
        this.setInventoriesLocalStorage(inventories);
        return inventories;
    }
}
