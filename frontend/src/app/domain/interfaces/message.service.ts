import { Observable, of } from 'rxjs';
import { BaseService } from 'src/app/_services/base.service';
import { BaseResponseModel } from 'src/app/_services/_models/base.model';
import { Inject, Injectable } from '@angular/core';
import { Message } from '../entities/messages/message.model';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Injectable({
    providedIn: "root"
})
export class MessageService extends BaseService<Message> {

    override API_URL = `${environment.apiUrl}/${environment.apiVersion}/messages/`;

    constructor(@Inject(HttpClient) http) {
        super(http);
    }

    sendUpdateAvailableProductToSaleMessage(productId: string): Observable<BaseResponseModel<boolean>> {
        return of(this.Success(true));
    }
}