import { Injectable } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { LoadingService } from '../_services/loading.service';

@Injectable()
export class LoadingInterceptor implements HttpInterceptor {
  constructor(private loadingService: LoadingService) {
    console.log('[LoadingInterceptor] CONSTRUCTOR called - interceptor is being instantiated');
  }

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    console.log('[LoadingInterceptor] Intercepting request:', req.method, req.url);
    this.loadingService.start();

    return next.handle(req).pipe(
      finalize(() => {
        this.loadingService.stop();
      })
    );
  }
}
