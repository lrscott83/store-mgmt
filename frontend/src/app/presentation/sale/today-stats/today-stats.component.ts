import { Component, OnInit } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { ProductCategoryRepository } from 'src/app/application/categories/product-category.repository';
import { CategoryCartItemsView } from 'src/app/application/orders/category-cart-items.view';
import { OrderOfflineService } from 'src/app/application/orders/order-offline.service';
import { SharedModule } from '../../shared/shared.module';
import { CategoryStatsComponent } from '../category-stats/category-stats.component';
import { Expense } from 'src/app/domain/entities/expenses/expense.model';
import { AuthService } from 'src/app/_services/services.index';
import { UserModel } from 'src/app/_services/auth/_models/auth-user.model';
import { AuthorizationService } from 'src/app/_services/authorization/authorization.service';
import { ExpenseOfflineService } from 'src/app/application/expenses/expense-offline.service';
import { ExpenseListComponent } from '../../expenses/expense-list/expense-list.component';
import { SaleCreditListComponent } from '../sale-credit-list/sale-credit-list.component';
import { SaleCredit } from 'src/app/domain/entities/sale-credits/sale-credit.model';
import { SaleCreditOfflineService } from 'src/app/application/credits/sale-credit-offline.service';
import { PaymentType } from 'src/app/domain/commons/payment-type';

@Component({
  selector: 'app-today-stats',
  standalone: true,
  imports: [SharedModule, TranslateModule, CategoryStatsComponent, ExpenseListComponent, SaleCreditListComponent],
  templateUrl: './today-stats.component.html',
  styleUrl: './today-stats.component.scss'
})
export class TodayStatsComponent implements OnInit {
  categories$: BehaviorSubject<CategoryCartItemsView[]> = new BehaviorSubject<CategoryCartItemsView[]>([]);
  expenses$: BehaviorSubject<Expense[]> = new BehaviorSubject<Expense[]>([]);
  saleCredits$: BehaviorSubject<SaleCredit[]> = new BehaviorSubject<SaleCredit[]>([]);
  paidSaleCredits$: BehaviorSubject<SaleCredit[]> = new BehaviorSubject<SaleCredit[]>([]);

  currentUser: UserModel;
  hasExpensesModuleAvailable: boolean;
  hasCreditsModuleAvailable: boolean;

  salesCashTotal: number = 0;
  paidCreditsCashTotal: number = 0;
  expensesCashTotal: number = 0;

  constructor(private orderService: OrderOfflineService,
    private expenseService: ExpenseOfflineService,
    private authService: AuthService,
    private authorizationService: AuthorizationService,
    private saleCreditService: SaleCreditOfflineService) {
    this.currentUser = this.authService.currentUserValue;
    this.hasExpensesModuleAvailable = this.authorizationService.hasExpensesModuleAvailable();
    this.hasCreditsModuleAvailable = this.authorizationService.hasCreditsModuleAvailable();
  }

  ngOnInit(): void {
    this.loadCategoryCartItemsView();
    this.setNotCreditSales();
    this.loadExpenses();
    this.loadSaleCredits();
    this.loadPaidSaleCredits();
  }

  loadCategoryCartItemsView() {
    this.orderService.getCategoryCartItemsViewObservable(new Date()).subscribe(response => {
      if (response.succeeded) {
        this.categories$.next(response.data);
      }
    });
    // const categories = this.orderService.getCategoryCartItemsView(new Date()).data;
    // this.categories$.next(categories);
  }

  setNotCreditSales() {
    this.orderService.getActiveTodayOrdersObservable().subscribe(response => {
      if (response && response.succeeded)
        this.salesCashTotal = response.data
            .filter(order => order.paymentType === PaymentType.Efectivo && !order.isCredit)
            .reduce((acc, order) => acc + order.total, 0);
    });
  }

  loadExpenses() {
    if (this.hasExpensesModuleAvailable) {
      this.expenseService.getExpensesInDayObservable(new Date()).subscribe(response => {
        if (response.succeeded) {
          this.expenses$.next(response.data);
          this.expensesCashTotal = this.expenses$.value
            .filter(expense => expense.paymentType === PaymentType.Efectivo)
            .reduce((acc, expense) => acc + expense.total, 0);
        }
      });
    }
  }

  loadSaleCredits() {
    if (this.hasCreditsModuleAvailable) {
      this.saleCreditService.getUnPaidSaleCreditsInDayObservable(new Date()).subscribe(response => {
        if (response.succeeded) {
          this.saleCredits$.next(response.data);
        }
      });
    }
  }

  loadPaidSaleCredits() {
    if (this.hasCreditsModuleAvailable) {
      this.saleCreditService.getPaidSaleCreditsInDayObservable(new Date()).subscribe(response => {
        if (response.succeeded) {
          this.paidSaleCredits$.next(response.data);
          this.paidCreditsCashTotal = this.paidSaleCredits$.value
            .filter(credit => PaymentType.Efectivo === credit.paidType)
            .reduce((acc, credit) => acc + credit.total, 0);
        }
      });
    }
  }

  getOrdersTotal(): number {
    let totalSum: number = 0;
    this.categories$.value.forEach(
      (category) => (totalSum += category.total)
    );
    return totalSum;
  }

  getOrdersItemsCount(): number {
    let itemsCount: number = 0;
    this.categories$.value.forEach(
      (category) => (itemsCount += category.itemsCount)
    );
    return itemsCount;
  }

  getExpensesTotal(): number {
    let totalSum: number = 0;
    this.expenses$.value.forEach(
      (expense) => (totalSum += expense.total)
    );
    return totalSum;
  }

  getExpensesCount(): number {
    return this.expenses$.value.length;
  }

  getTotal(): number {
    return this.getOrdersTotal() + this.getPaidSaleCreditsTotal() - this.getCreditsTotal() - this.getExpensesTotal();
  }

  getPaidSaleCreditsTotal(): number {
    return this.paidSaleCredits$.value.reduce((acc, credit) => acc + credit.total, 0);
  }

  getCashTotal(): number {
    return this.salesCashTotal + this.paidCreditsCashTotal - this.expensesCashTotal;
  }

  getCreditsCount(): number {
    return this.saleCredits$.value.length;
  }

  getCreditsTotal(): number {
    return this.saleCredits$.value.reduce((acc, credit) => acc + credit.total, 0);
  }

  getTotalClassName(): string {
    const total: number = this.getTotal();
    return this.getValueClassName(total);
  }

  getValueClassName(value: number): string {
    return value > 0 ? "text-success" : value < 0 ? "text-danger" : "";
  }
}
