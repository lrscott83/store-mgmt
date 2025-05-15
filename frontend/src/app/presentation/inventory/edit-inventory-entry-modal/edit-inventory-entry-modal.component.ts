import { Component, EventEmitter, Input, OnInit, Output, ViewEncapsulation } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { RegExExtensions } from 'src/app/_helpers/extensions/regex-extension';
import { InventoryOfflineService } from 'src/app/application/entries/inventory-offline.service';
import { ProductOfflineService } from 'src/app/application/products/product-offline.service';
import { ProductSelectView } from 'src/app/application/products/product-select.view';
import { DataResult } from 'src/app/domain/commons/result';
import { InventoryEntryView } from 'src/app/domain/entities/entries/inventory-entry-view.model';
import { InventoryEntry } from 'src/app/domain/entities/entries/inventory-entry.model';
import Swal from 'sweetalert2';
import { SharedModule } from '../../shared/shared.module';

@Component({
  selector: 'app-edit-inventory-entry-modal',
  standalone: true,
  imports: [SharedModule, TranslateModule],
  templateUrl: './edit-inventory-entry-modal.component.html',
  styleUrl: './edit-inventory-entry-modal.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class EditInventoryEntryModalComponent implements OnInit {

  @Input() inventoryEntry: InventoryEntry;

  @Output() inventoryEntryInsertedEmitter: EventEmitter<InventoryEntryView> = new EventEmitter<InventoryEntryView>();
  @Output() inventoryEntryUpdatedEmitter: EventEmitter<InventoryEntryView> = new EventEmitter<InventoryEntryView>();

  products$: BehaviorSubject<ProductSelectView[]> = new BehaviorSubject<ProductSelectView[]>([]);

  formGroup: FormGroup;
  formPatterns: any;

  constructor(private productService: ProductOfflineService, private formBuilder: FormBuilder, private modal: NgbActiveModal, private translate: TranslateService, private inventoryService: InventoryOfflineService) {
    this.loadForm();
  }

  ngOnInit(): void {
    this.loadProductsToSelect();
    if (this.inventoryEntry) {
      // Update mode.
      this.formGroup.patchValue(this.inventoryEntry);
    }
  }

  loadProductsToSelect() {
    this.productService.getProductsToSelect().subscribe(response => {
      if (response.succeeded) {
        this.products$.next(response.data);
        if (this.inventoryEntry) {
          this.formGroup.patchValue({ productId: this.inventoryEntry.productId });
        }
      }
    });
  }

  closeModal() {
    this.modal.close();
  }

  onSubmit() {
    if (!this.formGroup.valid) {
      this.formGroup.markAllAsTouched();
      return;
    }

    if (!this.inventoryEntry) {
      // Insert
      const dataEntry: DataResult<InventoryEntryView> = this.inventoryService.createInventoryEntry(this.formGroup.value.productId, this.formGroup.value.quantity, this.formGroup.value.costPrice);
      if (dataEntry && dataEntry.succeeded) {
        if (this.inventoryEntryInsertedEmitter) {
          this.inventoryEntryInsertedEmitter.emit(dataEntry.data);
        }
        this.closeModal();
      } else {
        Swal.fire({
          icon: 'error',
          title: this.translate.instant('GENERAL.ERROR'),
          text: this.translate.instant('INVENTORY_ENTRY.PRODUCT_NOT_FOUND'),
        });
      }
    } else {
      // Update
      const dataEntry: DataResult<InventoryEntryView> = this.inventoryService.updateInventoryEntry(this.inventoryEntry.productId, this.inventoryEntry.id, this.formGroup.value.productId, this.formGroup.value.quantity, this.formGroup.value.costPrice);
      if (dataEntry && dataEntry.succeeded) {
        if (this.inventoryEntryUpdatedEmitter) {
          this.inventoryEntryUpdatedEmitter.emit(dataEntry.data);
        }
        this.closeModal();
      } else {
        Swal.fire({
          icon: 'error',
          title: this.translate.instant('GENERAL.ERROR'),
          text: dataEntry.errors[0].description
        });
      }
    }
  }

  loadForm() {
    this.loadPatterns();
    this.formGroup = this.formBuilder.group({
      productId: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
      costPrice: [{ value: "", disabled: false }, Validators.compose([
        Validators.required,
        Validators.min(0),
        Validators.pattern(this.formPatterns.currency.regex)
      ])],
      quantity: [{ value: "", disabled: false }, Validators.compose([
        Validators.required,
        Validators.min(1),
        Validators.pattern(this.formPatterns.number.regex)
      ])
      ]
    });
  }

  loadPatterns() {
    this.formPatterns = {
      number: {
        regex: RegExExtensions.numeric,
        mask: "0*",
      },
      currency: {
        regex: RegExExtensions.currency,
        mask: "0*.00",
      }
    };
  }

  // patterns(controlName: string): any {
  //   return this.formPatterns[controlName].pattern;
  // }

  // mask(controlName: string): any {
  //   return this.formPatterns[controlName].mask;
  // }

  // helpers for View
  isControlInvalid(controlName: string, validator: string): boolean {
    const control = this.formGroup.controls[controlName];
    if (validator == "") {
      return control.hasError('required') && (control.dirty || control.touched);
    } else {
      return control.hasError(validator) && (control.dirty || control.touched);
    }
  }

}