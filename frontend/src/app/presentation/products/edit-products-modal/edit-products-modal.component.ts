import { Component, EventEmitter, Inject, Input, OnInit, Output, ViewEncapsulation } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SharedModule } from '../../shared/shared.module';
import { ProductCategory } from 'src/app/domain/entities/product-categories/product-category.model';
import { BehaviorSubject } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { ProductService } from 'src/app/domain/interfaces/product.service';
import { PRODUCT_SERVICE } from 'src/app/_services/tokens';

@Component({
    selector: 'app-edit-products-modal',
    imports: [SharedModule, TranslateModule],
    templateUrl: './edit-products-modal.component.html',
    styleUrl: './edit-products-modal.component.scss'
})
export class EditProductsModalComponent {

  @Input() category: ProductCategory;

  @Output() productUpdatedEmitter: EventEmitter<void> = new EventEmitter<void>();

  categories$: BehaviorSubject<ProductCategory[]> = new BehaviorSubject<ProductCategory[]>([]);

  form: FormGroup;

  constructor(private fb: FormBuilder, private modal: NgbActiveModal, @Inject(PRODUCT_SERVICE) private productService: ProductService, private translate: TranslateService) {
    // Empieza con una fila vacía
    //this.addRow();
    this.form = this.fb.group({
      products: this.fb.array([])
    });

    // Inicializa con 4 filas vacías
    for (let i = 0; i < 4; i++) {
      this.addProduct();
    }
  }

  get products(): FormArray {
    return this.form.get('products') as FormArray;
  }

  addProduct(): void {
    const productForm = this.fb.group({
      name: ['', [Validators.required]],
      price: ['', [Validators.required, this.validatePriceFormat, this.validatePriceGreaterThanZero]]
    });
    this.products.push(productForm);
  }

  validatePriceFormat(control: AbstractControl) {
    const value = control.value;
    return /^\d+(\.\d{1,2})?$/.test(value) ? null : { invalidFormat: true };
  }

  validatePriceGreaterThanZero(control: AbstractControl) {
    const value = parseFloat(control.value);
    return value > 0 ? null : { priceTooLow: true };
  }

  hasDuplicateNames(): boolean {
    const names = this.products.controls
      .map(c => c.get('name')?.value.trim().toLowerCase())
      .filter(name => !!name);

    const all = [...names];
    const unique = new Set(all);

    return unique.size !== all.length;
  }

  onSubmit(): void {
    const productControls = this.products.controls
      .filter(control => control.get('name')?.value?.trim() !== '' || control.get('price')?.value);
    productControls.forEach(control => control.markAllAsTouched());

    if (productControls.length > 0 
      && productControls.some(control => (control.dirty || control.touched) && control.invalid)
      || this.hasDuplicateNames()) {
      // Swal.fire({
      //   icon: 'error',
      //   title: this.translate.instant('GENERAL.ERROR'),
      //   text: 'Errores de validación: Verifique nombres duplicados y precios válidos.',
      // });
      return;
    }

    const newProducts = this.products.value
      .filter((p: any) => p.name && p.price)
      .map((p: any) => ({
        name: p.name.trim(),
        price: parseFloat(p.price)
      }));

    this.productService.createProducts(this.category.id, newProducts).subscribe(response => {
      this.closeModal();
      this.productUpdatedEmitter.emit();
      if (!response.succeeded) {
        Swal.fire({
          icon: 'error',
          title: this.translate.instant('GENERAL.ERROR'),
          text: 'Algunos productos no fueron adicionados porque ya existen.',
        });
      }
    });
  }

  // columnDefinitions: Column[] = [];
  // gridOptions: GridOption = {};
  // dataset: any[] = [];

  // angularGrid!: AngularGridInstance;
  // grid!: SlickGrid;
  // gridService!: GridService;
  // dataView!: SlickDataView;
  // hideSubTitle = false;
  // updatedObject: any;

  // ngOnInit(): void {
  //   this.prepareGrid();
  // }

