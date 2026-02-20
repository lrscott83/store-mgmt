import { Injectable, Injector } from "@angular/core";
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
} from "@angular/common/http";
import { Observable} from "rxjs";
import { switchMap, take} from "rxjs/operators";
import { ConnectionService } from "../_services/connection/connection.service";

// @Injectable({
//   providedIn: "root",
// })
export class ConnectionInterceptor implements HttpInterceptor {
  connectionService: any;  
  constructor(
    private readonly injector: Injector  
  ) {}

  intercept(
    request: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    try {
      this.connectionService = this.injector.get(ConnectionService);
    } catch {
       console.log('Connection Service is not yet available');
    }
    return this.connectionService.getStatus().pipe(
      take(1),
      switchMap(online => {
        //if (!online) throw new Error('Sin conexión');
        return next.handle(request);
      })
    );
  }
}
