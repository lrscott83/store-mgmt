import { Component, OnInit } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { BehaviorSubject } from 'rxjs';
import { InventoryCategoryView } from 'src/app/application/entries/inventory-category.view';
import { InventoryOfflineService } from 'src/app/application/entries/inventory-offline.service';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule } from '@ngx-translate/core';
import { InventoryProductListComponent } from '../inventory-product-list/inventory-product-list.component';

@Component({
    selector: 'app-inventory-available',
    imports: [SharedModule, TranslateModule, InventoryProductListComponent],
    templateUrl: './inventory-available.component.html',
    styleUrl: './inventory-available.component.scss'
})
export class InventoryAvailableComponent implements OnInit {

  categories$: BehaviorSubject<InventoryCategoryView[]> = new BehaviorSubject<InventoryCategoryView[]>([]);

  constructor(private inventoryService: InventoryOfflineService, private modalService: NgbModal) { }

  ngOnInit(): void {
    this.loadInventoryCategories();
  }

  loadInventoryCategories() {
    this.inventoryService.getInventoryCategoriesViewObservable().subscribe(response => {
      if (response && response.succeeded) {
        this.categories$.next(response.data);
      } else {
        console.log("Error when getInventoryCategoriesView");
      }
    }, error => {
      console.log("Error when getInventoryCategoriesView: ", error);
    });
  }

  getInventoryCostTotal(): number {
    return this.categories$.value.reduce((acc, cat) => acc + cat.totalCostPrice, 0);
  }

}
