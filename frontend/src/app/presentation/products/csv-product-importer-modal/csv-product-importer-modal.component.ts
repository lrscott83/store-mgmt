import { Component, EventEmitter, Inject, OnInit, Output } from '@angular/core';
import { CsvProductService } from 'src/app/_services/csv/csv-product.service';
import { CsvProduct } from 'src/app/_services/csv/models/csv-product.model';
import { SharedModule } from '../../shared/shared.module';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import Swal from 'sweetalert2';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ProductService } from 'src/app/domain/interfaces/product.service';
import { PRODUCT_SERVICE } from 'src/app/_services/tokens';

@Component({
    selector: 'app-csv-product-importer-modal',
    imports: [SharedModule, TranslateModule],
    templateUrl: './csv-product-importer-modal.component.html',
    styleUrl: './csv-product-importer-modal.component.scss'
})
export class CsvProductImporterModalComponent implements OnInit {
  @Output() categoriesUpdatedEmitter: EventEmitter<void> = new EventEmitter<void>();

  formGroup: FormGroup;

  fileToUpload: File;
  dataPath: string = null;

  sampleData: string = `category,name,price
Pizzas,Pizza de Queso,150
Pizzas,Pizza Especial,200
Confituras,Caramelo,20`;

  constructor(private csvProductService: CsvProductService, private translate: TranslateService, private formBuilder: FormBuilder, private toastrService: ToastrService, @Inject(PRODUCT_SERVICE) private productService: ProductService, private modal: NgbActiveModal) { }

  ngOnInit(): void {
    this.loadForm();
  }

  importProducts() {
    if (!this.formGroup.valid) {
      this.formGroup.markAllAsTouched();
      return;
    }

    if (this.fileToUpload) {
      this.csvProductService.parseCsv(this.fileToUpload).subscribe({
        next: (products) => this.handleSuccess(products),
        error: (err) => this.handleError(err)
      });
    }
  }

  private handleSuccess(products: CsvProduct[]): void {
    this.productService.createCsvProducts(products).subscribe(response => {
      this.closeModal();
      this.categoriesUpdatedEmitter.emit();
      if (!response.succeeded) {
        Swal.fire({
          icon: 'info',
          title: this.translate.instant('GENERAL.INFORMATION'),
          text: 'Algunos productos no fueron importados porque ya existen.',
        });
      }
    });
    this.toastrService.success(`Importados ${products.length} productos correctamente.`);
  }

  closeModal() {
    this.modal.close();
  }

  private handleError(error: any): void {
    const message: string = error.message || 'Error al importar los productos';
    Swal.fire({
      icon: "error",
      title: this.translate.instant('GENERAL.RESPONSE.ERROR_TITLE'),
      text: message,
    });
  }

  downloadSample(): void {
    const blob = new Blob([this.sampleData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'productos_ejemplo.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  }

  selectFile = (files) => {
    if (files.length === 0) {
      return;
    }
    this.fileToUpload = <File>files[0];
    this.formGroup.patchValue({ dataPath: this.fileToUpload.name });
  }

  loadForm() {
    this.formGroup = this.formBuilder.group({
      dataPath: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
    });
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
