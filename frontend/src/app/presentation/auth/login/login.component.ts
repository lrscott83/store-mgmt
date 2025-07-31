// angular import
import { Component, Inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { catchError, Observable, Subscription } from 'rxjs';
import { AuthService } from 'src/app/_services/services.index';
import { GuestFooterComponent } from '../../layouts/guest/guest-footer/guest-footer.component';
import { UserModel } from 'src/app/_services/auth/_models/auth-user.model';
import { ConnectionService } from 'src/app/_services/connection/connection.service';
import { ToastrService } from 'ngx-toastr';
import Swal from 'sweetalert2';
import { Product } from 'src/app/domain/entities/products/product.model';
import { ProductService } from 'src/app/domain/interfaces/product.service';
import { PRODUCT_SERVICE } from 'src/app/_services/tokens';
import { StoreUsageTrackerService } from 'src/app/_services/usage-tracker/store-usage-tracker.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterModule, SharedModule, TranslateModule, GuestFooterComponent],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export default class LoginComponent implements OnInit {

  connectionStatus$: Observable<boolean>;

  loginForm: FormGroup;
  hasError: boolean;
  errorMessage: string;
  isLoading$: Observable<boolean>;
  showPassword: boolean = false;

  private unsubscribe: Subscription[] = [];

  constructor(private formBuilder: FormBuilder,
    private authService: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private translate: TranslateService,
    private connectionService: ConnectionService,
    private toastrService: ToastrService,
    private storeUsageTracker: StoreUsageTrackerService,
    @Inject(PRODUCT_SERVICE) private productService: ProductService,
  ) {
    this.isLoading$ = this.authService.isLoading$;
    // redirect to home if already logged in
    if (this.authService.currentUserValue) {
      this.navigateToUserHome();
    }

  }

  ngOnInit(): void {
    this.connectionStatus$ = this.connectionService.getStatus();
    // this.connectionStatus$.subscribe((status) => {
    //   if (!status) {
    //     this.toastrService.warning(
    //       this.translate.instant('AUTH.LOGIN.OFFLINE_MESSAGE'), 
    //       this.translate.instant('AUTH.LOGIN.OFFLINE_TITLE'));
    //   } else {
    //     this.toastrService.success(
    //       this.translate.instant('AUTH.LOGIN.ONLINE_MESSAGE'), 
    //       this.translate.instant('AUTH.LOGIN.ONLINE_TITLE'));
    //   }
    // });
    this.initForm();
  }


  // public method
  // SignInOptions = [
  //   {
  //     image: 'assets/images/authentication/google.svg',
  //     name: 'Google'
  //   },
  //   {
  //     image: 'assets/images/authentication/twitter.svg',
  //     name: 'Twitter'
  //   },
  //   {
  //     image: 'assets/images/authentication/facebook.svg',
  //     name: 'Facebook'
  //   }
  // ];

  // convenience getter for easy access to form fields
  private formControls() {
    return this.loginForm.controls;
  }

  initForm() {
    this.loginForm = this.formBuilder.group({
      login: ['',
        Validators.compose([
          Validators.required,
          // https://stackoverflow.com/questions/386294/what-is-the-maximum-length-of-a-valid-email-address
        ]),
      ],
      password: [
        '',
        Validators.compose([
          Validators.required,
          //Validators.pattern('(?=\\D*\\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}'),
        ]),
      ],
    });
  }

  isControlInvalid(controlName: string, validator: string): boolean {
    const control = this.loginForm.controls[controlName];
    if (validator == "") {
      return control.hasError('required') && (control.dirty || control.touched);
    } else {
      return control.hasError(validator) && (control.dirty || control.touched);
    }
  }

  submit() {
    if (!this.loginForm.valid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.hasError = false;
    const loginSubscr = this.authService
      .login(this.loginForm.controls['login'].value, this.loginForm.controls['password'].value)
      .pipe(catchError((error) => {
        // return of({
        //   data: null,
        //   succeeded: false,
        //   message: "",
        //   actionCode: 400,
        //   errors: [this.translateService.instant('REGISTRATION.UNEXPECTED_ERROR')],
        // });
        if (error.status === 0) {
          // Error de red
          Swal.fire({
            icon: "error",
            title: this.translate.instant('GENERAL.RESPONSE.ERROR_TITLE'),
            text: this.translate.instant('AUTH.LOGIN.OFFLINE_MESSAGE'),
          });
        } else {
          Swal.fire({
            icon: "error",
            title: this.translate.instant('GENERAL.RESPONSE.ERROR_TITLE'),
            text: this.translate.instant('AUTH.LOGIN.UNEXPECTED_ERROR'),
          });
        }
        //this.toastrService.warning(this.translate.instant('AUTH.LOGIN.UNEXPECTED_ERROR'));

        // if (!this.connectionService.currentStatusValue) {
        //   this.toastrService.error(            
        //     this.translate.instant('GENERAL.RESPONSE.OFFLINE_MESSAGE'),
        //     this.translate.instant('GENERAL.RESPONSE.OFFLINE_TITLE'));
        // }
        throw error;
      }))
      .subscribe((response) => {
        if (typeof response === 'string' || response instanceof String) {
          this.hasError = true;
          this.errorMessage = !response
            ? this.translate.instant('AUTH.LOGIN.UNEXPECTED_ERROR')
            : this.translate.instant('AUTH.LOGIN.INVALID_ERROR', { error: response });
          return;
        }
        this.storeUsageTracker.stopTracking();
        this.storeUsageTracker.startTracking();
        this.navigateToUserHome();
      });
    this.unsubscribe.push(loginSubscr);
  }

  navigateToUserHome() {
    if (this.authService.currentUserValue.isReSeller
      || this.authService.currentUserValue.isSuperAdmin)
      this.router.navigateByUrl("/admin/owners");
    else {
      this.productService.hasAnyAvailableToSaleProduct().subscribe(response => {
        if (response?.data)
          this.router.navigateByUrl("/sales/sale");
        else
          this.router.navigateByUrl("/sales/products");
      });

    }
  }

  ngOnDestroy() {
    this.unsubscribe.forEach((sb) => sb.unsubscribe());
  }

  onShowPassword(event: MouseEvent) {
    this.showPassword = !this.showPassword;
    event.stopPropagation();
  }
}
