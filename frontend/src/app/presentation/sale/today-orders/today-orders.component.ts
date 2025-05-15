import { Component, OnInit } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { OrderOfflineService } from 'src/app/application/orders/order-offline.service';
import { Order } from 'src/app/domain/entities/orders/order.model';
import { OrderItemListComponent } from './order-item-list/order-item-list.component';
import { TranslationModule } from 'src/app/_modules/i18n/translation.module';
import { SharedModule } from '../../shared/shared.module';
import * as _moment from 'moment';

@Component({
  selector: 'app-today-orders',
  standalone: true,
  imports: [SharedModule, TranslationModule, OrderItemListComponent],
  templateUrl: './today-orders.component.html',
  styleUrl: './today-orders.component.scss'
})
export class TodayOrdersComponent implements OnInit {
  orders$: BehaviorSubject<Order[]> = new BehaviorSubject<Order[]>([]);

  constructor(private orderService: OrderOfflineService) { }

  ngOnInit(): void {
    this.loadTodayOrders();
  }

  getOrderTime(order: Order): string {
    const dateMoment = _moment(order.date);
    //return order.date.getHours() + ":" + order.date.getMinutes();
    return dateMoment.format('hh:mm A');
  }

  loadTodayOrders() {
    this.orders$.next(this.orderService.getOrdersInDay(new Date()).sort((o1, o2) => o2.date.getTime() - o1.date.getTime()));
  }

  getOrderBackgroundColor(order: Order) {
    return !order.isActive ? "deactive-order" : "";
  }

  getOrdersTotal() {
    let totalSum: number = 0;
    this.orders$.value.forEach(
      (order) => (totalSum += order.total)
    );
    return totalSum;
  }

  getOrdersItemsCount() {
    let itemsCount: number = 0;
    this.orders$.value.forEach(
      (order) => (itemsCount += order.itemsCount)
    );
    return itemsCount;
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

  sendOrderToShoppingCart(order: Order) {
    // TODO.
  }

  onDeleteOrder(orderId: string) {
    // TODO.
  }
}
