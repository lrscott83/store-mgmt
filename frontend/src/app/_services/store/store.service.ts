import { Injectable, Inject } from '@angular/core';
import { BaseService } from '../base.service';
import { environment } from 'src/environments/environment';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { FormGroup } from '@angular/forms';
import { Store } from 'src/app/domain/entities/stores/store.model';
import { BaseResponseModel } from '../_models/base.model';

@Injectable({
    providedIn: "root"
})

export class StoreService extends BaseService<Store>{
    override API_URL = `${environment.apiUrl}/${environment.apiVersion}/stores`;

    constructor(@Inject(HttpClient) http) {
        super(http);
    }

    getStoresByCurrentUser(): Observable<BaseResponseModel<Store[]>> {
        //const url = this.API_URL + "all/" + includeInactive;
        const url = this.API_URL + "/by-current-user";
        return this.http.get<any>(url);
    }

    // setSelectedStore(storeId: string) {
    //     if (storeId) {
    //         var form = {
    //             storeId: storeId
    //         }
    //         return this.http.put(this.API_URL, form);
    //     }
    // }

    createStore(ownerId: string, name: string, address: string, description: string, approved: boolean, moduleIds: number[]): Observable<BaseResponseModel<Store>> {
        const createStoreRequest = {
            ownerId: ownerId,
            name: name,
            address: address,
            description: description,
            approved: approved,
            moduleIds: moduleIds
        };
        return this.http.post<any>(this.API_URL, createStoreRequest);
    }

    editStore(storeId: string, name: string, address: string, description: string, approved: boolean, 
        paymentStartDate: string | null, isActive: boolean, moduleIds: number[]): Observable<BaseResponseModel<boolean>> {
        const editStoreRequest = {
            id: storeId,
            name: name,
            address: address,
            description: description,
            approved: approved,
            paymentStartDate: paymentStartDate,
            moduleIds: moduleIds,
            isActive: isActive
        };
        const url = this.API_URL + "/" + storeId;
        return this.http.put<any>(url, editStoreRequest);
    }

    activateStore(storeId: string): Observable<BaseResponseModel<boolean>> {
        const storeRequest = {
            id: storeId
        };
        const url = this.API_URL + "/activate";
        return this.http.post<any>(url, storeRequest);
    }

    approveStore(storeId: string): Observable<BaseResponseModel<boolean>> {
        const storeRequest = {
            id: storeId
        };
        const url = this.API_URL + "/approve";
        return this.http.post<any>(url, storeRequest);
    }

    disapproveStore(storeId: string): Observable<BaseResponseModel<boolean>> {
        const storeRequest = {
            id: storeId
        };
        const url = this.API_URL + "/disapprove";
        return this.http.post<any>(url, storeRequest);
    }

    getStoreById(storeId: string): Observable<BaseResponseModel<Store>> {
        const url = this.API_URL + "/" + storeId;
        return this.http.get<any>(url);
    }
}