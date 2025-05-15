import { Component, Input } from '@angular/core';
import { CategoryCartItemsView } from 'src/app/application/orders/category-cart-items.view';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-category-stats',
  standalone: true,
  imports: [SharedModule, TranslateModule],
  templateUrl: './category-stats.component.html',
  styleUrl: './category-stats.component.scss'
})
export class CategoryStatsComponent {
  @Input() category: CategoryCartItemsView;
}
