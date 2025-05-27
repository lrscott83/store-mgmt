import { Injectable } from '@angular/core';
import { Guid } from 'guid-typescript';
import { UserModel } from 'src/app/_services/auth/_models/auth-user.model';
import { AuthService } from 'src/app/_services/services.index';
import { Result } from 'src/app/domain/commons/result';
import { ProductCategoryErrors } from 'src/app/domain/entities/product-categories/product-category.errors';
import { ProductCategory } from 'src/app/domain/entities/product-categories/product-category.model';

@Injectable({
    providedIn: "root"
})

export class ProductCategoryRepository {
    private static CATEGORIES_KEY: string = "lizoft.store-product-categories";
    private static USER_CATEGORIES_KEY: string = "lizoft.store-product-categories-";

    private lastUserCategoriesKey: string;

    private categories: Map<string, ProductCategory> = null;

    constructor(private authService: AuthService) {

    }

    public updateCategories(productsMap: Map<string, ProductCategory>) {
        this.setProductCategoriesLocalStorage(productsMap);
        this.categories = this.getProductCategoriesFromLocalStorage();
    }

    public setInitCategories(productsMap: Map<string, ProductCategory>) {
        const currentMap: Map<string, ProductCategory> = this.getStorageCategoriesMap();
        if (currentMap.size === 0)
            this.setProductCategoriesLocalStorage(productsMap);
    }

    public getStorageCategoriesMap(): Map<string, ProductCategory> {
        if (!this.categories || this.categories.size === 0
            || this.getCurrentStorageKey() !== this.lastUserCategoriesKey)
            this.categories = this.getProductCategoriesFromLocalStorage();
        return this.categories;
    }

    private getStorageCategories(): ProductCategory[] {
        return [...this.getStorageCategoriesMap().values()];
    }

    getProductCategoryById(id: string): ProductCategory {
        return this.getStorageCategories().find(c => c.id === id);
    }

    getProductCategoryByName(name: string): ProductCategory {
        return this.getStorageCategories().find(c => c.name === name);
    }

    getProductCategories(): ProductCategory[] {
        return this.getStorageCategories().sort((c1, c2) => c1.order - c2.order);
    }

    getAvailableProductCategories(): ProductCategory[] {
        return this.getProductCategories().filter(c => c.isActive);
    }

    hasAnyCategory(): boolean {
        return this.getStorageCategories().length > 0;
    }

    addProductCategoryData(id: string, name: string, order: number, isActive: boolean): Result {
        let category: ProductCategory = this.getStorageCategories().find(c => c.name === name);
        if (category)
            return Result.Failure([ProductCategoryErrors.NameExists]);

        const newCategory: ProductCategory = {
            id: id,
            name: name,
            isActive: isActive,
            order: order,
        };
        this.categories = this.getStorageCategoriesMap();
        this.updateCategoriesOrder(this.categories, order);
        newCategory.order = order;
        this.categories.set(newCategory.id, newCategory);
        this.setProductCategoriesLocalStorage(this.categories);
        return Result.Success();
    }

    addProductCategory(name: string, order: number, isActive: boolean): Result {
        return this.addProductCategoryData(Guid.create().toString(), name, order, isActive);
    }

    addProductCategoryByName(name: string): string {
        const id: string = Guid.create().toString();
        const order: number = this.getNextOrder();
        return this.addProductCategoryData(id, name, order, true) ? id : null;
    }

    private getNextOrder(): number {
        const categories: ProductCategory[] = this.getProductCategories();
        return Math.max(...categories.map(c => c.order), 0) + 1;
    }

    addImportedProductCategory(category: ProductCategory): Result {
        return this.addProductCategoryData(category.id, category.name, category.order, category.isActive);
    }

    private updateCategoriesOrder(categories: Map<string, ProductCategory>, order: number) {
        categories
            .forEach((category, id) => {
                if (category.order >= order)
                    category.order = category.order + 1;
            });
    }

    updateImportedProductCategory(category: ProductCategory): Result {
        return this.updateProductCategory(category.id, category.name, category.order, category.isActive);
    }

    updateProductCategory(id: string, name: string, order: number, isActive: boolean): Result {
        let category: ProductCategory = this.getProductCategoryById(id);
        if (!category)
            return Result.Failure([ProductCategoryErrors.NotExists]);

        let otherCategoryWithSameName = this.getStorageCategories().find(c => c.name === name && c.id !== id);
        if (otherCategoryWithSameName)
            return Result.Failure([ProductCategoryErrors.NameExists]);

        category.order = order;
        category.name = name;
        category.isActive = isActive;
        this.updateCategoriesOrder(this.categories, order);
        category.order = order;
        this.setProductCategoriesLocalStorage(this.categories);
        return Result.Success();
    }

    private updateProductCategoryActive(id: string, isActive: boolean): Result {
        let category: ProductCategory = this.getProductCategoryById(id);
        if (!category)
            return Result.Failure([ProductCategoryErrors.NotExists]);

        category.isActive = isActive;
        //this.pristine = false;
        this.setProductCategoriesLocalStorage(this.categories);
        return Result.Success();
    }

    activateProductCategory(id: string, isActive: boolean): Result {
        return this.updateProductCategoryActive(id, true);
    }

    deactivateProductCategory(id: string, isActive: boolean): Result {
        return this.updateProductCategoryActive(id, false);
    }

    private getStorageKey() {
        this.lastUserCategoriesKey = this.getCurrentStorageKey();
        return this.lastUserCategoriesKey;
    }

    private getCurrentStorageKey() {
        return ProductCategoryRepository.USER_CATEGORIES_KEY + this.authService.currentUserValue.selectedStoreId;
    }

    private setProductCategoriesLocalStorage(categories: Map<string, ProductCategory>) {
        let categoryMapJson = JSON.stringify(Array.from(categories.entries()));
        localStorage.setItem(this.getStorageKey(), categoryMapJson);
    }

    getCategoriesJson(): string {
        return localStorage.getItem(this.getStorageKey());
    }

    private getProductCategoriesFromLocalStorage(): Map<string, ProductCategory> {
        try {
            let categoryMapJson = localStorage.getItem(this.getStorageKey());
            if (categoryMapJson && categoryMapJson !== "{}") {
                return new Map(JSON.parse(categoryMapJson));
            }
            // else {
            //     categoryMapJson = localStorage.getItem(ProductCategoryRepository.CATEGORIES_KEY);
            //     if (categoryMapJson && categoryMapJson !== "{}") {
            //         this.categories = new Map(JSON.parse(categoryMapJson));
            //         this.setProductCategoriesLocalStorage(this.categories);
            //         return this.categories;
            //     }
            // }
        } catch (ignore) {

        }
        const categoriries: Map<string, ProductCategory> = new Map<string, ProductCategory>();

        // const category1: ProductCategory = {
        //     id: "1",
        //     name: "Galletas Dulces",
        //     order: 1,
        //     isActive: true
        // };
        // categoriries.set(category1.id, category1);

        // const category2: ProductCategory = {
        //     id: "2",
        //     name: "Galletas Saladas",
        //     order: 2,
        //     isActive: true
        // };
        // categoriries.set(category2.id, category2);

        // const category3: ProductCategory = {
        //     id: "3",
        //     name: "Chipachupas",
        //     order: 3,
        //     isActive: true
        // };
        // categoriries.set(category3.id, category3);

        // const category4: ProductCategory = {
        //     id: "4",
        //     name: "Cervezas",
        //     order: 4,
        //     isActive: true
        // };
        // categoriries.set(category4.id, category4);

        this.setProductCategoriesLocalStorage(categoriries);
        return categoriries;
    }
}