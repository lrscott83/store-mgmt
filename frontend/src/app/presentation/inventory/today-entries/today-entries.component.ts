import { Component, OnInit } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from 'src/app/_services/services.index';
import { InventoryOfflineService } from 'src/app/application/entries/inventory-offline.service';
import { InventoryEntryView } from 'src/app/domain/entities/entries/inventory-entry-view.model';
import { EditInventoryEntryModalComponent } from '../edit-inventory-entry-modal/edit-inventory-entry-modal.component';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Result } from 'src/app/domain/commons/result';
import Swal from 'sweetalert2';
import { EntryListComponent } from '../entry-list/entry-list.component';

@Component({
    selector: 'app-today-entries',
    imports: [SharedModule, TranslateModule, EditInventoryEntryModalComponent, EntryListComponent],
    templateUrl: './today-entries.component.html',
    styleUrl: './today-entries.component.scss'
})
export class TodayEntriesComponent implements OnInit {

  entries$: BehaviorSubject<InventoryEntryView[]> = new BehaviorSubject<InventoryEntryView[]>([]);

  constructor(private authService: AuthService, private modalService: NgbModal, private inventoryService: InventoryOfflineService, private translate: TranslateService) { }

  ngOnInit(): void {
    this.loadInventoryEntries();
  }

  loadInventoryEntries() {
    this.inventoryService.getInventoryEntriesInDayObservable(new Date()).subscribe(response => {
      if (response.succeeded) {
        this.entries$.next(response.data);
      } else {
        console.log("Error when getInventoryEntriesInDay");
      }
    }, error => {
      console.log("Error when getInventoryEntriesInDay: ", error);
    });
  }

  entryDeleted() {
    this.loadInventoryEntries();
  }

  openCreateEntryModal() {
    const modalRef = this.modalService.open(EditInventoryEntryModalComponent, { centered: true, size: "lg" });
    modalRef.componentInstance.inventoryEntryInsertedEmitter.subscribe((entry) => {
      this.entries$.next([entry, ...this.entries$.value]);
    });
  }

}
