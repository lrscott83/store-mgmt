import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { StoreListComponent } from './store-list/store-list.component';
import { SharedModule } from '../shared/shared.module';
import { Router, RouterModule } from '@angular/router';

@Component({
    selector: 'app-stores',
    imports: [SharedModule, TranslateModule, MatIconModule, StoreListComponent, RouterModule],
    templateUrl: './stores.component.html',
    styleUrl: './stores.component.scss'
})
export class StoresComponent {

  constructor(private router: Router) {

  }

  navigateToCreateStore() {
    this.router.navigateByUrl('/management/stores/create');
  }

}
