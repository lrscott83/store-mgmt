/**
 * Created by Elaine Lopez on 4/23/2019.
 */

import { Injectable } from "@angular/core";
import { Router } from "@angular/router";
import { BehaviorSubject, Observable } from "rxjs";
import { HttpClient } from "@angular/common/http";
import { UserModel } from '../auth/_models/auth-user.model';

@Injectable({
  providedIn: "root",
})
export class StorageService {
  private localStorage;
  private currentUserSubject: BehaviorSubject<any>;
  currentUser: Observable<any>;
  authorize: Observable<{}>;
  landingPageSubject: BehaviorSubject<boolean>;
  landingPage: Observable<boolean>;
  authorizeSubject: BehaviorSubject<{}>;

  constructor(private router: Router, private http: HttpClient) {
    this.localStorage = localStorage;
    this.currentUserSubject = new BehaviorSubject<any>(
      JSON.parse(localStorage.getItem("currentUser"))
    );
    this.currentUser = this.currentUserSubject.asObservable();
    this.authorizeSubject = new BehaviorSubject<{}>({
      authorize: true,
      url: "",
    });
    this.authorize = this.authorizeSubject.asObservable();
  }

  setTokenToLocalStorage(token: string) {
    this.localStorage.setItem("token", token);
  }
  getTokenFromLocalStorage() {
    return this.localStorage.getItem("token");
  }
  removeTokenFromLocalStorage() {
    this.localStorage.removeItem("token");
  }

  // setCurrentUser(user: any): void {
  //   this.localStorage.setItem("currentUser", JSON.stringify(user));
  //   this.currentUserSubject.next(user);
  // }

  setCurrentUser(user: UserModel): void {
    this.localStorage.setItem("currentUser", JSON.stringify(user));
  }
  // loadSessionData(): any {
  //   const userStr = this.localStorageService.getItem("currentUser");
  //   return userStr ? <any>JSON.parse(userStr) : null;
  // }
  removeCurrentUser(): void {
    this.localStorage.removeItem("currentUser");
  }

  getCurrentUser(): UserModel {
    return JSON.parse(localStorage.getItem("currentUser"));
  }
  // isAuthenticated(): boolean {
  //   return this.getCurrentToken() != null ? true : false;
  // }
  // getCurrentToken(): string {
  //   const user = this.getCurrentUser();
  //   return user != null && user. ? user.access_token : null;
  // }
  // logout(): void {
  //   this.removeCurrentUser();
  //   this.currentUserSubject.next(null);
  //   this.router.navigate([""]);
  // }

  // logoutWithoutRedirect() {
  //   this.removeCurrentUser();
  //   this.currentUserSubject.next(null);
  // }
}
