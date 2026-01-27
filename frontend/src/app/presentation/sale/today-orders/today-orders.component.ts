import { Component, OnInit } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { OrderOfflineService } from 'src/app/application/orders/order-offline.service';
import { Order } from 'src/app/domain/entities/orders/order.model';
import { OrderItemListComponent } from './order-item-list/order-item-list.component';
import { TranslationModule } from 'src/app/_modules/i18n/translation.module';
import { SharedModule } from '../../shared/shared.module';
import { PaymentType, PaymentTypeUtils } from 'src/app/domain/commons/payment-type';
import { TypeData } from 'src/app/domain/commons/type-data';
import { OrderListComponent } from '../order-list/order-list.component';

@Component({
    selector: 'app-today-orders',
    imports: [SharedModule, TranslationModule, OrderListComponent],
    templateUrl: './today-orders.component.html',
    styleUrl: './today-orders.component.scss'
})
export class TodayOrdersComponent implements OnInit {
  orders$: BehaviorSubject<Order[]> = new BehaviorSubject<Order[]>([]);

  paymentType: PaymentType = null;
  paymentTypes: TypeData[] = PaymentTypeUtils.getPaymentTypes();

  isCredit: number = -1;

  constructor(private orderService: OrderOfflineService) { }

  ngOnInit(): void {
    this.loadTodayOrders();
  }

  loadTodayOrders() {
    this.orders$.next(this.orderService.getActiveOrdersInDay(new Date())
      .filter(order => (!this.paymentType || this.paymentType === order.paymentType)
        && (this.isCredit === -1 || this.isCredit === 1 && order.isCredit || this.isCredit === 0 && !order.isCredit))
      .sort((o1, o2) => o2.date.getTime() - o1.date.getTime()));
  }

  getPaymentTypeIcon(paymentType: PaymentType) {
    return PaymentTypeUtils.getPaymentTypeIcon(paymentType);
  }

  getOrdersItemsCount(): number {
    return this.orders$.value.reduce((count, order) => count += order.itemsCount, 0);
  }

  getOrdersTotal(): number {
    return this.orders$.value.reduce((total, order) => total += order.total, 0);
  }

  getOrdersObservable(): Observable<Order[]> {
    return this.orders$.asObservable();
  }

  sendOrderToShoppingCart(order: Order) {
    // TODO.
  }

  onDeleteOrder(orderId: string) {
    // TODO.
  }
}
