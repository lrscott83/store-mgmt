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

@Component({
  selector: 'app-entries',
  standalone: true,
  imports: [SharedModule, TranslateModule, EditInventoryEntryModalComponent],
  templateUrl: './entries.component.html',
  styleUrl: './entries.component.scss'
})
export class EntriesComponent implements OnInit {

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

  openCreateEntryModal() {
    const modalRef = this.modalService.open(EditInventoryEntryModalComponent, { centered: true, size: "lg" });
    modalRef.componentInstance.inventoryEntryInsertedEmitter.subscribe((entry) => {
      this.entries$.next([entry, ...this.entries$.value]);
    });
  }

  openEditInventoryEntryModal(entry: InventoryEntryView) {
    const modalRef = this.modalService.open(EditInventoryEntryModalComponent, { centered: true, size: "lg" });
    modalRef.componentInstance.inventoryEntry = entry;
    modalRef.componentInstance.inventoryEntryUpdatedEmitter.subscribe((updatedEntry) => {
      let entries: InventoryEntryView[] = this.entries$.value;
      let entry: InventoryEntryView = entries.find(e => e.id === updatedEntry.id);
      if (entry) {
        entry.productId = updatedEntry.productId;
        entry.productName = updatedEntry.productName;
        entry.costPrice = updatedEntry.costPrice;
        entry.quantity = updatedEntry.quantity;
      }
      this.entries$.next(entries);
    });
  }

  onDeleteInventoryEntry(productId: string, entryId: string) {
    const soldEntryResult: Result = this.inventoryService.isNotSoldEntry(productId, entryId);
    if (!soldEntryResult.succeeded) {
      Swal.fire({
        icon: 'error',
        title: this.translate.instant('GENERAL.ERROR'),
        text: soldEntryResult.errors[0].description,
      });
      return;
    }

    Swal.fire({
      title: this.translate.instant('GENERAL.DELETE_CONFIRM_TITLE'),
      text: this.translate.instant('GENERAL.DELETE_CONFIRM_MESSAGE',
        { name: this.translate.instant('INVENTORY_ENTRY.TEXT') }),
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#3456ff",
      cancelButtonColor: "#dc3545",
      confirmButtonText: this.translate.instant('GENERAL.YES'),
      cancelButtonText: this.translate.instant('GENERAL.NO'),
    }).then((result) => {
      if (result.isConfirmed) {
        this.inventoryService.deleteInventoryEntry(productId, entryId);
        this.loadInventoryEntries();
      }
    });
  }

}
