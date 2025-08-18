import { Component, OnInit } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { OrderListComponent } from '../order-list/order-list.component';
import { Order } from 'src/app/domain/entities/orders/order.model';
import { BehaviorSubject, catchError, Observable, of } from 'rxjs';
import { GlobalConfig } from 'src/app/_shared/configs/global.config';
import { OrderOfflineService } from 'src/app/application/orders/order-offline.service';
import { PaymentType, PaymentTypeUtils } from 'src/app/domain/commons/payment-type';
import { TypeData } from 'src/app/domain/commons/type-data';

export interface DateOrder {
  date: Date;
  orders: Order[];
  count: number;
  total: number;
}

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [SharedModule, TranslateModule, OrderListComponent],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.scss'
})
export class OrdersComponent implements OnInit {
  dateOrders$: BehaviorSubject<DateOrder[]> = new BehaviorSubject<DateOrder[]>([]);
  onlyDateFormat: string = GlobalConfig.ONLY_DATE_FORMAT;

  paymentType: PaymentType = null;
  paymentTypes: TypeData[] = PaymentTypeUtils.getPaymentTypes();

  isCredit: number = -1;

  constructor(private orderService: OrderOfflineService, private translate: TranslateService) { }

  ngOnInit(): void {
    this.loadOrders();
  }

  getOrdersObservable(orders: Order[]): Observable<Order[]> {
    return of(orders);
  }

  getPaymentTypeIcon(paymentType: PaymentType) {
    return PaymentTypeUtils.getPaymentTypeIcon(paymentType);
  }

  getOrdersCount(): number {
    return this.dateOrders$.value.reduce((count, order) => count += order.count, 0);
  }

  getOrdersTotal(): number {
    return this.dateOrders$.value.reduce((total, order) => total += order.total, 0);
  }

  loadOrders() {
    this.loadOrdersFiltered(this.isCredit, this.paymentType, null, null);
  }

  loadOrdersFiltered(isCredit: number, paymentType: PaymentType, startDate: Date, endDate: Date) {
    this.orderService.filterOrdersObservable(isCredit, paymentType, startDate, endDate)
      .pipe(catchError((error) => {
        console.log("Error when filterOrders: ", error);
        throw error;
      }))
      .subscribe((response) => {
        if (response.succeeded) {
          const dateOrders: DateOrder[] = this.groupOrders(response.data);
          this.dateOrders$.next(dateOrders);
        } else {
          console.log("Error when filterOrders");
        }
      });
  }

  groupOrders(orders: Order[]): DateOrder[] {
    let groups: Map<string, Order[]> = new Map();
    orders.forEach(credit => {
      const groupId = credit.date.toISOString().split("T")[0];
      const collection = groups.get(groupId);
      if (collection)
        collection.push(credit);
      else
        groups.set(groupId, [credit]);
    });

    const dateOrder: DateOrder[] = [];
    Array.from(groups.values()).forEach(credits => {
      dateOrder.push({
        date: credits[0].date,
        orders: credits.sort((c1, c2) => c2.date.getTime() - c1.date.getTime()),
        count: credits.reduce((count, order) => count += 1, 0),
        total: credits.reduce((total, order) => total += order.total, 0),
      });
    });

    return dateOrder.sort((c1, c2) => c2.date.getTime() - c1.date.getTime());
  }
}
