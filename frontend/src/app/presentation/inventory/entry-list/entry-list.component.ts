import { Component, EventEmitter, Input, Output } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { InventoryEntryView } from 'src/app/domain/entities/entries/inventory-entry-view.model';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { EditInventoryEntryModalComponent } from '../edit-inventory-entry-modal/edit-inventory-entry-modal.component';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Result } from 'src/app/domain/commons/result';
import { InventoryOfflineService } from 'src/app/application/entries/inventory-offline.service';
import Swal from 'sweetalert2';

@Component({
    selector: 'app-entry-list',
    imports: [SharedModule, TranslateModule, EditInventoryEntryModalComponent],
    templateUrl: './entry-list.component.html',
    styleUrl: './entry-list.component.scss'
})
export class EntryListComponent {
  @Input() entries$: Observable<InventoryEntryView[]> = new BehaviorSubject<InventoryEntryView[]>([]).asObservable();
  @Input() readOnly: boolean = true;

  @Output() entryDeletedEmitter = new EventEmitter();

  constructor(private modalService: NgbModal, private inventoryService: InventoryOfflineService, private translate: TranslateService) {

  }

  openEditInventoryEntryModal(entry: InventoryEntryView) {
    const modalRef = this.modalService.open(EditInventoryEntryModalComponent, { centered: true, size: "lg" });
    modalRef.componentInstance.inventoryEntry = entry;
    modalRef.componentInstance.inventoryEntryUpdatedEmitter.subscribe((updatedEntry) => {
      // let entries: InventoryEntryView[] = this.entries$.value;
      // let entry: InventoryEntryView = entries.find(e => e.id === updatedEntry.id);
      // if (entry) {
      //   entry.productId = updatedEntry.productId;
      //   entry.productName = updatedEntry.productName;
      //   entry.costPrice = updatedEntry.costPrice;
      //   entry.quantity = updatedEntry.quantity;
      // }
      // this.entries$.next(entries);

      entry.productId = updatedEntry.productId;
      entry.productName = updatedEntry.productName;
      entry.costPrice = updatedEntry.costPrice;
      entry.quantity = updatedEntry.quantity;
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
      text: this.translate.instant('GENERAL.DELETE_CONFIRM_MESSAGE_A',
        { name: this.translate.instant('INVENTORY_ENTRY.TEXT') }),
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#3456ff",
      cancelButtonColor: "#dc3545",
      confirmButtonText: this.translate.instant('GENERAL.YES'),
      cancelButtonText: this.translate.instant('GENERAL.NO'),
    }).then((result) => {
      if (result.isConfirmed) {
        const result: Result = this.inventoryService.deleteInventoryEntry(productId, entryId);
        if (!result.succeeded) {
          Swal.fire({
            icon: 'error',
            title: this.translate.instant('GENERAL.ERROR'),
            text: result.errors[0].description,
          });
          return;
        }

        if (this.entryDeletedEmitter)
          this.entryDeletedEmitter.emit();
      }
    });
  }
}
