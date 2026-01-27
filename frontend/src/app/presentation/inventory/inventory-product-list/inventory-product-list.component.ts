import { Component, Input } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { InventoryProductView } from 'src/app/application/entries/inventory-product-view';
import { SharedModule } from '../../shared/shared.module';

@Component({
    selector: 'app-inventory-product-list',
    imports: [SharedModule, TranslateModule],
    templateUrl: './inventory-product-list.component.html',
    styleUrl: './inventory-product-list.component.scss'
})
export class InventoryProductListComponent {
  @Input() products: InventoryProductView[];
}
