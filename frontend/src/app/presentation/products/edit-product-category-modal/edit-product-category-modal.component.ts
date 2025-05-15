import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { RegExExtensions } from 'src/app/_helpers/extensions/regex-extension';
import { ProductCategoryOfflineService } from 'src/app/application/categories/product-category-offline.service';
import { ProductCategory } from 'src/app/domain/entities/product-categories/product-category.model';
import Swal from 'sweetalert2';
import { SharedModule } from '../../shared/shared.module';

@Component({
  selector: 'app-edit-product-category-modal',
  standalone: true,
  imports: [SharedModule, TranslateModule],
  templateUrl: './edit-product-category-modal.component.html',
  styleUrl: './edit-product-category-modal.component.scss'
})
export class EditProductCategoryModalComponent implements OnInit {

  @Input() category: ProductCategory;

  @Output() productCategoryUpdatedEmitter: EventEmitter<void> = new EventEmitter<void>();

  formGroup: FormGroup;
  formPatterns: any;

  constructor(private formBuilder: FormBuilder, private modal: NgbActiveModal, private translate: TranslateService,
    private categoryService: ProductCategoryOfflineService) { 
      this.loadForm();
    }

  ngOnInit(): void {
    if (this.category) {
      // Update mode.
      this.formGroup.patchValue(this.category);
    } else {
      this.categoryService.getMaxOrder().subscribe(response => {
        if (response && response.succeeded)
          this.formGroup.patchValue({order: response.data + 1});
      });
    }
  }

  closeModal() {
    this.modal.close();
  }

  onSubmit() {
    if (!this.formGroup.valid) {
      this.formGroup.markAllAsTouched();
      return;
    }

    if (!this.category) {
      // Insert
      this.categoryService.createProductCategory(this.formGroup.value.name, this.formGroup.value.order,
        this.formGroup.value.isActive).subscribe(response => {
          if (response.succeeded) {
            this.productCategoryUpdatedEmitter.emit();
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
      this.categoryService.updateProductCategory(this.category.id, this.formGroup.value.name, this.formGroup.value.order,
        this.formGroup.value.isActive).subscribe(response => {
          if (response.succeeded) {
            this.productCategoryUpdatedEmitter.emit();
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
      order: [{ value: "", disabled: false }, Validators.compose([
        Validators.required,
        Validators.pattern(this.formPatterns.number.regex)])],
      isActive: [{ value: true, disabled: false }, Validators.compose([])],
    });
  }

  loadPatterns() {
    this.formPatterns = {
      number: {
        regex: RegExExtensions.numeric,
        mask: "0",
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
