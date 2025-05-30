import { Injectable, Inject } from '@angular/core';
import { environment } from 'src/environments/environment';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { ProductCategoryService } from './product-category.service';
import { BaseResponseModel } from 'src/app/_services/_models/base.model';
import { ProductCategory } from 'src/app/domain/entities/product-categories/product-category.model';
import { ProductCategoryView } from './product-category.view';

// @Injectable({
//     providedIn: "root"
// })

@Injectable()
export class ProductCategoryOnlineService extends ProductCategoryService {
    override API_URL = `${environment.apiUrl}/${environment.apiVersion}/ProductCategories/`;

    constructor(@Inject(HttpClient) http) {
        super(http);
    }

    // getProductCategories(): Observable<BaseResponseModel<ProductCategory[]>> {
    //     const url = this.API_URL + "all/true";
    //     return this.http.get<any>(url);
    // }

    getAvailableProductCategories(): Observable<BaseResponseModel<ProductCategory[]>> {
        const url = this.API_URL + "all/false";
        return this.http.get<any>(url);
    }

    getProductCategoriesView(): Observable<BaseResponseModel<ProductCategoryView[]>> {
        const url = this.API_URL + "catalog";
        return this.http.get<any>(url);
    }

    // updateProductCategories(categories: ProductCategory[]): Observable<BaseResponseModel<boolean>> {
    //     const url = this.API_URL;
    //     return this.http.put<any>(url, categories);
    // }

    // getProductCategoryById(categoryId: string): Observable<BaseResponseModel<ProductCategory>> {
    //     const url = this.API_URL + "/" + categoryId;
    //     return this.http.get<any>(url);
    // }

    createProductCategory(name: string, order: number, isActive: boolean): Observable<BaseResponseModel<boolean>> {
        const createRequest = {
            name: name,
            order: order,
            isActive: isActive,
        };
        const url = this.API_URL;
        return this.http.post<any>(url, createRequest);
    }

    updateProductCategory(id: string, name: string, order: number, isActive: boolean): Observable<BaseResponseModel<boolean>> {
        const editRequest = {
            id: id,
            name: name,
            order: order,
            isActive: isActive,
        };
        const url = this.API_URL + "/" + id;
        return this.http.put<any>(url, editRequest);
    }

    getMaxOrder(): Observable<BaseResponseModel<number>> {
        const url = this.API_URL + "/maxOrder";
        return this.http.get<any>(url);
    }
}