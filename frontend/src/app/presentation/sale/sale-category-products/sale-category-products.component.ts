import { Component, Input } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { ProductOfflineService } from 'src/app/application/products/product-offline.service';
import { ProductCategory } from 'src/app/domain/entities/product-categories/product-category.model';
import { Product } from 'src/app/domain/entities/products/product.model';
import { SharedModule } from '../../shared/shared.module';
import { SaleProductRowComponent } from '../sale-product-row/sale-product-row.component';
import { OrderType } from 'src/app/domain/entities/orders/order.model';

@Component({
  selector: 'app-sale-category-products',
  standalone: true,
  imports: [SharedModule, TranslateModule, SaleProductRowComponent],
  templateUrl: './sale-category-products.component.html',
  styleUrl: './sale-category-products.component.scss'
})
export class SaleCategoryProductsComponent {
  @Input() category: Observable<ProductCategory>;
  @Input() orderType: OrderType;

  editPrice: boolean;
  products$: BehaviorSubject<Product[]> = new BehaviorSubject<Product[]>([]);

  private unsubscribe: Subscription[] = [];

  constructor(private productService: ProductOfflineService) { 
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
