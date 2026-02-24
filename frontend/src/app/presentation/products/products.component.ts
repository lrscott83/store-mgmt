import { Component, Inject, OnInit } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, catchError } from 'rxjs';
import { ProductCategoryView } from 'src/app/application/categories/product-category.view';
import { SharedModule } from '../shared/shared.module';
import { ProductCategory } from 'src/app/domain/entities/product-categories/product-category.model';
import Swal from 'sweetalert2';
import { EditProductCategoryModalComponent } from './edit-product-category-modal/edit-product-category-modal.component';
import { CategoryProductListComponent } from './category-product-list/category-product-list.component';
import { CsvProductImporterModalComponent } from './csv-product-importer-modal/csv-product-importer-modal.component';
import { ProductCategoryService } from 'src/app/application/categories/product-category.service';
import { PRODUCT_CATEGORY_SERVICE } from 'src/app/_services/tokens';

@Component({
    selector: 'app-products',
    imports: [SharedModule, TranslateModule, EditProductCategoryModalComponent, CategoryProductListComponent, CsvProductImporterModalComponent],
    templateUrl: './products.component.html',
    styleUrl: './products.component.scss'
})
export class ProductsComponent implements OnInit {
  categories$: BehaviorSubject<ProductCategoryView[]> = new BehaviorSubject<ProductCategoryView[]>([]);

  constructor(@Inject(PRODUCT_CATEGORY_SERVICE) private categoryService: ProductCategoryService, private modalService: NgbModal, private translate: TranslateService) { }

  ngOnInit(): void {
    this.loadCategories();
  }

  loadCategories() {
    this.categoryService.getProductCategoriesView().subscribe(response => {
      if (response.succeeded) {
        this.categories$.next(response.data);
      } else {
        console.log("Error when getProductCategoriesView");
      }
    }, error => {
      console.log("Error when getProductCategoriesView: ", error);
    });
  }

  openCreateCategoryModal() {
    const modalRef = this.modalService.open(EditProductCategoryModalComponent, { centered: true, size: "lg" });
    modalRef.componentInstance.productCategoryUpdatedEmitter.subscribe(() => {
      // this.categoryService.getProductCategoriesView().subscribe(response => {
      //   if (response.succeeded)
      //     this.categories$.next(response.data);
      // });
      this.loadCategories();
    });
  }

  updateCategory() {
    this.loadCategories();
  }

  openAddProductModal() {
    // TODO.
  }

  openEditCategoryModal(category: ProductCategory) {
    const modalRef = this.modalService.open(EditProductCategoryModalComponent, { centered: true, size: "lg" });
    modalRef.componentInstance.category = category;
    modalRef.componentInstance.productCategoryUpdatedEmitter.subscribe(() => {
      this.loadCategories();
    });
  }

  openImportCsvProductModal() {
    const modalRef = this.modalService.open(CsvProductImporterModalComponent, { centered: true, size: "lg" });
    modalRef.componentInstance.categoriesUpdatedEmitter.subscribe(() => {
      this.loadCategories();
    });
  }

  onDeleteCategory(categoryId: string) {
    Swal.fire({
      title: this.translate.instant('GENERAL.DELETE_CONFIRM_TITLE'),
      text: this.translate.instant('GENERAL.DELETE_CONFIRM_MESSAGE',
        { name: this.translate.instant('PRODUCT_CATEGORY.TEXT') }),
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#3456ff",
      cancelButtonColor: "#dc3545",
      confirmButtonText: this.translate.instant('GENERAL.YES'),
      cancelButtonText: this.translate.instant('GENERAL.No'),
    }).then((result) => {
      if (result.isConfirmed) {
        this.categoryService.delete(categoryId)
          .pipe(catchError((error) => {
            // return of({
            //   data: null,
            //   succeeded: false,
            //   message: "",
            //   actionCode: 400,
            //   errors: [this.translateService.instant('REGISTRATION.UNEXPECTED_ERROR')],
            // });
            console.error("Error deleting category.", error);
            throw error;
          }))
          .subscribe(response => {
            if (response) {
              console.log("Category deleted with id: " + categoryId);
              this.loadCategories();
            }
            else
              console.log("Error deleting category with id: " + categoryId);
          });
      }
    });
  }
}
