import { Component, OnInit } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { catchError } from 'rxjs';
import { CanDeactivateType } from 'src/app/_shared/guards/can-deactivate.guard';
import { StoreUserService } from 'src/app/_services/storeuser/store-user.service';

@Component({
  selector: 'app-create-store-user',
  standalone: true,
  imports: [SharedModule, TranslateModule, RouterModule],
  templateUrl: './create-store-user.component.html',
  styleUrl: './create-store-user.component.scss'
})
export class CreateStoreUserComponent implements OnInit {
  storeId: string;

  showPassword: boolean = false;
  formGroup: FormGroup;
  hasError: boolean;
  errorMessage: string;
  email: string = "info@mail.com";

  constructor(private formBuilder: FormBuilder, private translateService: TranslateService, private router: Router, private storeUserService: StoreUserService, private route: ActivatedRoute) {

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
    this.storeId = this.route.snapshot.params['storeId'];
    if (!this.storeId) {
      this.router.navigateByUrl("/management/stores");
      return;
    }
    this.loadForm();
  }

  async onSubmit(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.formGroup.valid) {
        this.formGroup.markAllAsTouched();
        return resolve(false);
      }

      this.storeUserService.createStoreUser(this.storeId, this.formGroup.value.fullName, this.formGroup.value.login, this.formGroup.value.password, this.formGroup.value.cellPhone, this.formGroup.value.email)
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
            this.router.navigateByUrl('/management/users');
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
      password: [{ value: "", disabled: false }, Validators.compose([Validators.required,
      Validators.pattern('(?=\\D*\\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}')])],
      confirmPassword: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
      cellPhone: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
      email: [{ value: "", disabled: false }, Validators.compose([Validators.email])],
    });
  }

  onShowPassword(event: MouseEvent) {
    this.showPassword = !this.showPassword;
    event.stopPropagation();
  }

  isControlInvalid(controlName: string, validator: string): boolean {
    const control = this.formGroup.controls[controlName];
    if (validator === "passwordMatch") {
      var pass = this.formGroup.get('password');
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
