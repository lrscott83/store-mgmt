import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ShoppingCartService } from 'src/app/_services/order/shopping-cart.service';
import { OrderType, OrderTypeData, OrderTypeUtils } from 'src/app/domain/entities/orders/order.model';
import { SharedModule } from 'src/app/presentation/shared/shared.module';

@Component({
  selector: 'app-edit-order-details-modal',
  standalone: true,
  imports: [SharedModule, TranslateModule],
  templateUrl: './edit-order-details-modal.component.html',
  styleUrl: './edit-order-details-modal.component.scss'
})
export class EditOrderDetailsModalComponent implements OnInit {

  @Output() orderDetailsUpdatedEmitter: EventEmitter<void> = new EventEmitter<void>();

  formGroup: FormGroup;

  orderType: OrderType = this.shoppingCartService.getOrderType();
  orderTypes: OrderTypeData[] = OrderTypeUtils.getOrderTypes();

  constructor(private formBuilder: FormBuilder, private modal: NgbActiveModal, private translate: TranslateService, private shoppingCartService: ShoppingCartService) {
    this.loadForm();
  }

  ngOnInit(): void {
    this.formGroup.patchValue({
      orderType: this.shoppingCartService.getOrderType(),
      description: this.shoppingCartService.getOrderDescription(),
    })
  }

  closeModal() {
    this.modal.close();
  }

  onSubmit() {
    if (!this.formGroup.valid) {
      this.formGroup.markAllAsTouched();
      return;
    }

    this.shoppingCartService.updateOrderDetails(this.formGroup.value.orderType, this.formGroup.value.description);
    this.orderDetailsUpdatedEmitter?.emit();
    this.closeModal();
  }

  loadForm() {
    this.formGroup = this.formBuilder.group({
      orderType: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
      description: [{ value: "", disabled: false }, Validators.compose([])],
    });
  }

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
