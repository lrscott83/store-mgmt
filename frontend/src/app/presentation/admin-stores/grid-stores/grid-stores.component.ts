import { Component, Input } from '@angular/core';
// import { AngularGridInstance, Column, GridOption } from 'angular-slickgrid';
import { Subscription } from 'rxjs';
import { Store } from 'src/app/domain/entities/stores/store.model';

@Component({
    selector: 'app-grid-stores',
    imports: [],
    templateUrl: './grid-stores.component.html',
    styleUrl: './grid-stores.component.scss'
})
export class GridStoresComponent {

  @Input() stores: Store[];

  private _darkModeGrid = false;
  // private subscriptions: Subscription[] = [];
  // angularGrid!: AngularGridInstance;
  // columnDefinitions: Column[] = [];
  // gridOptions!: GridOption;

}
