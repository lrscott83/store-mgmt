import { Injectable, OnDestroy } from "@angular/core";
import { Observable, BehaviorSubject, of, Subscription, throwError } from "rxjs";
import { map, catchError, switchMap, finalize } from "rxjs/operators";
import { UserModel } from "./_models/auth-user.model";
import { AuthModel } from "./_models/auth.model";
import { AuthHTTPService } from "./auth-http";
import { environment } from "src/environments/environment";

import { StorageService } from "../storage/storage.service";
import { Router } from '@angular/router';
import { BaseResponseModel } from '../_models/base.model';



@Injectable({
  providedIn: "root",
})
export class AuthService implements OnDestroy {
  // private fields
  private unsubscribe: Subscription[] = []; // Read more: => https://brianflove.com/2016/12/11/anguar-2-unsubscribe-observables/
  private authLocalStorageToken = `${environment.appVersion}-${environment.USERDATA_KEY}`;

  // public fields
  currentUser$: Observable<UserModel>;
  isLoading$: Observable<boolean>;
  currentUserSubject: BehaviorSubject<UserModel>;
  isLoadingSubject: BehaviorSubject<boolean>;
  userChallenge: UserModel;

  get currentUserValue(): UserModel {
    //debugger
    if (this.userChallenge) {
      return this.userChallenge;
    }
    return this.currentUserSubject.value;
  }

  set currentUserValue(user: UserModel) {
    this.currentUserSubject.next(user);
  }

  constructor(
    private authHttpService: AuthHTTPService,
    private localStorageService: StorageService,
    private router: Router
  ) {
    this.isLoadingSubject = new BehaviorSubject<boolean>(false);
    this.currentUserSubject = new BehaviorSubject<UserModel>(undefined);
    this.currentUser$ = this.currentUserSubject.asObservable();
    this.isLoading$ = this.isLoadingSubject.asObservable();
    const subscr = this.getUserByToken().subscribe();
    this.unsubscribe.push(subscr);
  }

  // public methods
  login(login: string, password: string): Observable<UserModel | string> {
    this.isLoadingSubject.next(true);

    return this.authHttpService.login(login, password).pipe(
      map((response: BaseResponseModel<AuthModel>) => {
        if (response && response.succeeded) {
          this.localStorageService.setTokenToLocalStorage(response.data.authToken);
          response.data.expiresIn = new Date(Date.now() + 60 * 60 * 1000);
          const result = this.setAuthFromLocalStorage(response.data);
          return result;
        }
        return response.errors && response.errors.length > 0
          ? response.errors[0].description
          : "El usuario no pudo entrar porque el nombre de usuario o la contraseña no es correcta";
      }),
      switchMap((response) => {
        return typeof response === 'string' ? of(response.toString()) : this.getUserByToken();
      }),
      catchError((err) => {
        console.log(err);
        throw err;
      }),
      finalize(() => this.isLoadingSubject.next(false))
    );
  }

  logout() {
    this.isLoadingSubject.next(true);
    this.removeToken();

    this.authHttpService.logout().subscribe((url: string) => {
      this.removeToken();
      //document.location.reload();
      this.router.navigateByUrl("/login");
      this.isLoadingSubject.next(false);
    }, error => {
      console.log(error);
      this.isLoadingSubject.next(false);
      throw error;
    })

    // this.authHttpService
    //   .logout()
    //   .pipe(finalize(() => this.isLoadingSubject.next(false)))
    //   .subscribe((url: string) => {
    //     this.removeToken();
    //     document.location.reload();
    //     //this.router.navigateByUrl("/login");
    //   }),
    //   error => {
    //     console.log(error);
    //     throw error;
    //   };
  }

  // public methods
  getSocialToken(code: string): Observable<UserModel> {
    this.isLoadingSubject.next(true);
    return this.authHttpService.getSocialToken(code).pipe(
      map((auth: AuthModel) => {
        this.localStorageService.setTokenToLocalStorage(auth.authToken);
        console.log(auth);
        const result = this.setAuthFromLocalStorage(auth);
        return result;
      }),
      switchMap(() => this.getUserByToken()),
      catchError((err) => {
        console.error("err", err);
        return of(undefined);
      }),
      finalize(() => this.isLoadingSubject.next(false))
    );
  }

  signInGoogle() {
    this.isLoadingSubject.next(true);
    return this.authHttpService.signInGoogle().pipe(
      map((url: string) => {
        return url;
      }),
      finalize(() => this.isLoadingSubject.next(false))
    );
  }

  getUserByToken(): Observable<UserModel> {
    const auth = this.getAuthFromLocalStorage();
    if (!auth || !auth.authToken || !auth.expiresIn) {
      return of(undefined);
    }
    const currentUser = this.localStorageService.getCurrentUser();
    if (currentUser && auth.expiresIn > new Date()) {
      return of(currentUser);
    }
    this.isLoadingSubject.next(true);
    return this.authHttpService.getUserByToken(auth.authToken).pipe(
      map((response: BaseResponseModel<UserModel>) => {
        if (response && response.succeeded) {
          this.currentUserSubject = new BehaviorSubject<UserModel>(response.data);
        } else {
          this.logout();
          this.router.navigateByUrl("/login");
        }
        return response.data;
      }),
      finalize(() => this.isLoadingSubject.next(false))
    );
  }

  // need create new user then login
  registration(user: UserModel): Observable<any> {
    this.isLoadingSubject.next(true);
    return this.authHttpService.createUser(user).pipe(
      map(() => {
        this.isLoadingSubject.next(false);
      }),
      switchMap(() => this.login(user.login, user.password)),
      catchError((err) => {
        console.error("err", err);
        return of(undefined);
      }),
      finalize(() => this.isLoadingSubject.next(false))
    );
  }

  forgotPassword(email: string): Observable<boolean> {
    this.isLoadingSubject.next(true);
    return this.authHttpService
      .forgotPassword(email)
      .pipe(finalize(() => this.isLoadingSubject.next(false)));
  }

  getCurrentUserDefaultUrl() {
    if (!this.currentUserValue)
      return "/";
    return this.currentUserValue.isReSeller || this.currentUserValue.isSuperAdmin
      ? "/admin/owners"
      : "/sales/sale";
  }

  // private methods
  private setAuthFromLocalStorage(auth: AuthModel): boolean {
    // store auth authToken/refreshToken/epiresIn in local storage to keep user logged in between page refreshes
    //if (auth && auth.authToken) {
    localStorage.setItem(this.authLocalStorageToken, JSON.stringify(auth));
    return true;
    //}
    //return false;
  }

  private getAuthFromLocalStorage(): AuthModel {
    try {
      const authData = JSON.parse(
        localStorage.getItem(this.authLocalStorageToken)
      );
      return authData;
    } catch (error) {
      console.error(error);
      return undefined;
    }
  }

  removeToken(): Observable<void> {
    localStorage.removeItem(this.authLocalStorageToken);
    return of(void 0);
  }

  ngOnDestroy() {
    this.unsubscribe.forEach((sb) => sb.unsubscribe());
  }
}
