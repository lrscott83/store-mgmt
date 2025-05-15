import { Component, OnInit } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { ProductCategoryRepository } from 'src/app/application/categories/product-category.repository';
import { CategoryCartItemsView } from 'src/app/application/orders/category-cart-items.view';
import { OrderOfflineService } from 'src/app/application/orders/order-offline.service';
import { SharedModule } from '../../shared/shared.module';
import { CategoryStatsComponent } from '../category-stats/category-stats.component';

@Component({
  selector: 'app-today-stats',
  standalone: true,
  imports: [SharedModule, TranslateModule, CategoryStatsComponent],
  templateUrl: './today-stats.component.html',
  styleUrl: './today-stats.component.scss'
})
export class TodayStatsComponent implements OnInit {
  categories$: BehaviorSubject<CategoryCartItemsView[]> = new BehaviorSubject<CategoryCartItemsView[]>([]);

  constructor(private orderService: OrderOfflineService, private categoryStore: ProductCategoryRepository) { }

  ngOnInit(): void {
    this.loadCategoryCartItemsView();
  }

  loadCategoryCartItemsView() {
    this.orderService.getCategoryCartItemsViewObservable(new Date()).subscribe(response => {
      if (response.succeeded) {
        this.categories$.next(response.data);
      }
    });
    // const categories = this.orderService.getCategoryCartItemsView(new Date()).data;
    // this.categories$.next(categories);
  }

  getOrdersTotal() {
    let totalSum: number = 0;
    this.categories$.value.forEach(
      (category) => (totalSum += category.total)
    );
    return totalSum;
  }

  getOrdersItemsCount() {
    let itemsCount: number = 0;
    this. categories$.value.forEach(
      (category) => (itemsCount += category.itemsCount)
    );
    return itemsCount;
  }
}
