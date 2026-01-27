import { Component, Input, OnInit } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { catchError } from 'rxjs';
import { UserService } from 'src/app/_services/user/user.service';
import { User } from 'src/app/domain/entities/users/user.model';
import { AuthService } from 'src/app/_services/services.index';
import { UserModel } from 'src/app/_services/auth/_models/auth-user.model';

@Component({
    selector: 'app-edit-user-details',
    imports: [SharedModule, TranslateModule, RouterModule],
    templateUrl: './edit-user-details.component.html',
    styleUrl: './edit-user-details.component.scss'
})
export class EditUserDetailsComponent implements OnInit {

  @Input() user: User;
  @Input() returnUrl: string;
  @Input() showActiveControl: boolean = false;

  currentUser: UserModel;
  isSuperAdminOrOwnerAdmin: boolean;

  showPassword: boolean = false;
  formGroup: FormGroup;
  hasError: boolean;
  errorMessage: string;
  email: string = "info@mail.com";

  constructor(private formBuilder: FormBuilder, private translateService: TranslateService, private router: Router, private userService: UserService, private route: ActivatedRoute, private authService: AuthService) {

  }

  ngOnInit(): void {
    this.currentUser = this.authService.currentUserValue;
    this.isSuperAdminOrOwnerAdmin = this.currentUser.isSuperAdmin || this.currentUser.isOwnerAdmin;
    this.loadForm();
    this.formGroup.patchValue(this.user);
  }

  async onSubmit(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.formGroup.valid) {
        this.formGroup.markAllAsTouched();
        return resolve(false);
      }

      this.userService.editUser(this.user.id, this.formGroup.value.fullName, this.formGroup.value.cellPhone, this.formGroup.value.email, this.formGroup.value.isActive)
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
            this.router.navigateByUrl(!this.returnUrl ? '/' : this.returnUrl);
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
      cellPhone: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
      email: [{ value: "", disabled: false }, Validators.compose([Validators.email])],
    });
    if (this.showActiveControl && this.isSuperAdminOrOwnerAdmin)
      this.formGroup.addControl('isActive', new FormControl("", []));
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
