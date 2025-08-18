import { Inject, Injectable } from "@angular/core";
import { environment } from "src/environments/environment";
import { BaseService } from "../base.service";
import { Usage } from "../usage-tracker/usage.model";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import { BaseResponseModel } from "../_models/base.model";
import { StoreUsages } from "./store-usages.model";


@Injectable({ providedIn: 'root' })
export class UsageService extends BaseService<Usage> {
    override API_URL = `${environment.apiUrl}/${environment.apiVersion}/usages/`;

    constructor(@Inject(HttpClient) http) {
        super(http);
    }

    getLastWeekUsageDaysCount(): Observable<BaseResponseModel<StoreUsages>> {
        return this.http.get<BaseResponseModel<StoreUsages>>(this.API_URL + "stores-last-week");
    }

    getLastMonthUsageDaysCount(): Observable<BaseResponseModel<StoreUsages>> {
        return this.http.get<BaseResponseModel<StoreUsages>>(this.API_URL + "stores-last-month");
    }
}