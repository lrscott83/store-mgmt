import { Injectable, Inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BaseService } from '../base.service';
import { BaseResponseModel } from '../_models/base.model';
import { ReSeller } from 'src/app/domain/resellers/reseller.model';

@Injectable({
    providedIn: "root"
})

export class ReSellerService extends BaseService<ReSeller> {
    override API_URL = `${environment.apiUrl}/${environment.apiVersion}/reSellers/`;

    constructor(@Inject(HttpClient) http) {
        super(http);
    }

    getReSellers(): Observable<BaseResponseModel<ReSeller[]>> {
        return this.http.get<BaseResponseModel<ReSeller[]>>(this.API_URL + "all/true");
    }

    deleteReSeller(id: any): Observable<BaseResponseModel<boolean>> {
        const url = this.API_URL + `${id}`;
        return this.http.delete<BaseResponseModel<boolean>>(url);
    }

     createReSeller(fullName: string, login: string, password: string, cellPhone: string, email: string, description: string): Observable<BaseResponseModel<string>> {
        const requestData = {
            fullName: fullName,
            login: login,
            password: password,
            cellPhone: cellPhone,
            email: email,
            description: description,
        };
        return this.http.post<BaseResponseModel<string>>(this.API_URL, requestData);
    }

    getReSellerById(userId: string): Observable<BaseResponseModel<ReSeller>> {
        const url = this.API_URL + userId;
        return this.http.get<BaseResponseModel<ReSeller>>(url);
    }

    editReSeller(id: string, fullName: string, cellPhone: string, email: string, percentDiscountPrice: number,
        discountPrice: number, isActive: boolean, description: string): Observable<BaseResponseModel<boolean>> {
        const url = this.API_URL + `${id}`;
        const requestData = {
            fullName: fullName,
            cellPhone: cellPhone,
            email: email,
            percentDiscountPrice: percentDiscountPrice,
            discountPrice: discountPrice,
            isActive: isActive,
            description: description,
        };
        return this.http.put<BaseResponseModel<boolean>>(url, requestData);
    }

    getReSellerDetailsById(reSellerId: string): Observable<ReSeller> {
        const url = this.API_URL + "details/" + reSellerId;
        return this.http.get<ReSeller>(url);
    }
}