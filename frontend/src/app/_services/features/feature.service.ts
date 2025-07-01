import { Injectable, Inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BaseService } from '../base.service';
import { BaseResponseModel } from '../_models/base.model';
import { Feature } from 'src/app/domain/entities/features/feature.model';

@Injectable({
    providedIn: "root"
})

export class FeatureService extends BaseService<Feature> {
    override API_URL = `${environment.apiUrl}/${environment.apiVersion}/features/`;

    constructor(@Inject(HttpClient) http) {
        super(http);
    }

    activateFeatures(): Observable<BaseResponseModel<boolean>> {
        const url = this.API_URL + `activate`;
        return this.http.post<BaseResponseModel<boolean>>(url, {});
    }

    getFeatures(): Observable<BaseResponseModel<Feature[]>> {
        return this.http.get<BaseResponseModel<Feature[]>>(this.API_URL + "all/true");
    }

    deleteFeature(id: any): Observable<BaseResponseModel<boolean>> {
        const url = this.API_URL + `${id}`;
        return this.http.delete<BaseResponseModel<boolean>>(url);
    }

    getFeatureDetailsById(featureId: string): Observable<Feature> {
        const url = this.API_URL + "details/" + featureId;
        return this.http.get<Feature>(url);
    }
}