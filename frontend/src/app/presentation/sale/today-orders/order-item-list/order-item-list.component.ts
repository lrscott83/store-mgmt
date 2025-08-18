import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { TranslationModule } from 'src/app/_modules/i18n/translation.module';
import { ShoppingCartService } from 'src/app/_services/order/shopping-cart.service';
import { OrderOfflineService } from 'src/app/application/orders/order-offline.service';
import { Result } from 'src/app/domain/commons/result';
import { OrderItem } from 'src/app/domain/entities/orders/order-item.model';
import { Order, OrderType } from 'src/app/domain/entities/orders/order.model';
import { SharedModule } from 'src/app/presentation/shared/shared.module';
import Swal from 'sweetalert2';
import { EditOrderModalComponent } from '../../edit-order-modal/edit-order-modal.component';

@Component({
  selector: 'app-order-item-list',
  standalone: true,
  imports: [SharedModule, TranslationModule],
  templateUrl: './order-item-list.component.html',
  styleUrl: './order-item-list.component.scss'
})
export class OrderItemListComponent implements OnInit {

  @Input() order: Order;
  @Input() readOnly: boolean = true;
  
  @Output() orderDeletedEmitter = new EventEmitter();
  @Output() orderItemUpdatedEmitter = new EventEmitter();
  @Output() orderItemDeletedEmitter = new EventEmitter();

  constructor(private shoppingCartService: ShoppingCartService, private translate: TranslateService, private orderService: OrderOfflineService, private modalService: NgbModal) { }

  ngOnInit(): void {
  }

  deactivateOrder(order: Order) {
    Swal.fire({
      title: this.translate.instant('GENERAL.DELETE_CONFIRM_TITLE'),
      text: this.translate.instant('GENERAL.DELETE_CONFIRM_MESSAGE_A',
        { name: this.translate.instant('TODAY_ORDERS.TEXT') }),
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#3456ff",
      cancelButtonColor: "#dc3545",
      confirmButtonText: this.translate.instant('GENERAL.YES'),
      cancelButtonText: this.translate.instant('GENERAL.NO'),
    }).then((result) => {
      if (result.isConfirmed) {
        const result: Result = this.orderService.deactivateOrder(order.id);
        if (result.succeeded)
          this.orderDeletedEmitter.emit();
        else
          this.showErrorMessage(["La venta no pudo ser cancelada. Inténtelo más tarde y si persiste el problema contacte al soporte técnico."]);
      }
    });
  }

  openEditOrderModal(order: Order) {
    const modalRef = this.modalService.open(EditOrderModalComponent, { centered: true, size: "lg" });
    modalRef.componentInstance.order = order;
    modalRef.componentInstance.orderUpdatedEmitter.subscribe((updatedOrder: Order) => {
      order.paymentType = updatedOrder.paymentType;
    });
  }

  activateOrder(order: Order) {
    this.orderService.activateOrder(order.id);
  }

  sendOrderToShoppingCart() {
    if (this.shoppingCartService.getCartItems().length > 0) {
      Swal.fire({
        title: this.translate.instant('TODAY_ORDERS.DISAPPROVE_CONFIRM_TITLE'),
        text: this.translate.instant('TODAY_ORDERS.SEND_TO_CART_CONFIRM_MESSAGE'),
        icon: "question",
        showCancelButton: true,
        confirmButtonColor: "#3456ff",
        cancelButtonColor: "#dc3545",
        confirmButtonText: this.translate.instant('GENERAL.YES'),
        cancelButtonText: this.translate.instant('GENERAL.NO'),
      }).then((result) => {
        if (result.isConfirmed) {
          this.shoppingCartService.clearCart();
          this.addOrderItemsToShoppingCart();
        }
      });
      return;
    }
    this.addOrderItemsToShoppingCart();
  }

  addOrderItemsToShoppingCart() {
    this.order.orderItems.forEach(item => {
      this.shoppingCartService.addCartItem(OrderType.Normal, item.productId, item.quantity, item.price);
    });
  }

  onDeteleOrder() {
    Swal.fire({
      title: this.translate.instant('GENERAL.DELETE_CONFIRM_TITLE'),
      text: this.translate.instant('GENERAL.DELETE_CONFIRM_MESSAGE',
        { name: this.translate.instant('TODAY_ORDER.TEXT') }),
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#3456ff",
      cancelButtonColor: "#dc3545",
      confirmButtonText: this.translate.instant('GENERAL.YES'),
      cancelButtonText: this.translate.instant('GENERAL.NO'),
    }).then((result) => {
      if (result.isConfirmed) {
        this.orderService.delete(this.order.id).subscribe(response => {
          if (response.succeeded) {
            this.orderDeletedEmitter.emit();
          }
          else {
            console.log("Error deleting order with id: " + this.order.id);
            this.showErrorMessage(response.errors);
          }
        }, error => {
          console.error("Error creating order: ", error);
        });
      }
    });
  }

  showErrorMessage(errors: string[]) {
    Swal.fire({
      title: this.translate.instant('GENERAL.ERROR'),
      text: this.translate.instant('TODAY_ORDERS.ERROR_DELETING_ORDER',
        { message: errors.join("<br>") }),
      icon: "error",
      showCancelButton: false,
      confirmButtonColor: "#3456ff",
      cancelButtonColor: "#dc3545",
      confirmButtonText: this.translate.instant('GENERAL.OK'),
    })
  }

  openEditOrderItemModal(orderItem: OrderItem) {

  }

  onDeteleOrderItem(orderItemId: string) {

  }

}
