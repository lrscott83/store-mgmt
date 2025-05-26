import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { EditProductModalComponent } from '../edit-product-modal/edit-product-modal.component';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ProductCategory } from 'src/app/domain/entities/product-categories/product-category.model';
import { Product } from 'src/app/domain/entities/products/product.model';
import { ProductOfflineService } from 'src/app/application/products/product-offline.service';
import { SharedModule } from '../../shared/shared.module';
import { EditProductCategoryModalComponent } from '../edit-product-category-modal/edit-product-category-modal.component';
import { EditProductsModalComponent } from '../edit-products-modal/edit-products-modal.component';

@Component({
  selector: 'app-category-product-list',
  standalone: true,
  imports: [SharedModule, TranslateModule, EditProductCategoryModalComponent, EditProductsModalComponent],
  templateUrl: './category-product-list.component.html',
  styleUrl: './category-product-list.component.scss'
})
export class CategoryProductListComponent implements OnInit {

  @Input() category: ProductCategory;
  @Output() categoryUpdated = new EventEmitter();
  products$: BehaviorSubject<Product[]> = new BehaviorSubject<Product[]>([]);

  constructor(private productService: ProductOfflineService, private modalService: NgbModal, private translate: TranslateService) { }

  ngOnInit(): void {
    this.loadProductsByCategoryId(this.category.id);
  }

  loadProductsByCategoryId(categoryId: string) {
    this.productService.getAvailableProductsByCategoryId(categoryId).subscribe(response => {
      if (response.succeeded) {
        this.products$.next(response.data);
      } else {
        console.log("Error loadProductsByCategoryId");
      }
    }, error => {
      console.log("Error loadProductsByCategoryId: ", error);
    })
  }

  openEditCategoryModal() {
    const modalRef = this.modalService.open(EditProductCategoryModalComponent, { centered: true, size: "lg" });
    modalRef.componentInstance.category = this.category;
    modalRef.componentInstance.productCategoryUpdatedEmitter.subscribe(() => {
      this.categoryUpdated.emit();
    });
  }
  
  openAddProductModal() {
    const modalRef = this.modalService.open(EditProductModalComponent, { centered: true, size: "lg" });
    modalRef.componentInstance.category = this.category;
    modalRef.componentInstance.productUpdatedEmitter.subscribe(() => {
      this.loadProductsByCategoryId(this.category.id);
    });
  }

  openAddProductsModal() {
    const modalRef = this.modalService.open(EditProductsModalComponent, { centered: true, size: "lg" });
    modalRef.componentInstance.category = this.category;
    modalRef.componentInstance.productUpdatedEmitter.subscribe(() => {
      this.loadProductsByCategoryId(this.category.id);
    });
  }

  openEditProductModal(product: Product) {
    const modalRef = this.modalService.open(EditProductModalComponent, { centered: true, size: "lg" });
    modalRef.componentInstance.category = this.category;
    modalRef.componentInstance.product = product;
    modalRef.componentInstance.productUpdatedEmitter.subscribe(() => {
      this.loadProductsByCategoryId(this.category.id);
    });
  }

  onDeleteProduct(productId: string) {
    Swal.fire({
      title: this.translate.instant('GENERAL.DELETE_CONFIRM_TITLE'),
      text: this.translate.instant('GENERAL.DELETE_CONFIRM_MESSAGE',
        { name: this.translate.instant('PRODUCT.TEXT') }),
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#3456ff",
      cancelButtonColor: "#dc3545",
      confirmButtonText: this.translate.instant('GENERAL.YES'),
      cancelButtonText: this.translate.instant('GENERAL.NO'),
    }).then((result) => {
      if (result.isConfirmed) {
        this.productService.deleteProduct(productId);
        this.loadProductsByCategoryId(this.category.id);
      }
    });
  }

  deactivateProduct(product: Product) {
    
  }

  activateProduct(product: Product) {
    
  }

}