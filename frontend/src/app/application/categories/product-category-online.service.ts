import { Injectable, Inject } from '@angular/core';
import { BaseService } from '../base.service';
import { environment } from 'src/environments/environment';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { BaseResponseModel } from 'src/app/models/base.model';
import { catchError } from 'rxjs/operators';
import { FormGroup } from '@angular/forms';
import { ProductCategory } from '../../modules/store-management/types/_models/product-category.model';
import { ProductCategoryService } from './product-category.service';

@Injectable({
    providedIn: "root"
})

export class ProductCategoryOnlineService extends ProductCategoryService {
    API_URL = `${environment.apiUrl}/${environment.apiVersion}/productCategories`;

    constructor(@Inject(HttpClient) http) {
        super(http);
    }

    getProductCategories(): Observable<BaseResponseModel<ProductCategory[]>> {
        const url = this.API_URL + "all/true";
        return this.http.get<any>(url);
    }

    // updateProductCategories(categories: ProductCategory[]): Observable<BaseResponseModel<boolean>> {
    //     const url = this.API_URL;
    //     return this.http.put<any>(url, categories);
    // }

    getProductCategoryById(categoryId: string): Observable<BaseResponseModel<ProductCategory>> {
        const url = this.API_URL + "/" + categoryId;
        return this.http.get<any>(url);
    }

    createProductCategory(name: string, order: number, isActive: boolean): Observable<BaseResponseModel<boolean>> {
        const createRequest = {
            name: name,
            order: order,
            isActive: isActive,
        };
        const url = this.API_URL;
        return this.http.post<any>(url, createRequest);
    }

    updateProductCategory(id: string, name: string, order: number, isActive: boolean): Observable<BaseResponseModel<boolean>>{
        const editRequest = {
            id: id,
            name: name,
            order: order,
            isActive: isActive,
        };
        const url = this.API_URL + "/" + id;
        return this.http.put<any>(url, editRequest);
    }
}