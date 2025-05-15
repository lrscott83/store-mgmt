import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable, catchError } from 'rxjs';
import { UserModel } from 'src/app/_services/auth/_models/auth-user.model';
import { AuthService } from 'src/app/_services/services.index';
import { CanDeactivateType } from 'src/app/_shared/guards/can-deactivate.guard';
import { SharedModule } from '../../shared/shared.module';
import { BaseState } from 'src/app/_services/_models/base-state.model';
import { ReSellerService } from 'src/app/_services/reseller/reseller.service';
import { ReSeller } from 'src/app/domain/resellers/reseller.model';
import { RegExExtensions } from 'src/app/_helpers/extensions/regex-extension';

@Component({
  selector: 'app-edit-reseller-details',
  standalone: true,
  imports: [SharedModule, TranslateModule, RouterModule],
  templateUrl: './edit-reseller-details.component.html',
  styleUrl: './edit-reseller-details.component.scss'
})
export class EditResellerDetailsComponent implements OnInit {
  reSellerId: string;
  currentUser: UserModel;
  isSuperAdmin: boolean = false;

  showPassword: boolean = false;
  formGroup: FormGroup;
  formPatterns: any;

  baseState: BaseState;
  reSellersDataSource: Observable<ReSeller[]>;

  hasError: boolean;
  errorMessage: string;
  email: string = "info@mail.com";

  constructor(private formBuilder: FormBuilder, private translateService: TranslateService, private router: Router, private reSellerService: ReSellerService, private route: ActivatedRoute, private authService: AuthService) {
    
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
    this.reSellerId = this.route.snapshot.params['id'];
    this.loadForm();
    if (this.isSuperAdmin)
      this.getReSellers();
    if (this.reSellerId && this.reSellerId !== "") {
      this.getReSellerById(this.reSellerId);
    }
  }

  getReSellers() {
    this.baseState = this.reSellerService.baseState;
    this.reSellerService.fetch();
    this.reSellersDataSource = this.reSellerService.items$;
  }

  getReSellerById(reSellerId: string) {
    this.reSellerService.getReSellerById(reSellerId)
    .pipe(catchError((error) => {
      // return of({
      //   data: null,
      //   succeeded: false,
      //   message: "",
      //   actionCode: 400,
      //   errors: [this.translateService.instant('REGISTRATION.UNEXPECTED_ERROR')],
      // });
      this.router.navigateByUrl('/admin/resellers/' + this.reSellerId);
      throw error;
    }))
    .subscribe(response => {
      if (response && response.succeeded) {
        this.loadReSeller(response.data);
      }
    });
  }

  loadReSeller(reSeller: ReSeller) {
    console.log("loadReSeller: " + JSON.stringify(reSeller));
    if (this.formGroup){
      this.formGroup.patchValue(reSeller);                
    }
  }

  public async onSubmit(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.formGroup.valid) {
        this.formGroup.markAllAsTouched();
        return resolve(false);
      }

      this.reSellerService.editReSeller(this.reSellerId, this.formGroup.value.fullName, this.formGroup.value.cellPhone, this.formGroup.value.email, this.formGroup.value.percentDiscountPrice, this.formGroup.value.discountPrice, this.formGroup.value.isActive, this.formGroup.value.description)
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
            this.router.navigateByUrl('/admin/resellers/edit/' + this.reSellerId);
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
    this.loadPatterns();
    this.formGroup = this.formBuilder.group({
      login: [{ value: "", disabled: true }, Validators.compose([])],
      fullName: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
      isActive: [{ value: false, disabled: false }, Validators.compose([])],
      cellPhone: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
      email: [{ value: "", disabled: false }, Validators.compose([Validators.required, Validators.email])],
      description: [{ value: "", disabled: false }, Validators.compose([])],
      percentDiscountPrice: [{ value: "", disabled: false }, Validators.compose([
        Validators.required,
        // Validators.min(0),
        // Validators.max(100)
        //Validators.pattern(this.formPatterns.currency.regex)
      ])],
      discountPrice: [{ value: "", disabled: false }, Validators.compose([
        Validators.required,
        // Validators.min(0),
        //Validators.pattern(this.formPatterns.currency.regex)
      ])],
    });
    if (this.isSuperAdmin)
      this.formGroup.addControl('resellerId', new FormControl("", []));
  }

  loadPatterns() {
    this.formPatterns = {
      number: {
        regex: RegExExtensions.numeric,
        mask: "0*",
      },
      currency: {
        regex: RegExExtensions.currency,
        mask: "0*.00",
      }
    };
  }

  patterns(controlName: string): any {
    return this.formPatterns[controlName].pattern;
  }

  mask(controlName: string): any {
    return this.formPatterns[controlName].mask;
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
