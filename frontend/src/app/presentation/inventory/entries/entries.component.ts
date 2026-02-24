import { Component, OnInit } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { BehaviorSubject, catchError, Observable, of } from 'rxjs';
import { AuthService } from 'src/app/_services/services.index';
import { InventoryOfflineService } from 'src/app/application/entries/inventory-offline.service';
import { InventoryEntryView } from 'src/app/domain/entities/entries/inventory-entry-view.model';
import { EditInventoryEntryModalComponent } from '../edit-inventory-entry-modal/edit-inventory-entry-modal.component';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Result } from 'src/app/domain/commons/result';
import Swal from 'sweetalert2';
import { PaymentType, PaymentTypeUtils } from 'src/app/domain/commons/payment-type';
import { TypeData } from 'src/app/domain/commons/type-data';
import { GlobalConfig } from 'src/app/_shared/configs/global.config';
import { InventoryEntry } from 'src/app/domain/entities/entries/inventory-entry.model';
import { EntryListComponent } from '../entry-list/entry-list.component';


export interface DateEntry {
  date: Date;
  entries: InventoryEntryView[];
  count: number;
  total: number;
}

@Component({
    selector: 'app-entries',
    imports: [SharedModule, TranslateModule, EntryListComponent],
    templateUrl: './entries.component.html',
    styleUrl: './entries.component.scss'
})
export class EntriesComponent implements OnInit {

  paymentType: PaymentType = null;
  paymentTypes: TypeData[] = PaymentTypeUtils.getPaymentTypes();

  dateEntries$: BehaviorSubject<DateEntry[]> = new BehaviorSubject<DateEntry[]>([]);
    onlyDateFormat: string = GlobalConfig.ONLY_DATE_FORMAT;
  
    constructor(private inventoryService: InventoryOfflineService, private translate: TranslateService) { }
  
    ngOnInit(): void {
      this.loadEntries();
    }
  
    getEntriesObservable(entries: InventoryEntryView[]): Observable<InventoryEntryView[]> {
      return of(entries);
    }

    getPaymentTypeIcon(paymentType: PaymentType) {
    return PaymentTypeUtils.getPaymentTypeIcon(paymentType);
  }
  
    getEntriesCount(): number {
      return this.dateEntries$.value.reduce((count, entry) => count += entry.count, 0);
    }
  
    getEntriesTotal(): number {
      return this.dateEntries$.value.reduce((total, entry) => total += entry.total, 0);
    }
  
    loadEntries() {
      this.loadEntriesFiltered(null, null, null);
    }
  
    loadEntriesFiltered(productId: string, startDate: Date, endDate: Date) {
      this.inventoryService.filterInventoryEntries(productId, startDate, endDate)
        .pipe(catchError((error) => {
          console.log("Error when filterEntries: ", error);
          throw error;
        }))
        .subscribe((response) => {
          if (response.succeeded) {
            const dateEntries: DateEntry[] = this.groupEntries(response.data);
            this.dateEntries$.next(dateEntries);
          } else {
            console.log("Error when filterEntries");
          }
        });
    }
  
    groupEntries(entries: InventoryEntryView[]): DateEntry[] {
      const groups: Map<string, InventoryEntryView[]> = new Map();
      entries.forEach(credit => {
        const groupId = credit.date.toISOString().split("T")[0];
        const collection = groups.get(groupId);
        if (collection)
          collection.push(credit);
        else
          groups.set(groupId, [credit]);
      });
  
      const dateEntry: DateEntry[] = [];
      Array.from(groups.values()).forEach(entries => {
        dateEntry.push({
          date: entries[0].date,
          entries: entries.sort((c1, c2) => c1.date.getTime() - c2.date.getTime()),
          count: entries.reduce((count, entry) => count += entry.quantity, 0),
          total: entries.reduce((total, entry) => total += entry.costPrice, 0),
        });
      });
  
      return dateEntry.sort((c1, c2) => c1.date.getTime() - c2.date.getTime());
    }

}
