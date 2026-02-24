import { Component, Inject, Input, OnInit, OnDestroy } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { ProductCategory } from 'src/app/domain/entities/product-categories/product-category.model';
import { Product } from 'src/app/domain/entities/products/product.model';
import { SharedModule } from '../../shared/shared.module';
import { SaleProductRowComponent } from '../sale-product-row/sale-product-row.component';
import { OrderType } from 'src/app/domain/entities/orders/order.model';
import { ProductService } from 'src/app/domain/interfaces/product.service';
import { PRODUCT_SERVICE } from 'src/app/_services/tokens';

@Component({
    selector: 'app-sale-category-products',
    imports: [SharedModule, TranslateModule, SaleProductRowComponent],
    templateUrl: './sale-category-products.component.html',
    styleUrl: './sale-category-products.component.scss'
})
export class SaleCategoryProductsComponent implements OnInit, OnDestroy {
  @Input() category: Observable<ProductCategory>;
  @Input() orderType: OrderType;

  editPrice: boolean;
  products$: BehaviorSubject<Product[]> = new BehaviorSubject<Product[]>([]);

  private unsubscribe: Subscription[] = [];

  constructor(@Inject(PRODUCT_SERVICE) private productService: ProductService) { 
    this.editPrice = this.orderType !== OrderType.Normal;
  }

  ngOnInit(): void {
    const categorySubscription = this.category.subscribe(cat => {
      if (!cat)
        return;
      const productsSubscription = this.productService.getProductsToSaleByCategoryId(cat.id).subscribe(response => {
        if (response.succeeded) {
          this.products$.next(response.data);
        }
      });
      this.unsubscribe.push(productsSubscription);
    });
    this.unsubscribe.push(categorySubscription);
  }

  ngOnDestroy(): void {
    this.unsubscribe.forEach((sb) => sb.unsubscribe());
  }
}
