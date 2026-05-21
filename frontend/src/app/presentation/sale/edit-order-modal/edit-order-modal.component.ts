import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SharedModule } from '../../shared/shared.module';
import { Order } from 'src/app/domain/entities/orders/order.model';
import { OrderOfflineService } from 'src/app/application/orders/order-offline.service';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { DataResult } from 'src/app/domain/commons/result';
import { PaymentType, PaymentTypeUtils } from 'src/app/domain/commons/payment-type';
import { TypeData } from 'src/app/domain/commons/type-data';

@Component({
  selector: 'app-edit-order-modal',
  imports: [SharedModule, TranslateModule],
  templateUrl: './edit-order-modal.component.html',
  styleUrl: './edit-order-modal.component.scss'
})
export class EditOrderModalComponent implements OnInit {
  @Input() order: Order;
  @Output() orderUpdatedEmitter: EventEmitter<Order> = new EventEmitter<Order>();

  paymentType: PaymentType = PaymentType.Efectivo;
  paymentTypes: TypeData[] = PaymentTypeUtils.getPaymentTypes();

  constructor(
    private orderService: OrderOfflineService,
    private modal: NgbActiveModal,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.paymentType = this.order?.paymentType || PaymentType.Efectivo;
  }

  closeModal() {
    this.modal.close();
  }

  onSubmit() {
    // Update
    if (!this.order?.id) return;
    const dataEntry: DataResult<Order> = this.orderService.updateTodayOrder(this.order.id, this.paymentType);
    if (dataEntry && dataEntry.succeeded) {
      if (this.orderUpdatedEmitter) {
        this.orderUpdatedEmitter.emit(dataEntry.data);
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
