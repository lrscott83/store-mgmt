import { Injectable, Inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { UserModel } from '../auth/_models/auth-user.model';
import { BaseService } from '../base.service';
import { BaseResponseModel } from '../_models/base.model';
import { StoreUser } from 'src/app/domain/entities/store-user/store-user.model';
import { ERoles } from 'src/app/_shared/const/enums';

@Injectable({
    providedIn: "root"
})

export class StoreUserService extends BaseService<StoreUser> {
    override API_URL = `${environment.apiUrl}/${environment.apiVersion}/storeusers`;

    constructor(@Inject(HttpClient) http) {
        super(http);
    }

    getStoreUsers(includeInactive: boolean = true): Observable<BaseResponseModel<StoreUser[]>> {
        return this.http.get<BaseResponseModel<StoreUser[]>>(this.API_URL + "/list/" + includeInactive);
    }

    deleteStoreUser(id: any): Observable<BaseResponseModel<boolean>> {
        const url = this.API_URL + `${id}`;
        return this.http.delete<BaseResponseModel<boolean>>(url);
    }

    createStoreUser(storeId: string, fullName: string, login: string, password: string, cellPhone: string, email: string): Observable<BaseResponseModel<boolean>> {
        const requestData = {
            storeId: storeId,
            fullName: fullName,
            login: login,
            password: password,
            cellPhone: cellPhone,
            email: email,
            roleIds: [ERoles.StoreUser],
        };
        return this.http.post<BaseResponseModel<boolean>>(this.API_URL, requestData);
    }

    getStoreUserById(id: number): Observable<BaseResponseModel<StoreUser>> {
        const url = this.API_URL + "/" + id;
        return this.http.get<BaseResponseModel<StoreUser>>(url);
    }

    editStoreUser(id: number, fullName: string, cellPhone: string, email: string, isActive: boolean): Observable<BaseResponseModel<StoreUser>> {
        const url = this.API_URL + `/${id}`;
        const requestData = {
            fullName: fullName,
            cellPhone: cellPhone,
            email: email,
            isActive: isActive,
        };
        return this.http.put<BaseResponseModel<StoreUser>>(url, requestData);
    }

    // getUserDetailsById(userId: number): Observable<UserDetails> {
    //     const url = this.API_URL + "details/" + userId;
    //     return this.http.get<UserDetails>(url);
    // }
}