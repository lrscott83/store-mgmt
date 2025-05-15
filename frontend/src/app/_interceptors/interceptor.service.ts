import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { StorageService } from "../_services/storage/storage.service";

@Injectable(
  {
    providedIn: "root",
  }
)
export class InterceptorService implements HttpInterceptor {

  constructor(private localStorageService: StorageService) { }

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    return next.handle(this.addAuthToken(req));
  }

  addAuthToken(request: HttpRequest<any>) {
    const token = this.localStorageService.getTokenFromLocalStorage();

    if (!token) {
      return request;
    }

    return request.clone({
      setHeaders: {
        'Authorization': `Bearer ${token}`,
        //'Access-Control-Allow-Origin': `http://localhost:4200/`,
        //'Access-Control-Allow-Origin': `*`,
        //'Access-Control-Allow-Credentials': 'true'
      },
    });
  }
}