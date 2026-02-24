import { Injectable, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { ProductCategoryService } from './product-category.service';
import { ProductCategoryRepository } from './product-category.repository';
import { ProductRepository } from '../products/product.repository';
import { BaseResponseModel } from 'src/app/_services/_models/base.model';
import { ProductCategory } from 'src/app/domain/entities/product-categories/product-category.model';
import { ProductCategoryErrors } from 'src/app/domain/entities/product-categories/product-category.errors';
import { Result } from 'src/app/domain/commons/result';
import { ProductCategoryView } from './product-category.view';

// @Injectable({
//     providedIn: "root"
// })

@Injectable()

export class ProductCategoryOfflineService extends ProductCategoryService {

    constructor(@Inject(HttpClient) http, private categoryRepository: ProductCategoryRepository, private productRepository: ProductRepository) {
        super(http);
    }

    // getProductCategoryById(categoryId: string): Observable<BaseResponseModel<ProductCategory>> {
    //     const category = this.categoryRepository.getProductCategoryById(categoryId);
    //     return category ? this.Success$(category) : this.Failure$([ProductCategoryErrors.NotExists]);
    // }

    createProductCategory(name: string, order: number, isActive: boolean): Observable<BaseResponseModel<boolean>> {
        const result: Result = this.categoryRepository.addProductCategory(name, order, isActive);
        return result.succeeded ? this.Success$(true) : this.Failure$(result.errors);
    }

    updateProductCategory(id: string, name: string, order: number, isActive: boolean): Observable<BaseResponseModel<boolean>> {
        const result: Result = this.categoryRepository.updateProductCategory(id, name, order, isActive);
        return result.succeeded ? this.Success$(true) : this.Failure$(result.errors);
    }

    getProductCategories(): Observable<BaseResponseModel<ProductCategory[]>> {
        const categories: ProductCategory[] = this.categoryRepository.getProductCategories();
        return this.Success$(categories);
    }

    getAvailableProductCategories(): Observable<BaseResponseModel<ProductCategory[]>> {
        const categories: ProductCategory[] = this.categoryRepository.getAvailableProductCategories();
        return this.Success$(categories);
    }

    getProductCategoriesView(): Observable<BaseResponseModel<ProductCategoryView[]>> {
        console.log("ProductCategoryOfflineService.getProductCategoriesView");
        const categories: ProductCategory[] = this.categoryRepository.getAvailableProductCategories();
        const categoriesView: ProductCategoryView[] = categories
        .map(category => {
            const productsCount = this.productRepository.getAvailableToSaleProductsByCategoryId(category.id).length;
            return {
                id: category.id,
                name: category.name,
                order: category.order,
                isActive: category.isActive, 
                productsCount: productsCount,
            };
        });
        return this.Success$(categoriesView);
    }

    // updateProductCategories(categories: ProductCategory[]): Observable<BaseResponseModel<boolean>> {
    //     const currentCategories: ProductCategory[] = this.getProductCategoriesFromLocalStorage();
    //     categories.forEach(category => {
    //         let currentCategory: ProductCategory = currentCategories.find(c => c.id === category.id);
    //         if (!currentCategory) {
    //             // Insert
    //             if (currentCategories.some(c => c.name === category.name))
    //                 return of(this.getBooleanBaseResponseModel(false));

    //             const order = this.getNewOrder(currentCategories);
    //             const newCategory: ProductCategory = {
    //                 id: Guid.create().toString(),
    //                 name: category.name,
    //                 isActive: true,
    //                 order: order,
    //             };
    //             currentCategories.push(newCategory);
    //         } else {
    //             // Update
    //             if (currentCategories.some(c => c.name === category.name && c.id !== currentCategory.id))
    //                 return of(this.getBooleanBaseResponseModel(false));

    //             currentCategory.order = category.order;
    //             currentCategory.order = category.order;
    //             currentCategory.order = category.order;
    //         }
    //     });

    //     this.setProductCategoriesLocalStorage(currentCategories);

    //     return of(this.getBooleanBaseResponseModel(true));
    // }

    public getMaxOrder(): Observable<BaseResponseModel<number>> {
        const categories: ProductCategory[] = this.categoryRepository.getProductCategories();
        return this.Success$(Math.max(...categories.map(c => c.order), 0));    
    }
}