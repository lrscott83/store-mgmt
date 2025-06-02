import { Component, Inject } from '@angular/core';
import { OrderType, OrderTypeData, OrderTypeUtils } from 'src/app/domain/entities/orders/order.model';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule } from '@ngx-translate/core';
import { EditInventoryEntryModalComponent } from '../edit-inventory-entry-modal/edit-inventory-entry-modal.component';
import { BehaviorSubject, Observable } from 'rxjs';
import { ProductCategory } from 'src/app/domain/entities/product-categories/product-category.model';
import { PRODUCT_CATEGORY_SERVICE } from 'src/app/_services/tokens';
import { ProductCategoryService } from 'src/app/application/categories/product-category.service';
import { SaleCategoryProductsComponent } from '../../sale/sale-category-products/sale-category-products.component';

@Component({
  selector: 'app-egress',
  standalone: true,
  imports: [SharedModule, TranslateModule, SaleCategoryProductsComponent],
  templateUrl: './egress.component.html',
  styleUrl: './egress.component.scss'
})
export class EgressComponent {
  orderType: OrderType = OrderType.Mayorista;

  orderTypes: OrderTypeData[] = OrderTypeUtils.getOrderTypes();

  categories$: BehaviorSubject<ProductCategory[]> = new BehaviorSubject<ProductCategory[]>([]);
  selectedCategory$: BehaviorSubject<ProductCategory> = new BehaviorSubject<ProductCategory>(undefined);

  //storeControl = new FormControl('', Validators.required);

  constructor(@Inject(PRODUCT_CATEGORY_SERVICE) private categoryService: ProductCategoryService) { 
  }

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
}
