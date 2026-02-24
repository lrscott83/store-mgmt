import { Component, Inject, OnInit } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ProductCategory } from 'src/app/domain/entities/product-categories/product-category.model';
import { SharedModule } from '../shared/shared.module';
import { TranslateModule } from '@ngx-translate/core';
import { SaleCategoryProductsComponent } from './sale-category-products/sale-category-products.component';
import { PRODUCT_CATEGORY_SERVICE } from 'src/app/_services/tokens';
import { ProductCategoryService } from 'src/app/application/categories/product-category.service';
import { OrderType } from 'src/app/domain/entities/orders/order.model';

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

  //storeControl = new FormControl('', Validators.required);

  constructor(@Inject(PRODUCT_CATEGORY_SERVICE) private categoryService: ProductCategoryService) { }

  async ngOnInit() {
    this.loadCategories();
  }

  loadCategories() {
    this.categoryService.getAvailableProductCategories().subscribe(response => {
      if (response.succeeded) {
        this.categories$.next(response.data);
        if (response.data.length > 0) {
          //this.storeControl.setValue(response.data[0]);
          this.selectedCategory$.next(response.data[0]);
        }
      }
    })
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

  // getTranslation(key: string, param: string = null): Observable<string> {
  //   return this.translate.get(key, { value: param });
  // }

}
