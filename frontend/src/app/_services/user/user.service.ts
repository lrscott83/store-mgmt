import { Injectable, Inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BaseService } from '../base.service';
import { BaseResponseModel } from '../_models/base.model';
import { User } from 'src/app/domain/entities/users/user.model';

@Injectable({
    providedIn: "root"
})

export class UserService extends BaseService<User> {
    override API_URL = `${environment.apiUrl}/${environment.apiVersion}/users/`;

    constructor(@Inject(HttpClient) http) {
        super(http);
    }

    getUsers(): Observable<BaseResponseModel<User[]>> {
        return this.http.get<BaseResponseModel<User[]>>(this.API_URL + "all/true");
    }

    deleteUser(id: string): Observable<BaseResponseModel<boolean>> {
        const url = this.API_URL + `${id}`;
        return this.http.delete<BaseResponseModel<boolean>>(url);
    }

    activateUser(id: string, isActive: boolean): Observable<BaseResponseModel<boolean>> {
        const url = this.API_URL + `activate`;
        const requestData = {
            id: id,
            isActive: isActive,
        };
        return this.http.post<BaseResponseModel<boolean>>(url, requestData);
    }

    createUser(fullName: string, login: string, password: string, cellPhone: string, email: string): Observable<BaseResponseModel<boolean>> {
        const requestData = {
            fullName: fullName,
            login: login,
            password: password,
            cellPhone: cellPhone,
            email: email,
        };
        return this.http.post<BaseResponseModel<boolean>>(this.API_URL, requestData);
    }

    getUserById(userId: string): Observable<BaseResponseModel<User>> {
        const url = this.API_URL + userId;
        return this.http.get<BaseResponseModel<User>>(url);
    }

    editUser(id: string, fullName: string, cellPhone: string, email: string, isActive: boolean): Observable<BaseResponseModel<boolean>> {
        const url = this.API_URL + `${id}`;
        const requestData = {
            fullName: fullName,
            cellPhone: cellPhone,
            email: email,
            isActive: isActive,
        };
        return this.http.put<BaseResponseModel<boolean>>(url, requestData);
    }

    changePassword(id: string, oldPassword: string, newPassword: string): Observable<BaseResponseModel<boolean>> {
        const url = this.API_URL + `change-password/${id}`;
        const requestData = {
            oldPassword: oldPassword,
            newPassword: newPassword,
        };
        return this.http.post<BaseResponseModel<boolean>>(url, requestData);
    }
}