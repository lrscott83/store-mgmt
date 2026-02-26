import { Component, Inject, OnInit } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ProductCategory } from 'src/app/domain/entities/product-categories/product-category.model';
import { SharedModule } from '../shared/shared.module';
import { TranslateModule } from '@ngx-translate/core';
import { SaleCategoryProductsComponent } from './sale-category-products/sale-category-products.component';
import { QuickSaleScannerComponent } from './quick-sale-scanner/quick-sale-scanner.component';
import { PRODUCT_CATEGORY_SERVICE } from 'src/app/_services/tokens';
import { ProductCategoryService } from 'src/app/application/categories/product-category.service';
import { OrderType } from 'src/app/domain/entities/orders/order.model';
import { PRODUCT_SERVICE } from 'src/app/_services/tokens';
import { ProductService } from 'src/app/domain/interfaces/product.service';
import { ShoppingCartService } from 'src/app/_services/order/shopping-cart.service';
import { Product } from 'src/app/domain/entities/products/product.model';
import Swal from 'sweetalert2';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-sale',
  imports: [SharedModule, TranslateModule, SaleCategoryProductsComponent, QuickSaleScannerComponent],
  templateUrl: './sale.component.html',
  styleUrl: './sale.component.scss'
})
export class SaleComponent implements OnInit {
  categories$: BehaviorSubject<ProductCategory[]> = new BehaviorSubject<ProductCategory[]>([]);
  selectedCategory$: BehaviorSubject<ProductCategory> = new BehaviorSubject<ProductCategory>(undefined);

  orderType: OrderType = OrderType.Normal;
  isScannerOpen = false;

  constructor(
    @Inject(PRODUCT_CATEGORY_SERVICE) private categoryService: ProductCategoryService,
    @Inject(PRODUCT_SERVICE) private productService: ProductService,
    private shoppingCartService: ShoppingCartService,
    private translate: TranslateService
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

  onBarcodeScanned(barcode: string): void {
    console.log('[SaleComponent] Barcode scanned:', barcode);
    this.productService.getProductByBarcode(barcode).subscribe((response) => {
      console.log('[SaleComponent] Product search response:', response);
      if (response.succeeded && response.data) {
        this.addProductToCart(response.data);
      } else {
        console.log('[SaleComponent] Product not found for barcode:', barcode);
        Swal.fire({
          icon: 'warning',
          title: this.translate.instant('GENERAL.WARNING'),
          text: 'Producto no encontrado con código: ' + barcode,
          timer: 3000,
          showConfirmButton: false,
          toast: true,
          position: 'top-end'
        });
      }
    });
  }

  private addProductToCart(product: Product): void {
    console.log('[SaleComponent] Adding product to cart:', product.name);
    this.shoppingCartService.addCartItem(this.orderType, product.id, 1, product.price).then((response) => {
      console.log('[SaleComponent] Add to cart response:', response);
      if (response.succeeded) {
        Swal.fire({
          icon: 'success',
          title: this.translate.instant('GENERAL.SUCCESS'),
          text: product.name + ' agregado al carrito',
          timer: 3000,
          showConfirmButton: false,
          toast: true,
          position: 'top-end'
        });
      } else {
        Swal.fire({
          icon: 'error',
          title: this.translate.instant('GENERAL.ERROR'),
          text: response.errors?.[0]?.description || 'Error al agregar producto'
        });
      }
    });
  }

  onScannerClosed(): void {
    this.isScannerOpen = false;
    console.log('Scanner closed.');
  }

  toggleScanner(): void {
    console.log('[SaleComponent] toggleScanner called, current isScannerOpen:', this.isScannerOpen);
    this.isScannerOpen = !this.isScannerOpen;
    console.log('[SaleComponent] isScannerOpen changed to:', this.isScannerOpen);
  }
}
