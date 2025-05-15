import { Component, Input, OnInit } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { catchError } from 'rxjs';
import { UserModel } from 'src/app/_services/auth/_models/auth-user.model';
import { AuthService } from 'src/app/_services/services.index';
import { UserService } from 'src/app/_services/user/user.service';

@Component({
  selector: 'app-edit-user-credentials',
  standalone: true,
  imports: [SharedModule, TranslateModule, RouterModule],
  templateUrl: './edit-user-credentials.component.html',
  styleUrl: './edit-user-credentials.component.scss'
})
export class EditUserCredentialsComponent  implements OnInit {

  @Input() userId: string;
  @Input() returnUrl: string;

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
  }

  async onSubmit(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.formGroup.valid) {
        this.formGroup.markAllAsTouched();
        return resolve(false);
      }

      this.userService.changePassword(this.userId, this.formGroup.value.oldPassword, this.formGroup.value.password)
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
      oldPassword: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
      password: [{ value: "", disabled: false }, Validators.compose([Validators.required,
      Validators.pattern('(?=\\D*\\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}')])],
      confirmPassword: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
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
