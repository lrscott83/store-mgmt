import { Component } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { BehaviorSubject, Observable } from 'rxjs';
import { ProductCategoryOfflineService } from 'src/app/application/categories/product-category-offline.service';
import { ProductCategory } from 'src/app/domain/entities/product-categories/product-category.model';
import { SharedModule } from '../shared/shared.module';
import { TranslateModule } from '@ngx-translate/core';
import { SaleCategoryProductsComponent } from './sale-category-products/sale-category-products.component';
import { DataService } from 'src/app/_services/data/data.service';
import { Product } from 'src/app/domain/entities/products/product.model';

@Component({
  selector: 'app-sale',
  standalone: true,
  imports: [SharedModule, TranslateModule, SaleCategoryProductsComponent],
  templateUrl: './sale.component.html',
  styleUrl: './sale.component.scss'
})
export class SaleComponent {

  categories$: BehaviorSubject<ProductCategory[]> = new BehaviorSubject<ProductCategory[]>([]);
  selectedCategory$: BehaviorSubject<ProductCategory> = new BehaviorSubject<ProductCategory>(undefined);

  //storeControl = new FormControl('', Validators.required);

  constructor(private categoryService: ProductCategoryOfflineService, private dataService: DataService) { }

  async ngOnInit() {
    this.loadCategories();
  }

  loadCategories() {
    this.categoryService.getProductCategories().subscribe(response => {
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
