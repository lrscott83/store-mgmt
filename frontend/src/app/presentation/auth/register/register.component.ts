// angular import
import { Component, HostListener, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { catchError } from 'rxjs';
import { GuestFooterComponent } from '../../layouts/guest/guest-footer/guest-footer.component';
import { CanComponentDeactivate, CanDeactivateType } from 'src/app/_shared/guards/can-deactivate.guard';
import { AuthHTTPService } from 'src/app/_services/auth/auth-http';
import { DataService } from 'src/app/_services/data/data.service';
import { ProductCategory } from 'src/app/domain/entities/product-categories/product-category.model';
import { Product } from 'src/app/domain/entities/products/product.model';
import { ProductRepository } from 'src/app/application/products/product.repository';
import { ProductCategoryRepository } from 'src/app/application/categories/product-category.repository';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [RouterModule, SharedModule, TranslateModule, GuestFooterComponent],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
export default class RegisterComponent implements OnInit, CanComponentDeactivate {

  showPassword: boolean = false;
  formGroup: FormGroup;
  hasError: boolean;
  errorMessage: string;
  email: string = "info@mail.com";

  reSellerCode: string;

  constructor(private formBuilder: FormBuilder, private translateService: TranslateService, private router: Router, private authHTTPService: AuthHTTPService, private route: ActivatedRoute, private dataService: DataService, private productRepository: ProductRepository, private categoryRepository: ProductCategoryRepository) {

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
    this.reSellerCode = this.route.snapshot.params['code'];
    this.loadForm();
    if (this.reSellerCode)
      this.formGroup.patchValue({code: this.reSellerCode});
  }

  async onSubmit(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.formGroup.valid) {
        this.formGroup.markAllAsTouched();
        return resolve(false);
      }

      this.authHTTPService.registerOwner(this.formGroup.value.fullName, this.formGroup.value.login, this.formGroup.value.password, this.formGroup.value.cellPhone, this.formGroup.value.email, this.formGroup.value.storeName, this.formGroup.value.code)
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
        .subscribe(async response => {
          if (response && response.succeeded) {
            await this.loadInitData();
            this.router.navigateByUrl('/login');
            resolve(true);
          } else {
            this.hasError = true;
            this.errorMessage = response.errors[0].description;
            resolve(false);
          }
        });
    })
  }
  
  async loadInitData() {
    const categoriesMap: Map<string, ProductCategory> = await this.dataService.loadCategories();
    const productsMap: Map<string, Product> = await this.dataService.loadProducts();
    this.productRepository.setInitProducts(productsMap);
    this.categoryRepository.setInitCategories(categoriesMap);
  }

  loadForm() {
    this.formGroup = this.formBuilder.group({
      fullName: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
      login: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
      password: [{ value: "", disabled: false }, Validators.compose([Validators.required,
      Validators.pattern('(?=\\D*\\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}')])],
      confirmPassword: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
      cellPhone: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
      email: [{ value: "", disabled: false }, Validators.compose([])],
      storeName: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
      code: [{ value: "", disabled: false }, Validators.compose([])],
      accept: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
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

  // public method
  SignUpOptions = [
    {
      image: 'assets/images/authentication/google.svg',
      name: 'Google'
    },
    {
      image: 'assets/images/authentication/twitter.svg',
      name: 'Twitter'
    },
    {
      image: 'assets/images/authentication/facebook.svg',
      name: 'Facebook'
    }
  ];
}
