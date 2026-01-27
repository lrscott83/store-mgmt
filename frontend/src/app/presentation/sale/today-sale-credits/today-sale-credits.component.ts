import { Component } from '@angular/core';
import { SaleCreditListComponent } from '../sale-credit-list/sale-credit-list.component';
import { EditSaleCreditModalComponent } from '../edit-sale-credit-modal/edit-sale-credit-modal.component';
import { TranslateModule } from '@ngx-translate/core';
import { SharedModule } from '../../shared/shared.module';
import { BehaviorSubject } from 'rxjs';
import { SaleCredit } from 'src/app/domain/entities/sale-credits/sale-credit.model';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { SaleCreditOfflineService } from 'src/app/application/credits/sale-credit-offline.service';

@Component({
    selector: 'app-today-sale-credits',
    imports: [SharedModule, TranslateModule, EditSaleCreditModalComponent, SaleCreditListComponent],
    templateUrl: './today-sale-credits.component.html',
    styleUrl: './today-sale-credits.component.scss'
})
export class TodaySaleCreditsComponent {
  saleCredits$: BehaviorSubject<SaleCredit[]> = new BehaviorSubject<SaleCredit[]>([]);

  constructor(private modalService: NgbModal, private saleCreditService: SaleCreditOfflineService) { }

  ngOnInit(): void {
    this.loadSaleCredits();
  }

  loadSaleCredits() {
    this.saleCreditService.getSaleCreditsInDayObservable(new Date()).subscribe(response => {
      if (response.succeeded) {
        this.saleCredits$.next(response.data);
      } else {
        console.log("Error when getSaleCreditsInDay");
      }
    }, error => {
      console.log("Error when getSaleCreditsInDay: ", error);
    });
  }
}
