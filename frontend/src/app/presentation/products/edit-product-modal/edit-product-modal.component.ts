import { Component, OnInit, Output, EventEmitter, Input, ViewEncapsulation } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { RegExExtensions } from 'src/app/_helpers/extensions/regex-extension';
import { ProductCategoryOfflineService } from 'src/app/application/categories/product-category-offline.service';
import { ProductOfflineService } from 'src/app/application/products/product-offline.service';
import { ProductCategory } from 'src/app/domain/entities/product-categories/product-category.model';
import { Product } from 'src/app/domain/entities/products/product.model';
import Swal from 'sweetalert2';
import { SharedModule } from '../../shared/shared.module';

@Component({
  selector: 'app-edit-product-modal',
  standalone: true,
  imports: [SharedModule, TranslateModule],
  templateUrl: './edit-product-modal.component.html',
  styleUrl: './edit-product-modal.component.scss'
})
export class EditProductModalComponent implements OnInit {

  @Input() category: ProductCategory;
  @Input() product: Product;

  @Output() productUpdatedEmitter: EventEmitter<void> = new EventEmitter<void>();

  categories$: BehaviorSubject<ProductCategory[]> = new BehaviorSubject<ProductCategory[]>([]);

  formGroup: FormGroup;
  formPatterns: any;

  constructor(private formBuilder: FormBuilder, private modal: NgbActiveModal, private translate: TranslateService, private productService: ProductOfflineService, private categoryService: ProductCategoryOfflineService) { 
    this.loadForm();
  }

  ngOnInit(): void {
    //this.loadCategories();
    if (this.product) {
      // Update mode.
      this.formGroup.patchValue(this.product);
    } else {
      this.productService.getMaxOrder(this.category.id).subscribe(response => {
        if (response && response.succeeded)
          this.formGroup.patchValue({order: response.data + 1});
      });
    }
  }

  // loadCategories() {
  //   this.categoryService.getProductCategories().subscribe(response => {
  //     if (response.succeeded) {
  //       this.categories$.next(response.data);
  //       if (this.product) {
  //         this.formGroup.patchValue({categoryId: this.product.categoryId});
  //       }
  //     }
  //   });
  // }

  closeModal() {
    this.modal.close();
  }

  onSubmit() {
    if (!this.formGroup.valid) {
      this.formGroup.markAllAsTouched();
      return;
    }

    if (!this.product) {
      // Insert
      this.productService.createProduct(this.category.id, this.formGroup.value.name, this.formGroup.value.price, 
        this.formGroup.value.businessId, this.formGroup.value.order, this.formGroup.value.isActive,
        this.formGroup.value.availableToSale, this.formGroup.value.discountFromInvantory).subscribe(response => {
          if (response.succeeded) {
            this.productUpdatedEmitter.emit();
            this.closeModal();
          } else {
            Swal.fire({
              icon: 'error',
              title: this.translate.instant('GENERAL.ERROR'),
              text: response.errors[0].description,
            });
          }
        });
    } else {
      // Update
      this.productService.updateProduct(this.product.id, this.category.id, this.formGroup.value.name, 
        this.formGroup.value.price, this.formGroup.value.businessId, this.formGroup.value.order, this.formGroup.value.isActive, 
        this.formGroup.value.availableToSale, this.formGroup.value.discountFromInvantory).subscribe(response => {
          if (response.succeeded) {
            this.productUpdatedEmitter.emit();
            this.closeModal();
          } else {
            Swal.fire({
              icon: 'error',
              title: this.translate.instant('GENERAL.ERROR'),
              text: response.errors[0].description
            });
          }
        });
    }
  }

  loadForm() {
    this.loadPatterns();
    this.formGroup = this.formBuilder.group({
      name: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
      price: [{ value: "", disabled: false }, Validators.compose([
        Validators.required,
        Validators.min(0),
        //Validators.pattern(this.formPatterns.currency.regex)
      ])],
      //categoryId: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
      order: [{ value: "", disabled: false }, Validators.compose([
        Validators.required,
        Validators.pattern(this.formPatterns.number.regex)])
      ],
      businessId: [{ value: "", disabled: false }, Validators.compose([])],
      isActive: [{ value: true, disabled: false }, Validators.compose([])],
      availableToSale: [{ value: true, disabled: false }, Validators.compose([])],
      discountFromInvantory: [{ value: true, disabled: false }, Validators.compose([])],
    });
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

  // helpers for View
  isControlInvalid(controlName: string, validator: string): boolean {
    const control = this.formGroup.controls[controlName];
    if (validator == "") {
      return control.hasError('required') && (control.dirty || control.touched);
    } else {
      return control.hasError(validator) && (control.dirty || control.touched);
    }
  }

}
