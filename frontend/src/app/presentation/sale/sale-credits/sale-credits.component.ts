import { Component, OnInit } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { EditSaleCreditModalComponent } from '../edit-sale-credit-modal/edit-sale-credit-modal.component';
import { SaleCreditListComponent } from '../sale-credit-list/sale-credit-list.component';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { BehaviorSubject, catchError, Observable, of } from 'rxjs';
import { SaleCredit } from 'src/app/domain/entities/sale-credits/sale-credit.model';
import { SaleCreditOfflineService } from 'src/app/application/credits/sale-credit-offline.service';
import { group } from 'console';
import { GlobalConfig } from 'src/app/_shared/configs/global.config';

export interface DateSaleCredit {
  date: Date;
  saleCredits: SaleCredit[];
  creditsCount: number;
  creditsTotal: number;
}

@Component({
    selector: 'app-sale-credits',
    imports: [SharedModule, TranslateModule, EditSaleCreditModalComponent, SaleCreditListComponent],
    templateUrl: './sale-credits.component.html',
    styleUrl: './sale-credits.component.scss'
})
export class SaleCreditsComponent implements OnInit {
  dateSaleCredits$: BehaviorSubject<DateSaleCredit[]> = new BehaviorSubject<DateSaleCredit[]>([]);
  onlyDateFormat: string = GlobalConfig.ONLY_DATE_FORMAT;

  constructor(private modalService: NgbModal, private saleCreditService: SaleCreditOfflineService, private translate: TranslateService) { }

  ngOnInit(): void {
    this.loadSaleCredits();
  }

  getSaleCreditsObservable(saleCredits: SaleCredit[]): Observable<SaleCredit[]> {
    return of(saleCredits);
  }

  getSaleCreditsCount(): number {
    return this.dateSaleCredits$.value.reduce((count, saleCredit) => count += saleCredit.creditsCount, 0);
  }

  getSaleCreditsTotal(): number {
    return this.dateSaleCredits$.value.reduce((total, saleCredit) => total += saleCredit.creditsTotal, 0);
  }

  loadSaleCredits() {
    this.loadSaleCreditsFiltered(null, null, null, null);
  }

  loadSaleCreditsFiltered(isPaid: boolean, client: string, startDate: Date, endDate: Date) {
    this.saleCreditService.filterSaleCredits(isPaid, client, startDate, endDate)
      .pipe(catchError((error) => {
        console.log("Error when filterSaleCredits: ", error);
        throw error;
      }))
      .subscribe((response) => {
        if (response.succeeded) {
          const dateSaleCredits: DateSaleCredit[] = this.groupSaleCredits(response.data);
          this.dateSaleCredits$.next(dateSaleCredits);
        } else {
          console.log("Error when filterSaleCredits");
        }
      });
  }

  groupSaleCredits(saleCredits: SaleCredit[]): DateSaleCredit[] {
    const groups: Map<string, SaleCredit[]> = new Map();
    saleCredits.forEach(credit => {
      const groupId = credit.date.toISOString().split("T")[0];
      const collection = groups.get(groupId);
      if (collection)
        collection.push(credit);
      else
        groups.set(groupId, [credit]);
    });

    const dateSaleCredit: DateSaleCredit[] = [];
    Array.from(groups.values()).forEach(credits => {
      dateSaleCredit.push({
        date: credits[0].date,
        saleCredits: credits.sort((c1, c2) => c1.date.getTime() - c2.date.getTime()),
        creditsCount: credits.reduce((count, saleCredit) => count + (!saleCredit.isPaid ? 1 : 0), 0),
        creditsTotal: credits.reduce((total, saleCredit) => total + (!saleCredit.isPaid ? saleCredit.total : 0), 0),
      });
    });

    return dateSaleCredit.sort((c1, c2) => c1.date.getTime() - c2.date.getTime());
  }
}
