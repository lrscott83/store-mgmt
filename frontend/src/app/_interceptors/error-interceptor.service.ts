import { Injectable, Injector } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/_services/auth/auth.service';
import { ToastrService } from 'ngx-toastr';
import { TranslateService } from '@ngx-translate/core';
import Swal from 'sweetalert2';

@Injectable({
  providedIn: 'root'
})
export class ErrorInterceptor implements HttpInterceptor {
  authService: any;
  translate: any;
  toastrService: any;

  constructor(
    private readonly injector: Injector,
    public router: Router
  ) {}

  private getAuthService(): AuthService {
    try {
      return this.injector.get(AuthService);
    } catch {
      return null;
    }
  }

  private getTranslate(): TranslateService {
    try {
      return this.injector.get(TranslateService);
    } catch {
      return null;
    }
  }

  private getToastr(): ToastrService {
    try {
      return this.injector.get(ToastrService);
    } catch {
      return null;
    }
  }

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(request).pipe(
      timeout(30000),
      catchError((err) => {
        // Handle network errors (offline) - don't re-throw, just return empty/error
        if (err.status === 0 || err.name === 'TimeoutError' || err.message?.includes('Network')) {
          console.warn('[ErrorInterceptor] Network error ignored:', err.message);
          // Return a re-thrown error but with a flag so GlobalErrorHandler can identify it
          const networkErr = new Error(err.message || 'Network error');
          (networkErr as any).isNetworkError = true;
          return throwError(() => networkErr);
        }

        switch (err.status) {
          case 401: {
            const authService = this.getAuthService();
            authService?.logout();
            return throwError(() => err);
          }
          case 403: {
            // 403 means "Forbidden" - user IS authenticated but doesn't have permission
            // OR backend is unavailable (e.g., usage tracker when offline)
            // DO NOT logout - just re-throw the error
            // The component/service that made the request can handle it silently
            return throwError(() => err);
          }
          case 404: {
            return throwError(() => err);
          }
          case 500: {
            const translate = this.getTranslate();
            Swal.fire({
              icon: 'error',
              title: translate?.instant('GENERAL.RESPONSE.ERROR_TITLE') || 'Error',
              text: translate?.instant('GENERAL.RESPONSE.ERROR500_MESSAGE') || 'Error interno del servidor'
            });
            return throwError(() => err);
          }
          case 503: {
            return throwError(() => err);
          }
          default: {
            return throwError(() => err);
          }
        }
      })
    );
  }
}
