import { Injectable, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { ProductService } from 'src/app/domain/interfaces/product.service';
import { BaseResponseModel } from 'src/app/_services/_models/base.model';
import { Product } from 'src/app/domain/entities/products/product.model';
import { ProductErrors } from 'src/app/domain/entities/products/product.errors';
import { ProductRepository } from './product.repository';
import { ProductCategoryRepository } from '../categories/product-category.repository';
import { Result } from 'src/app/domain/commons/result';
import { ProductCategory } from 'src/app/domain/entities/product-categories/product-category.model';
import { ProductSelectView } from './product-select.view';
import { CsvProduct } from 'src/app/_services/csv/models/csv-product.model';

@Injectable({
    providedIn: "root"
})

export class ProductOfflineService extends ProductService {


    constructor(@Inject(HttpClient) http, private productRepository: ProductRepository, private categoryRepository: ProductCategoryRepository) {
        super(http);
    }

    getProductById(id: string): Observable<BaseResponseModel<Product>> {
        const product = this.productRepository.getProductById(id);
        return product ? this.Success$(product) : this.Failure$([ProductErrors.NotExists]);
    }

    createProduct(categoryId: string, name: string, price: number, businessId: string, order: number, isActive: boolean,
        availableToSale: boolean, discountFromInvantory: boolean): Observable<BaseResponseModel<boolean>> {
        let result: Result = this.productRepository.addProduct(categoryId, name, price, businessId, order, isActive,
            availableToSale, discountFromInvantory);
        return result.succeeded ? this.Success$(true) : this.Failure$(result.errors);
    }

    createProducts(categoryId: string, items: { name, price }[]): Observable<BaseResponseModel<boolean>> {
        let hasError: boolean = false;
        items.forEach(item => {
            const order: number = this.getNextOrder(categoryId);
            let result: Result = this.productRepository.addProduct(categoryId, item.name, item.price, "", order, true,
                true, true);
            if (!result.succeeded)
                hasError = true;
        })
        return !hasError ? this.Success$(true) : this.Failure$([]);
    }

    createCsvProducts(csvProducts: CsvProduct[]): Observable<BaseResponseModel<boolean>> {
        let hasError: boolean = false;
        csvProducts.forEach(csvProduct => {
            const category: ProductCategory = this.categoryRepository.getProductCategoryByName(csvProduct.category);
            const categoryId: string = category
                ? category.id
                : this.categoryRepository.addProductCategoryByName(csvProduct.category);
            const order: number = this.getNextOrder(categoryId);
            let result: Result = this.productRepository.addProduct(categoryId, csvProduct.name, csvProduct.price, "", order, true, true, true);
            if (!result.succeeded)
                hasError = true;
        })
        return !hasError ? this.Success$(true) : this.Failure$([]);
    }

    updateProduct(id: string, categoryId: string, name: string, price: number, businessId: string, order: number, isActive: boolean, availableToSale: boolean, discountFromInvantory: boolean): Observable<BaseResponseModel<boolean>> {
        let result: Result = this.productRepository.updateProduct(id, categoryId, name, price, businessId, order, isActive,
            availableToSale, discountFromInvantory);
        return result.succeeded ? this.Success$(true) : this.Failure$(result.errors);
    }

    setDiscountFromInvantory(id: string, discountFromInvantory: boolean): Observable<BaseResponseModel<boolean>> {
        let result: Result = this.productRepository.setDiscountFromInvantory(id, discountFromInvantory);
        return result.succeeded ? this.Success$(true) : this.Failure$(result.errors);
    }

    getProductsByCategoryId(categoryId: string): Observable<BaseResponseModel<Product[]>> {
        const products: Product[] = this.productRepository.getProductsByCategoryId(categoryId);
        return products ? this.Success$(products) : this.Success$([]);
    }

    getAvailableProductsByCategoryId(categoryId: string): Observable<BaseResponseModel<Product[]>> {
        const products: Product[] = this.productRepository.getProductsByCategoryId(categoryId);
        return products ? this.Success$(products.filter(p => p.isActive)) : this.Success$([]);
    }

    getProductsToSaleByCategoryId(categoryId: string): Observable<BaseResponseModel<Product[]>> {
        const products: Product[] = this.productRepository.getProductsByCategoryId(categoryId);
        return products ? this.Success$(products.filter(p => p.availableToSale)) : this.Success$([]);
    }

    getProductsToSelect(): Observable<BaseResponseModel<ProductSelectView[]>> {
        const categories: ProductCategory[] = this.categoryRepository.getProductCategories();
        const categoryProductsMap: Map<string, Product[]> = new Map<string, Product[]>();
        const products: Product[] = this.productRepository.getAvailableProducts();
        products.forEach(product => {
            if (!categoryProductsMap.has(product.categoryId))
                categoryProductsMap.set(product.categoryId, [product]);
            else
                categoryProductsMap.get(product.categoryId).push(product);
        });
        const productsToSelect: ProductSelectView[] = [];
        categories.forEach(category => {
            if (categoryProductsMap.has(category.id)) {
                categoryProductsMap.get(category.id)
                    .sort((p1, p2) => p1.order - p2.order)
                    .map(product => {
                        return {
                            id: product.id,
                            fullName: product.categoryName + " - " + product.name
                        }
                    })
                    .forEach(product => productsToSelect.push(product));
            }
        })
        return this.Success$(productsToSelect);
    }

    public getMaxOrder(categoryId: string): Observable<BaseResponseModel<number>> {
        const products: Product[] = this.productRepository.getProductsByCategoryId(categoryId);
        return this.Success$(Math.max(...products.map(c => c.order), 0));
    }

    private getNextOrder(categoryId: string): number {
        const products: Product[] = this.productRepository.getProductsByCategoryId(categoryId);
        return Math.max(...products.map(c => c.order), 0) + 1;
    }

    public deleteProduct(id: string): boolean {
        return this.productRepository.deleteProduct(id);
    }
}