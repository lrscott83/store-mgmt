import { Injectable, Inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BaseService } from '../base.service';
import { BaseResponseModel } from '../_models/base.model';
import { Owner } from 'src/app/domain/entities/owners/owner.model';

@Injectable({
    providedIn: "root"
})

export class OwnerService extends BaseService<Owner> {
    override API_URL = `${environment.apiUrl}/${environment.apiVersion}/owners/`;

    constructor(@Inject(HttpClient) http) {
        super(http);
    }

    getOwners(): Observable<BaseResponseModel<Owner[]>> {
        return this.http.get<BaseResponseModel<Owner[]>>(this.API_URL + "all/true");
    }

    deleteOwner(id: any): Observable<BaseResponseModel<boolean>> {
        const url = this.API_URL + `${id}`;
        return this.http.delete<BaseResponseModel<boolean>>(url);
    }

     createOwner(fullName: string, login: string, password: string, cellPhone: string, email: string, description: string, reSellerId: string): Observable<BaseResponseModel<string>> {
        const requestData = {
            fullName: fullName,
            login: login,
            password: password,
            cellPhone: cellPhone,
            email: email,
            description: description,
            reSellerId: reSellerId,
        };
        return this.http.post<BaseResponseModel<string>>(this.API_URL, requestData);
    }

    getOwnerById(userId: string): Observable<BaseResponseModel<Owner>> {
        const url = this.API_URL + userId;
        return this.http.get<BaseResponseModel<Owner>>(url);
    }

    editOwner(id: string, fullName: string, cellPhone: string, email: string, guest:boolean, isActive: boolean, description: string, reSellerId: string): Observable<BaseResponseModel<boolean>> {
        const url = this.API_URL + `${id}`;
        const requestData = {
            fullName: fullName,
            cellPhone: cellPhone,
            email: email,
            guest: guest,
            isActive: isActive,
            description: description,
            reSellerId: reSellerId,
        };
        return this.http.put<BaseResponseModel<boolean>>(url, requestData);
    }

    getOwnerDetailsById(ownerId: string): Observable<Owner> {
        const url = this.API_URL + "details/" + ownerId;
        return this.http.get<Owner>(url);
    }
}