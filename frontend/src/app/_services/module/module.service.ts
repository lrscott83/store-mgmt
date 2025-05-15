import { Injectable, Inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BaseService } from '../base.service';
import { BaseResponseModel } from '../_models/base.model';
import { Module } from 'src/app/domain/entities/modules/module.model';

@Injectable({
    providedIn: "root"
})

export class ModuleService extends BaseService<Module> {
    override API_URL = `${environment.apiUrl}/${environment.apiVersion}/modules`;

    constructor(@Inject(HttpClient) http) {
        super(http);
    }

    getModulesToStore(): Observable<BaseResponseModel<Module[]>> {
        return this.http.get<BaseResponseModel<Module[]>>(this.API_URL + "/ToStore");
    }
}