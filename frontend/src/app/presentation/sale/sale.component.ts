import { Component, Inject, OnInit } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ProductCategory } from 'src/app/domain/entities/product-categories/product-category.model';
import { SharedModule } from '../shared/shared.module';
import { TranslateModule } from '@ngx-translate/core';
import { SaleCategoryProductsComponent } from './sale-category-products/sale-category-products.component';
import { PRODUCT_CATEGORY_SERVICE } from 'src/app/_services/tokens';
import { ProductCategoryService } from 'src/app/application/categories/product-category.service';
import { OrderType } from 'src/app/domain/entities/orders/order.model';
import { PRODUCT_SERVICE } from 'src/app/_services/tokens';
import { ProductService } from 'src/app/domain/interfaces/product.service';
import { ShoppingCartService } from 'src/app/_services/order/shopping-cart.service';
import { Product } from 'src/app/domain/entities/products/product.model';
import { TranslateService } from '@ngx-translate/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'app-sale',
  imports: [SharedModule, TranslateModule, SaleCategoryProductsComponent],
  templateUrl: './sale.component.html',
  styleUrl: './sale.component.scss'
})
export class SaleComponent implements OnInit {
  categories$: BehaviorSubject<ProductCategory[]> = new BehaviorSubject<ProductCategory[]>([]);
  selectedCategory$: BehaviorSubject<ProductCategory> = new BehaviorSubject<ProductCategory>(undefined);

  orderType: OrderType = OrderType.Normal;

  constructor(
    @Inject(PRODUCT_CATEGORY_SERVICE) private categoryService: ProductCategoryService,
    @Inject(PRODUCT_SERVICE) private productService: ProductService,
    private shoppingCartService: ShoppingCartService,
    private translate: TranslateService,
    private modalService: NgbModal
  ) {}

  async ngOnInit() {
    this.loadCategories();
  }

  loadCategories() {
    this.categoryService.getAvailableProductCategories().subscribe((response) => {
      if (response.succeeded) {
        this.categories$.next(response.data);
        if (response.data.length > 0) {
          this.selectedCategory$.next(response.data[0]);
        }
      }
    });
  }

  selectCategory(category: ProductCategory) {
    this.selectedCategory$.next(category);
  }

  onCategorySelectionChange(event: any) {
    if (event.isUserInput && event.source.value) {
      this.selectedCategory$.next(event.source.value);
    }
  }

  onCategorySelected(category: ProductCategory) {
    this.selectedCategory$.next(category);
  }

  selectedCategory(): Observable<ProductCategory> {
    return this.selectedCategory$.asObservable();
  }

  // onBarcodeScanned(barcode: string): void {
  //   console.log('[SaleComponent] Barcode scanned:', barcode);
  //   this.productService.getProductByBarcode(barcode).subscribe({
  //     next: (response) => {
  //       console.log('[SaleComponent] Product search response:', response);
  //       if (response.succeeded && response.data) {
  //         this.addProductToCart(response.data);
  //       } else {
  //         console.log('[SaleComponent] Product not found for barcode:', barcode);
  //       }
  //     },
  //     error: (err) => {
  //       console.error('[SaleComponent] Error searching product:', err);
  //     }
  //   });
  // }

  private addProductToCart(product: Product): void {
    console.log('[SaleComponent] Adding product to cart:', product.name);
    this.shoppingCartService.addCartItem(this.orderType, product.id, 1, product.price).then((response) => {
      console.log('[SaleComponent] Add to cart response:', response);
      if (response.succeeded) {
        console.log('[SaleComponent] Product added:', product.name);
      } else {
        console.log('[SaleComponent] Error adding product:', response.errors);
      }
    });
  }

  onScannerClosed(): void {
    console.log('Scanner closed.');
  }

//   openBarcodeScanner(): void {
//     console.log('[SaleComponent] openBarcodeScanner called');
//     const modalRef = this.modalService.open(BarcodeScannerComponent, {
//       centered: true,
//       size: 'lg',
//       windowClass: 'barcode-scanner-modal'
//     });

//     modalRef.componentInstance.modalReference = modalRef;
//     modalRef.componentInstance.barcodeScanned.subscribe((barcode: string) => {
//       console.log('[SaleComponent] Barcode received from scanner:', barcode);
//       this.onBarcodeScanned(barcode);
//     });

//     const closeScanner = () => {
//       console.log('[SaleComponent] Closing scanner');
//       if (modalRef.componentInstance) {
//         modalRef.componentInstance.stopScanning();
//       }
//     };

//     modalRef.dismissed.subscribe(closeScanner);
//     modalRef.hidden.subscribe(closeScanner);
//   }
}
