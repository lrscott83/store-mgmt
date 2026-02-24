import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable, catchError } from 'rxjs';
import { UserModel } from 'src/app/_services/auth/_models/auth-user.model';
import { OwnerService } from 'src/app/_services/owner/owner.service';
import { AuthService } from 'src/app/_services/services.index';
import { CanDeactivateType } from 'src/app/_shared/guards/can-deactivate.guard';
import { Owner } from 'src/app/domain/entities/owners/owner.model';
import { SharedModule } from '../../shared/shared.module';
import { BaseState } from 'src/app/_services/_models/base-state.model';
import { ReSeller } from 'src/app/domain/resellers/reseller.model';
import { ReSellerService } from 'src/app/_services/reseller/reseller.service';

@Component({
    selector: 'app-edit-owner-details',
    imports: [SharedModule, TranslateModule, RouterModule],
    templateUrl: './edit-owner-details.component.html',
    styleUrl: './edit-owner-details.component.scss'
})
export class EditOwnerDetailsComponent implements OnInit{
  ownerId: string;
  currentUser: UserModel;
  isSuperAdmin: boolean = false;

  showPassword: boolean = false;
  formGroup: FormGroup;

  baseState: BaseState;
  reSellersDataSource: Observable<ReSeller[]>;

  hasError: boolean;
  errorMessage: string;
  email: string = "info@mail.com";

  constructor(private formBuilder: FormBuilder, private translateService: TranslateService, private router: Router, private ownerService: OwnerService, private route: ActivatedRoute, private authService: AuthService, private reSellerService: ReSellerService) {
    
  }

  canDeactivate(): CanDeactivateType {
    return this.formGroup.pristine;
  }

  savePendingChanges(): Promise<boolean> {
    return this.onSubmit();
  }

  ngOnInit(): void {
    this.currentUser = this.authService.currentUserValue;
    this.isSuperAdmin = this.currentUser.isSuperAdmin;
    this.ownerId = this.route.snapshot.params['id'];
    this.loadForm();
    if (this.isSuperAdmin)
      this.getReSellers();
    if (this.ownerId && this.ownerId !== "") {
      this.getOwnerById(this.ownerId);
    }
  }

  getReSellers() {
    this.baseState = this.reSellerService.baseState;
    this.reSellerService.fetch();
    this.reSellersDataSource = this.reSellerService.items$;
  }

  getOwnerById(ownerId: string) {
    this.ownerService.getOwnerById(ownerId)
    .pipe(catchError((error) => {
      // return of({
      //   data: null,
      //   succeeded: false,
      //   message: "",
      //   actionCode: 400,
      //   errors: [this.translateService.instant('REGISTRATION.UNEXPECTED_ERROR')],
      // });
      throw error;
    }))
    .subscribe(response => {
      if (response && response.succeeded) {
        this.loadOwner(response.data);
      }
    });
  }

  loadOwner(owner: Owner) {
    console.log("loadOwner: " + JSON.stringify(owner));
    if (this.formGroup){
      this.formGroup.patchValue(owner);                
    }
  }

  public async onSubmit(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.formGroup.valid) {
        this.formGroup.markAllAsTouched();
        return resolve(false);
      }

      this.ownerService.editOwner(this.ownerId, this.formGroup.value.fullName, this.formGroup.value.cellPhone, this.formGroup.value.email, this.formGroup.value.guest, this.formGroup.value.isActive, this.formGroup.value.description, this.formGroup.value.reSellerId)
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
            this.router.navigateByUrl('/admin/owners/edit/' + response.data);
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
      login: [{ value: "", disabled: true }, Validators.compose([])],
      fullName: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
      isActive: [{ value: false, disabled: false }, Validators.compose([])],
      cellPhone: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
      email: [{ value: "", disabled: false }, Validators.compose([Validators.required, Validators.email])],
      description: [{ value: "", disabled: false }, Validators.compose([])],
    });
    if (this.isSuperAdmin)
      this.formGroup.addControl('reSellerId', new FormControl("", []));
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
