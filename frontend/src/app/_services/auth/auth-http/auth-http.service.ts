import { Injectable } from "@angular/core";
import { Observable, of } from "rxjs";
import { HttpClient, HttpHeaders, HttpParams, HttpResponse } from "@angular/common/http";
import { catchError } from 'rxjs/operators';
import { Router } from '@angular/router';
import { AuthModel } from "../_models/auth.model";
import { BaseResponseModel } from "../../_models/base.model";
import { environment } from "src/environments/environment";
import { UserModel } from "../_models/auth-user.model";

const API_USERS_URL = `${environment.apiUrl}`;
// const params = new HttpParams();

@Injectable({
  providedIn: "root",
})
export class AuthHTTPService {
  constructor(private http: HttpClient, private router: Router) { }

  // public methods
  login(login: string, password: string): Observable<BaseResponseModel<AuthModel>> {
    //return this.http.post<AuthModel>(`${API_USERS_URL}/login`, {
    return this.http.post<BaseResponseModel<AuthModel>>(`${API_USERS_URL}/v1/auth/login`, {
      login,
      password
    });
  }

  registerOwner(fullName: string, login: string, password: string, cellPhone: string, email: string, storeName: string, code: string): Observable<BaseResponseModel<boolean>> {
    const requestData = {
      fullName: fullName,
      login: login,
      password: password,
      cellPhone: cellPhone,
      email: email,
      storeName: storeName,
      code: code
    };
    return this.http.post<BaseResponseModel<boolean>>(`${API_USERS_URL}/v1/auth/register`, requestData);
  }

  /* logout(): Observable<string> {
    return this.http.get<string>(
      `${API_USERS_URL}/v1/auth/logout?forcedAudience=http://localhost:4200/auth/login`
    );
  }
 */
  logout(): Observable<string | {}> {
    const localUrl = `${API_USERS_URL}/v1/auth/logout`;

    //if (environment.production) {
    return this.http.get<string>(localUrl).pipe(
      catchError((err) => {
        this.router.navigate(['/login']);
        return of({});
      })
    );
    // } else {
    //   let params = new HttpParams().set(
    //     "forcedAudience",
    //     "http://localhost:4200/auth/login"
    //   );
    //   return this.http.get<string>(`${localUrl}?${params.toString()}`);
    // }
  }

  // /api/v1/auth/google-auth-url?forcedAudience=https://localhost:44380/auth/login
  ///api/v1/auth/google-auth-url

  signInGoogle(): Observable<string> {
    const localUrl = `${API_USERS_URL}/v1/auth/google-auth-url`;

    /*   if (environment.production) {
      return this.http.get<string>(localUrl);
    } else {
      let param = new HttpParams().set(
        "forcedAudience",
        "http://localhost:4200/auth/login"
      ); */
    if (environment.production) {
      return this.http.get<string>(localUrl);
    } else {
      const params = new HttpParams().set(
        "forcedAudience",
        "http://localhost:4200/login"
      );
      return this.http.get<string>(`${localUrl}?${params.toString()}`);
    }

    /*   } */
    /* 
    return this.http.get<string>(
      `${API_USERS_URL}/v1/auth/google-auth-url?forcedAudience=http://localhost:4200/auth/login`
    ); */
  }

  //https://www.trucksolutionsapp.com/portal/api/v1/auth/google-auth-url?forcedAudience=https://localhost:4200/auth/login

  //google_auth_url

  getSocialToken(code: string): Observable<AuthModel> {
    const localUrl = `${API_USERS_URL}/v1/auth/get-social-token`;
    if (environment.production) {
      return this.http.post<AuthModel>(localUrl, code);
    } else {
      return this.http.post<AuthModel>(
        `${API_USERS_URL}/v1/auth/get-social-token`,
        {
          code,
          forcedAudience: "http://localhost:4200/login",
        }
      );
    }

    ///www.trucksolutionsapp.com/portal/apiapi/v1/auth/get-social-token
  }
  // http://localhost:4200/auth/login?code=3dd5334e-4c58-4176-b458-7d403b0e9746

  // CREATE =>  POST: add a new user to the server
  createUser(user: UserModel): Observable<UserModel> {
    return this.http.post<UserModel>(API_USERS_URL, user);
  }

  // Your server should check email => If email exists send link to the user and return true | If email doesn't exist return false
  forgotPassword(email: string): Observable<boolean> {
    return this.http.post<boolean>(`${API_USERS_URL}/forgot-password`, {
      email,
    });
  }

  getUserByToken(token): Observable<BaseResponseModel<UserModel>> {
    const httpHeaders = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
    return this.http.get<BaseResponseModel<UserModel>>(`${API_USERS_URL}/v1/auth/me`, {
      headers: httpHeaders,
    });
  }
}