  // prepareGrid(): void {
  //   this.columnDefinitions = [
  //     {
  //       id: 'name',
  //       name: 'Nombre',
  //       field: 'name',
  //       editor: {
  //         model: Editors['text']
  //       },
  //       validator: (value) => {
  //         if (!value) return { valid: false, msg: 'El nombre es requerido' };
  //         //this.productService.getProductsByCategoryId(this.category.id);
  //         const isDuplicate = [...this.dataset].some(p =>
  //           p !== value && p.name?.toLowerCase() === value.toLowerCase()
  //         );

  //         if (isDuplicate) return { valid: false, msg: 'Nombre duplicado' };

  //         return { valid: true };
  //       }
  //     },
  //     {
  //       id: 'price',
  //       name: 'Precio',
  //       field: 'price',
  //       type: FieldType.float,
  //       editor: {
  //         model: Editors['text']
  //       },
  //       validator: (value) => {
  //         const isValid = /^\d+(\.\d{1,2})?$/.test(value) && parseFloat(value) > 0;
  //         return isValid ? { valid: true } : { valid: false, msg: 'Precio inválido' };
  //       }
  //     }
  //   ];

  //   this.gridOptions = {
  //     editable: true,
  //     enableCellNavigation: true,
  //     autoEdit: true,
  //     enableAutoResize: true,
  //     enableAddRow: true,
  //     autoCommitEdit: true,

  //     gridWidth: "100%",
  //     autoFitColumnsOnFirstLoad: false,
  //     enableAutoSizeColumns: false,
  //     // then enable resize by content with these 2 flags
  //     autosizeColumnsByCellContentOnFirstLoad: true,
  //     enableAutoResizeColumnsByCellContent: true,
  //     enablePagination: false,
  //     enableEmptyDataWarningMessage: true,
  //     emptyDataWarning: {
  //       message: 'Toque el botón + Nuevo para crear un producto'
  //     }
  //   };
  // }

  // angularGridReady(event: any) {
  //   const angularGrid: AngularGridInstance = event['detail'];
  //   this.angularGrid = angularGrid;
  //   this.dataView = angularGrid.dataView;
  //   this.grid = angularGrid.slickGrid as SlickGrid;
  //   this.gridService = angularGrid.gridService;

  //   // if you want to change background color of Duration over 50 right after page load,
  //   // you would put the code here, also make sure to re-render the grid for the styling to be applied right away
  //   /*
  //   this.dataView.getItemMetadata = this.updateItemMetadataForDurationOver50(this.dataView.getItemMetadata);
  //   this.grid.invalidate();
  //   this.grid.render();
  //   */
  // }

  // addRow(): void {
  //   const products = this.dataset.filter(item => item.name !== '' && item.price !== '');
  //   if (!this.hasErrors(products))
  //     this.angularGrid.gridService.addItem({ id: Guid.create(), name: '', price: '' }, { position: 'bottom' });
  // }

  // hasErrors(products: any) {
  //   return this.dataset.some(item => item.name === '' || item.price === '')
  //     || products.some(item => {
  //       return (
  //         !item.name ||
  //         !/^\d+(\.\d{1,2})?$/.test(item.price) ||
  //         parseFloat(item.price) <= 0
  //       );
  //     });
  // }

  // onSubmit(): void {
  //   const products = this.dataset.filter(item => item.name !== '' && item.price !== '');
  //   const hasErrors = this.hasErrors(products);
  //   if (hasErrors) {
  //     Swal.fire({
  //       icon: 'error',
  //       title: this.translate.instant('GENERAL.ERROR'),
  //       text: 'Errores de validación en los productos.',
  //     });
  //     return;
  //   }

  //   this.productService.createProducts(this.category.id, products).subscribe(response => {
  //     this.closeModal();
  //     if (!response.succeeded) {
  //       Swal.fire({
  //         icon: 'error',
  //         title: this.translate.instant('GENERAL.ERROR'),
  //         text: 'Algunos productos no fueron adicionados porque ya existen.',
  //       });
  //     }
  //   });
  // }

  closeModal() {
    this.modal.close();
  }
}
