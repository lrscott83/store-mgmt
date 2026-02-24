import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable, catchError } from 'rxjs';
import { CanDeactivateType } from 'src/app/_shared/guards/can-deactivate.guard';
import { SharedModule } from '../../shared/shared.module';
import { BaseState } from 'src/app/_services/_models/base-state.model';
import { ReSeller } from 'src/app/domain/resellers/reseller.model';
import { ReSellerService } from 'src/app/_services/reseller/reseller.service';
import { UserModel } from 'src/app/_services/auth/_models/auth-user.model';
import { AuthService } from 'src/app/_services/services.index';

@Component({
    selector: 'app-create-reseller',
    imports: [SharedModule, TranslateModule, RouterModule],
    templateUrl: './create-reseller.component.html',
    styleUrl: './create-reseller.component.scss'
})
export class CreateResellerComponent implements OnInit {

  currentUser: UserModel;
  isSuperAdmin: boolean = false;

  showPassword: boolean = false;
  formGroup: FormGroup;
  hasError: boolean;
  errorMessage: string;
  email: string = "info@mail.com";

  baseState: BaseState;
  reSellersDataSource: Observable<ReSeller[]>;

  constructor(private formBuilder: FormBuilder, private translateService: TranslateService, private router: Router, private reSellerService: ReSellerService, private authService: AuthService) {

  }

  // @HostListener allows us to also guard against browser refresh, close, etc.
  //@HostListener('window:beforeunload')
  canDeactivate(): CanDeactivateType {
    return this.formGroup.pristine;
  }

  savePendingChanges(): Promise<boolean> {
    return this.onSubmit();
  }

  ngOnInit(): void {
    this.currentUser = this.authService.currentUserValue;
    this.isSuperAdmin = this.currentUser.isSuperAdmin;
    this.loadForm();
    if (this.isSuperAdmin)
      this.getReSellers();
  }

  getReSellers() {
    this.baseState = this.reSellerService.baseState;
    this.reSellerService.fetch();
    this.reSellersDataSource = this.reSellerService.items$;
  }

  async onSubmit(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.formGroup.valid) {
        this.formGroup.markAllAsTouched();
        return resolve(false);
      }

      this.reSellerService.createReSeller(this.formGroup.value.fullName, this.formGroup.value.login, this.formGroup.value.password, this.formGroup.value.cellPhone, this.formGroup.value.email, this.formGroup.value.description)
        .pipe(catchError((error) => {
          // return of({
          //   data: null,
          //   succeeded: false,
          //   message: "",
          //   actionCode: 400,
          //   errors: [this.translateService.instant('REGISTRATION.UNEXPECTED_ERROR')],
          // });
          resolve(false)
          throw error;
        }))
        .subscribe(response => {
          if (response && response.succeeded) {
            this.router.navigateByUrl('/admin/resellers');
            resolve(true);
            return;
          }
          this.hasError = true;
          this.errorMessage = response.errors[0].description;
          resolve(false);
        });
    })
  }

  loadForm() {
    this.formGroup = this.formBuilder.group({
      fullName: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
      login: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
      password: [{ value: "", disabled: false }, Validators.compose([Validators.pattern('(?=\\D*\\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}')])],
      confirmPassword: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
      cellPhone: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
      email: [{ value: "", disabled: false }, Validators.compose([Validators.required, Validators.email])],
      description: [{ value: "", disabled: false }, Validators.compose([])],
    });
  }

  onShowPassword(event: MouseEvent) {
    this.showPassword = !this.showPassword;
    event.stopPropagation();
  }

  isControlInvalid(controlName: string, validator: string): boolean {
    const control = this.formGroup.controls[controlName];
    if (validator === "passwordMatch") {
      const pass = this.formGroup.get('password');
      if (control.value && pass.value !== control.value) {
        control.setErrors({});
        return true;
      }
      if (control.value) {
        control.setErrors(null);
      }
      return false;
    }
    else {
      return control.hasError(validator) && (control.dirty || control.touched);
    }
  }
}

