import { Injectable } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { BlockUIService } from 'ng-block-ui';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';

@Injectable()
export class LoadingInterceptor implements HttpInterceptor {
  constructor(private blockUIService: BlockUIService) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    this.blockUIService.start('mainBlocker');

    return next.handle(req).pipe(
      finalize(() => {
        this.blockUIService.stop('mainBlocker');
      })
    );
  }
}
