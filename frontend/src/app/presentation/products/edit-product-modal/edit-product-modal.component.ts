import { Component, OnInit, Output, EventEmitter, Input, ViewEncapsulation, Inject } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { RegExExtensions } from 'src/app/_helpers/extensions/regex-extension';
import { ProductCategory } from 'src/app/domain/entities/product-categories/product-category.model';
import { Product } from 'src/app/domain/entities/products/product.model';
import Swal from 'sweetalert2';
import { SharedModule } from '../../shared/shared.module';
import { PRODUCT_SERVICE } from 'src/app/_services/tokens';
import { ProductService } from 'src/app/domain/interfaces/product.service';
import { BarcodeScannerComponent } from '../../shared/components/barcode-scanner/barcode-scanner.component';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'app-edit-product-modal',
  imports: [SharedModule, TranslateModule, BarcodeScannerComponent],
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

  constructor(
    private formBuilder: FormBuilder,
    private modal: NgbActiveModal,
    private translate: TranslateService,
    @Inject(PRODUCT_SERVICE) private productService: ProductService,
    private ngbModal: NgbModal
  ) {
    this.loadForm();
  }

  ngOnInit(): void {
    if (this.product) {
      this.formGroup.patchValue(this.product);
    } else {
      this.productService.getMaxOrder(this.category.id).subscribe((response) => {
        if (response && response.succeeded) this.formGroup.patchValue({ order: response.data + 1 });
      });
    }
  }

  closeModal() {
    this.modal.close();
  }

  openBarcodeScanner() {
    const modalRef = this.ngbModal.open(BarcodeScannerComponent, {
      centered: true,
      size: 'lg',
      windowClass: 'barcode-scanner-modal'
    });

    modalRef.componentInstance.modalReference = modalRef;
    modalRef.componentInstance.barcodeScanned.subscribe((barcode: string) => {
      this.formGroup.patchValue({ barcode: barcode });
      modalRef.close();
    });
  }

  onSubmit() {
    if (!this.formGroup.valid) {
      this.formGroup.markAllAsTouched();
      return;
    }

    const barcodeValue = this.formGroup.value.barcode?.trim();

    if (!this.product) {
      this.productService
        .createProduct(
          this.category.id,
          this.formGroup.value.name,
          this.formGroup.value.price,
          this.formGroup.value.businessId,
          this.formGroup.value.order,
          this.formGroup.value.isActive,
          this.formGroup.value.availableToSale,
          this.formGroup.value.discountFromInvantory,
          barcodeValue || undefined
        )
        .subscribe((response) => {
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
    } else {
      this.productService
        .updateProduct(
          this.product.id,
          this.category.id,
          this.formGroup.value.name,
          this.formGroup.value.price,
          this.formGroup.value.businessId,
          this.formGroup.value.order,
          this.formGroup.value.isActive,
          this.formGroup.value.availableToSale,
          this.formGroup.value.discountFromInvantory,
          barcodeValue || undefined
        )
        .subscribe((response) => {
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
      name: [{ value: '', disabled: false }, Validators.compose([Validators.required])],
      barcode: [{ value: '', disabled: false }, Validators.compose([])],
      price: [{ value: '', disabled: false }, Validators.compose([Validators.required, Validators.min(0)])],
      order: [
        { value: '', disabled: false },
        Validators.compose([Validators.required, Validators.pattern(this.formPatterns.number.regex)])
      ],
      businessId: [{ value: '', disabled: false }, Validators.compose([])],
      isActive: [{ value: true, disabled: false }, Validators.compose([])],
      availableToSale: [{ value: true, disabled: false }, Validators.compose([])],
      discountFromInvantory: [{ value: true, disabled: false }, Validators.compose([])]
    });
  }

  loadPatterns() {
    this.formPatterns = {
      number: {
        regex: RegExExtensions.numeric,
        mask: '0*'
      },
      currency: {
        regex: RegExExtensions.currency,
        mask: '0*.00'
      }
    };
  }

  patterns(controlName: string): any {
    return this.formPatterns[controlName].pattern;
  }

  mask(controlName: string): any {
    return this.formPatterns[controlName].mask;
  }

  isControlInvalid(controlName: string, validator: string): boolean {
    const control = this.formGroup.controls[controlName];
    if (validator == '') {
      return control.hasError('required') && (control.dirty || control.touched);
    } else {
      return control.hasError(validator) && (control.dirty || control.touched);
    }
  }
}
