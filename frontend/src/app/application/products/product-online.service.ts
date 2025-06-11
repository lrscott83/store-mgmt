import { Injectable, Inject } from '@angular/core';
import { environment } from 'src/environments/environment';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { BaseResponseModel } from 'src/app/_services/_models/base.model';
import { ProductService } from 'src/app/domain/interfaces/product.service';
import { Product } from 'src/app/domain/entities/products/product.model';
import { ProductSelectView } from './product-select.view';
import { CsvProduct } from 'src/app/_services/csv/models/csv-product.model';

// @Injectable({
//     providedIn: "root"
// })

@Injectable()
export class ProductOnlineService extends ProductService {
    override API_URL = `${environment.apiUrl}/${environment.apiVersion}/Products/`;

    constructor(@Inject(HttpClient) http) {
        super(http);
    }

    hasAnyAvailableToSaleProduct(): Observable<BaseResponseModel<boolean>> {
        const url = this.API_URL + "/hasAnyAvailableToSaleProduct";
        return this.http.get<any>(url);
    }

    getProductById(id: string): Observable<BaseResponseModel<Product>> {
        const url = this.API_URL + "/" + id;
        return this.http.get<any>(url);
    }

    getProductsToSelect(): Observable<BaseResponseModel<ProductSelectView[]>> {
        const url = this.API_URL + "/toEntry";
        return this.http.get<any>(url);
    }

    getAvailableProductsByCategoryId(categoryId: string): Observable<BaseResponseModel<Product[]>> {
        const url = this.API_URL + "/availableByCategoryId/" + categoryId;
        return this.http.get<any>(url);
    }

    getProductsToSaleByCategoryId(categoryId: string): Observable<BaseResponseModel<Product[]>> {
        const url = this.API_URL + "/toSaleByCategoryId/" + categoryId;
        return this.http.get<any>(url);
    }

    deleteProduct(id: string): Observable<BaseResponseModel<boolean>> {
        const url = this.API_URL + "/" + id;
        return this.http.delete<BaseResponseModel<boolean>>(url);
    }

    createCsvProducts(csvProducts: CsvProduct[]): Observable<BaseResponseModel<boolean>> {
        const request = {
            csvProducts: csvProducts,
        };
        const url = this.API_URL + "import";
        return this.http.post<any>(url, request);
    }

    getMaxOrder(categoryId: string): Observable<BaseResponseModel<number>> {
        const url = this.API_URL + "/maxOrderByCategoryId/" + categoryId;
        return this.http.get<any>(url);
    }

    createProduct(categoryId: string, name: string, price: number, businessId: string, order: number, isActive: boolean, availableToSale: boolean, discountFromInvantory: boolean): Observable<BaseResponseModel<boolean>> {
        const createRequest = {
            categoryId: categoryId,
            name: name,
            price: price,
            availableToSale: availableToSale,
            discountFromInvantory: discountFromInvantory,
            order: order,
            isActive: isActive,
            businessId: businessId,
        };
        const url = this.API_URL;
        return this.http.post<any>(url, createRequest);
    }

    updateProduct(id: string, categoryId: string, name: string, price: number, businessId: string, order: number, isActive: boolean, availableToSale: boolean, discountFromInvantory: boolean): Observable<BaseResponseModel<boolean>> {
        const editRequest = {
            id: id,
            categoryId: categoryId,
            name: name,
            price: price,
            availableToSale: availableToSale,
            discountFromInvantory: discountFromInvantory,
            order: order,
            isActive: isActive,
            businessId: businessId,
        };
        const url = this.API_URL + "/" + id;
        return this.http.put<any>(url, editRequest);
    }

    createProducts(categoryId: string, items: { name, price }[]): Observable<BaseResponseModel<boolean>> {
        const createRequest = {
            categoryId: categoryId,
            products: items,
        };
        const url = this.API_URL + "createProducts";
        return this.http.post<any>(url, createRequest);
    }

    
}