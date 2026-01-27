import { Component, Input, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { PaymentType, PaymentTypeUtils } from 'src/app/domain/commons/payment-type';
import { Order } from 'src/app/domain/entities/orders/order.model';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule } from '@ngx-translate/core';
import { OrderItemListComponent } from '../today-orders/order-item-list/order-item-list.component';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

@Component({
  selector: 'app-order-list',
  standalone: true,
  imports: [SharedModule, TranslateModule, OrderItemListComponent],
  templateUrl: './order-list.component.html',
  styleUrl: './order-list.component.scss'
})
export class OrderListComponent implements OnInit {
  @Input() orders$: Observable<Order[]>;
  @Input() readOnly: boolean = true;

  ordersTotal: number;
  ordersItemsCount: number;

  ngOnInit(): void {
    this.orders$.subscribe(orders => {
      this.ordersItemsCount = orders.reduce((count, order) => count += order.itemsCount, 0);
      this.ordersTotal = orders.reduce((total, order) => total += order.total, 0);
    })
  }

  getOrderTime(order: Order): string {
    //return order.date.getHours() + ":" + order.date.getMinutes();
    return format(order.date, 'HH:mm', { locale: es });
  }

  getPaymentTypeIcon(paymentType: PaymentType) {
    return PaymentTypeUtils.getPaymentTypeIcon(paymentType);
  }

  getOrderBackgroundColor(order: Order) {
    return order.isCredit ? "credit-order" : "";
  }

  getOrderTotal(order: Order): number {
    let totalSum: number = 0;
    order.orderItems.forEach(
      (item) => (totalSum += item.price * item.quantity)
    );
    return totalSum;
  }

  getOrderItemsCount(order: Order): number {
    let itemsCount: number = 0;
    order.orderItems.forEach(
      (item) => (itemsCount += item.quantity)
    );
    return itemsCount;
  }
}
