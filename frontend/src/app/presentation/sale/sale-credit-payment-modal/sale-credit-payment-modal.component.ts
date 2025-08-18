import { Component, EventEmitter, Input, OnInit, Output, ViewEncapsulation } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SharedModule } from '../../shared/shared.module';
import { PaymentType, PaymentTypeUtils } from 'src/app/domain/commons/payment-type';
import { TypeData } from 'src/app/domain/commons/type-data';
import { SaleCredit } from 'src/app/domain/entities/sale-credits/sale-credit.model';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SaleCreditOfflineService } from 'src/app/application/credits/sale-credit-offline.service';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { DataResult } from 'src/app/domain/commons/result';
import Swal from 'sweetalert2';
import { RegExExtensions } from 'src/app/_helpers/extensions/regex-extension';

@Component({
  selector: 'app-sale-credit-payment-modal',
  standalone: true,
  imports: [SharedModule, TranslateModule],
  templateUrl: './sale-credit-payment-modal.component.html',
  styleUrl: './sale-credit-payment-modal.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class SaleCreditPaymentModalComponent implements OnInit {
  paymentType: PaymentType = PaymentType.Efectivo;
  paymentTypes: TypeData[] = PaymentTypeUtils.getPaymentTypes();

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
    Swal.fire({
      title: this.translate.instant('SALE_CREDIT.PAYMENT_CONFIRM_TITLE'),
      text: this.translate.instant('SALE_CREDIT.PAYMENT_CONFIRM_MESSAGE'),
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#3456ff",
      cancelButtonColor: "#dc3545",
      confirmButtonText: this.translate.instant('GENERAL.YES'),
      cancelButtonText: this.translate.instant('GENERAL.NO'),
    }).then((result) => {
      if (result.isConfirmed) {
        // Update
        const dataEntry: DataResult<SaleCredit> = this.saleCreditService.paidSaleCredit(this.saleCredit.id, this.paymentType, this.formGroup.value.note);
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
    });

  }

  loadForm() {
    this.loadPatterns();
    this.formGroup = this.formBuilder.group({
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
