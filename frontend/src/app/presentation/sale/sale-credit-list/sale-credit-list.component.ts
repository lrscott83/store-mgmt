import { Component, Input } from '@angular/core';
import { SaleCreditPaymentModalComponent } from '../sale-credit-payment-modal/sale-credit-payment-modal.component';
import { EditSaleCreditModalComponent } from '../edit-sale-credit-modal/edit-sale-credit-modal.component';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SharedModule } from '../../shared/shared.module';
import { GlobalConfig } from 'src/app/_shared/configs/global.config';
import { BehaviorSubject, Observable } from 'rxjs';
import { SaleCredit } from 'src/app/domain/entities/sale-credits/sale-credit.model';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { PaymentType, PaymentTypeUtils } from 'src/app/domain/commons/payment-type';

@Component({
  selector: 'app-sale-credit-list',
  standalone: true,
  imports: [SharedModule, TranslateModule, EditSaleCreditModalComponent, SaleCreditPaymentModalComponent],
  templateUrl: './sale-credit-list.component.html',
  styleUrl: './sale-credit-list.component.scss'
})
export class SaleCreditListComponent {
  onlyDateFormat: string = GlobalConfig.ONLY_DATE_FORMAT;

  @Input() saleCredits$: Observable<SaleCredit[]> = new BehaviorSubject<SaleCredit[]>([]).asObservable();
  @Input() readOnly: boolean = true;

  constructor(private modalService: NgbModal, private translate: TranslateService) {

  }

  getSaleCreditClassName(saleCredit: SaleCredit) {
    return saleCredit.isPaid ? "text-success" : "text-danger";
  }

  getPaymentTypeText(type: PaymentType): string {
      return PaymentTypeUtils.getPaymentTypeText(type);
    }

  openEditSaleCreditModal(saleCredit: SaleCredit) {
    const modalRef = this.modalService.open(EditSaleCreditModalComponent, { centered: true, size: "lg" });
    modalRef.componentInstance.saleCredit = saleCredit;
    modalRef.componentInstance.saleCreditUpdatedEmitter.subscribe((updatedSaleCredit: SaleCredit) => {
      saleCredit.client = updatedSaleCredit.client;
      saleCredit.note = updatedSaleCredit.note;
    });
  }

  openToPaySaleCreditModal(saleCredit: SaleCredit) {
    const modalRef = this.modalService.open(SaleCreditPaymentModalComponent, { centered: true, size: "lg" });
    modalRef.componentInstance.saleCredit = saleCredit;
    modalRef.componentInstance.saleCreditUpdatedEmitter.subscribe((updatedSaleCredit: SaleCredit) => {
      saleCredit.paid = updatedSaleCredit.total;
      saleCredit.isPaid = true;
      saleCredit.paidDate = updatedSaleCredit.paidDate;
      saleCredit.paidType = updatedSaleCredit.paidType;
      saleCredit.note = updatedSaleCredit.note;
    });
  }
}
