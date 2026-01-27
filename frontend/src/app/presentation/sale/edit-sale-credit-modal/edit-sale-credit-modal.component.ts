import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { GlobalConfig } from 'src/app/_shared/configs/global.config';
import { SharedModule } from '../../shared/shared.module';
import { BehaviorSubject, Observable } from 'rxjs';
import { SaleCredit } from 'src/app/domain/entities/sale-credits/sale-credit.model';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { SaleCreditOfflineService } from 'src/app/application/credits/sale-credit-offline.service';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DataResult } from 'src/app/domain/commons/result';
import Swal from 'sweetalert2';
import { RegExExtensions } from 'src/app/_helpers/extensions/regex-extension';

@Component({
    selector: 'app-edit-sale-credit-modal',
    imports: [SharedModule, TranslateModule],
    templateUrl: './edit-sale-credit-modal.component.html',
    styleUrl: './edit-sale-credit-modal.component.scss'
})
export class EditSaleCreditModalComponent implements OnInit {
  @Input() saleCredit: SaleCredit;

  @Output() saleCreditUpdatedEmitter: EventEmitter<SaleCredit> = new EventEmitter<SaleCredit>();

  formGroup: FormGroup;
  formPatterns: any;

  constructor(private saleCreditService: SaleCreditOfflineService, private formBuilder: FormBuilder, private modal: NgbActiveModal, private translate: TranslateService) {
    this.loadForm();
  }

  ngOnInit(): void {
    if (this.saleCredit) {
      // Update mode.
      this.formGroup.patchValue(this.saleCredit);
    }
  }

  closeModal() {
    this.modal.close();
  }

  onSubmit() {
    if (!this.formGroup.valid) {
      this.formGroup.markAllAsTouched();
      return;
    }
    // Update
    const dataEntry: DataResult<SaleCredit> = this.saleCreditService.updateSaleCredit(this.saleCredit.id, this.formGroup.value.client, this.formGroup.value.note);
    if (dataEntry && dataEntry.succeeded) {
      if (this.saleCreditUpdatedEmitter) {
        this.saleCreditUpdatedEmitter.emit(dataEntry.data);
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

  loadForm() {
    this.loadPatterns();
    this.formGroup = this.formBuilder.group({
      client: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
      note: [{ value: "", disabled: false }, Validators.compose([])],
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
