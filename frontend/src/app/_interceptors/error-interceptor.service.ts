import { Injectable, Injector } from "@angular/core";
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
} from "@angular/common/http";
import { Observable, throwError } from "rxjs";
import { catchError, timeout} from "rxjs/operators";
import { Router } from '@angular/router';
import { AuthService } from "src/app/_services/auth/auth.service";
import { ToastrService } from "ngx-toastr";
import { TranslateService } from "@ngx-translate/core";
import Swal from "sweetalert2";
import { MatSnackBar } from "@angular/material/snack-bar";

@Injectable({
  providedIn: "root",
})
export class ErrorInterceptor implements HttpInterceptor {
  authService: any;  
  translate: any;
  toastrService: any;
  constructor(
    private readonly injector: Injector,
    public router: Router,
    private snackBar: MatSnackBar     
  ) {}

  intercept(
    request: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    try {
      this.translate = this.injector.get(TranslateService);
      this.toastrService = this.injector.get(ToastrService);
      this.authService = this.injector.get(AuthService);
    } catch {
       console.log('auth service is not yet available');
    }
    return next.handle(request).pipe(       
      timeout(30000),
      catchError((err) => {
        switch (err.status) {          
          case 401: {
            this.authService.logout();
            //this.router.navigate(['error/401']);
            // Swal.fire({
            //   icon: "error",
            //   title: "Oops...",
            //   text: "err",
            // });
            //break;
            return throwError(() => err);            
          }
          case 400: {
            // Review Validation Error?
            
            //this.authService.logout();
            //this.router.navigate(['error/401']);
            // Swal.fire({
            //   icon: "error",
            //   title: "Oops...",
            //   text: "err",
            // });
            //break;    
            return throwError(() => err);
          }
          case 403: {
            this.authService.logout();
            //this.router.navigate(['error/403']);
            // Swal.fire({
            //   icon: "error",
            //   title: "Oops...",
            //   text: "Something went wrong",
            // });
            return throwError(() => err);
            //break;    
          }
          case 404: {
            //this.authService.logout();
            //this.router.navigate(['error/403']);
            // Swal.fire({
            //   icon: "error",
            //   title: "Oops...",
            //   text: "Something went wrong",
            // });
            
            
            // this.toastrService.warn(            
            //   this.translate.instant('GENERAL.RESPONSE.ERROR404_MESSAGE'),
            //   this.translate.instant('GENERAL.RESPONSE.WARNING_TITLE'));
            return throwError(() => err);
            //break;    
          }
          case 500: {
            //this.router.navigate(['error/500']);
            Swal.fire({
              icon: "error",
              title: this.translate.instant('GENERAL.RESPONSE.ERROR_TITLE'),
              text: this.translate.instant('GENERAL.RESPONSE.ERROR500_MESSAGE'),
            });
            return throwError(() => err);
            //break;    
          }
          default: {
            // Swal.fire({
            //   icon: "error",
            //   title: this.translate.instant('GENERAL.RESPONSE.ERROR_TITLE'),
            //   text: this.translate.instant('GENERAL.RESPONSE.ERROR500_MESSAGE'),
            // });
            //this.snackBar.open('Error!', '', { duration: 2000 });
            // this.toastrService.error(            
            //     this.translate.instant('GENERAL.RESPONSE.ERROR500_MESSAGE'),
            //     this.translate.instant('GENERAL.RESPONSE.ERROR_TITLE'));
            return throwError(() => err);
          }
        }
      })
    );
  }
}
/* return next.handle(request).pipe(timeout(30000), catchError(err => {
      switch (err.status) {
        case 401: {
          const user: any = JSON.parse(localStorage.getItem('currentUser'));
          if (user) {
            return this.refrechTokenUnauthorize(request, next);
          }
          return throwError(err);
        }
        case 500: {
          this.toastr.error('Ha ocurrido un error, contáctenos para más información');
          return throwError(err);
        }
        case 400: {

          if (
            request.url.includes("oauth")
          ) {
            if (request.body.includes("refresh_token")) {
              this.storageService.logout();
              this.storageService.authorizeSubject.next({ 'authorize': false, 'url': '/' });
              const modalRef = this.modalService.open(ModalExpiredSessionComponent, { centered: true, windowClass: 'expired-session' });
            } else {
              this.parseError(err);
            }
          } else {
            this.parseError(err);
          }
          return throwError(err);
        }
        case 503: {
          this.router.navigate(['/mantenimiento']);
          return throwError(err);
        }
        case 0: {
          this.toastr.error('Ha ocurrido un error, no se ha podido establecer la conexión con el servidor', null, {
            timeOut: 24000
          });
          return throwError(err);
        }
        default: {
          this.toastr.error('Ha ocurrido un error, contáctenos para más información');
          return throwError(err);
        }
      }
    }));
  }

  refrechTokenUnauthorize(request: HttpRequest<any>, next: HttpHandler): Observable<any> {
    if (this.refreshTokenInProgress) {
      // If refreshTokenInProgress is true, we will wait until refreshTokenSubject has a non-null value
      // – which means the new token is ready and we can retry the request again
      return this.refreshTokenSubject
        .pipe(
          filter(result => result !== null),
          take(1),
          switchMap(() => next.handle(this.addAuthenticationToken(request)))
        );
    } else {
      this.refreshTokenInProgress = true;

      // Set the refreshTokenSubject to null so that subsequent API calls will wait until the new token has been retrieved
      this.refreshTokenSubject.next(null);
      // Call auth.refreshAccessToken(this is an Observable that will be returned)
      return this.loginService.refreshAccessToken()
        .pipe(
          switchMap((token: any) => {
            this.refreshTokenInProgress = false;
            this.refreshTokenSubject.next(token);

            return next.handle(this.addAuthenticationToken(request));
          }),
          catchError((err: any) => {
            this.refreshTokenInProgress = false;
            if (
              request.url.includes("oauth")
            ) {
              if (!request.body.includes("refresh_token")) {
                this.parseError(err);
              }
            } else {
              this.parseError(err);
            }
            return throwError(err);
          })

        );
    }

  }

  addAuthenticationToken(request) {
    // Get access token from Local Storage
    const accessToken = this.storageService.getCurrentToken();
    // If access token is null this means that user is not logged in
    // And we return the original request
    if (!accessToken) {
      return request;
    }

    // We clone the request, because the original request is immutable
    return request.clone({
      setHeaders: {
        Authorization: `Bearer ${this.storageService.getCurrentToken()}`
      }
    });
  }

  parseError(err: any) {
    if (err.error.modelState) {
      for (const key in err.error.modelState) {
        if (err.error.modelState.hasOwnProperty(key)) {
          for (let i = 0; i < err.error.modelState[key].length; i++) {
            this.toastr.error(err.error.modelState[key][i], null, {
              timeOut: Utils.timeOutError(err.error.modelState[key][i])
            });
          }
        }
      }
    } else if (err.error.message) {
      this.toastr.error(err.error.message !== 'The request is invalid.' ?
        err.error.message : 'Ha ocurrido un error, contáctenos para más información', null, {
        timeOut: err.error.message !== 'The request is invalid.' ? Utils.timeOutError(err.error.message) : 10000
      });
    } else if (err.error.error_description) {
      this.toastr.error(err.error.error_description, null, {
        timeOut: Utils.timeOutError(err.error.error_description)
      });
    } else {
      this.toastr.error('Ha ocurrido un error, contáctenos para más información');
    }
  } */
