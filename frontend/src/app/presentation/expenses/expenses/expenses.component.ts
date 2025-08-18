import { Component, OnInit } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ExpenseListComponent } from '../expense-list/expense-list.component';
import { BehaviorSubject, catchError, Observable, of } from 'rxjs';
import { Expense, ExpenseType, ExpenseTypeUtils } from 'src/app/domain/entities/expenses/expense.model';
import { ExpenseOfflineService } from 'src/app/application/expenses/expense-offline.service';
import { GlobalConfig } from 'src/app/_shared/configs/global.config';
import { PaymentType, PaymentTypeUtils } from 'src/app/domain/commons/payment-type';
import { TypeData } from 'src/app/domain/commons/type-data';

export interface DateExpense {
  date: Date;
  expenses: Expense[];
  count: number;
  total: number;
}

@Component({
  selector: 'app-expenses',
  standalone: true,
  imports: [SharedModule, TranslateModule, ExpenseListComponent],
  templateUrl: './expenses.component.html',
  styleUrl: './expenses.component.scss'
})
export class ExpensesComponent implements OnInit {
  dateExpenses$: BehaviorSubject<DateExpense[]> = new BehaviorSubject<DateExpense[]>([]);
  onlyDateFormat: string = GlobalConfig.ONLY_DATE_FORMAT;

  paymentType: PaymentType = null;
  paymentTypes: TypeData[] = PaymentTypeUtils.getPaymentTypes();

  expenseType: ExpenseType = null;
  expenseTypes: TypeData[] = ExpenseTypeUtils.getExpenseTypes();

  constructor(private expenseService: ExpenseOfflineService, private translate: TranslateService) { }

  ngOnInit(): void {
    this.loadExpenses();
  }

  getExpensesObservable(expenses: Expense[]): Observable<Expense[]> {
    return of(expenses);
  }

  getExpensesCount(): number {
    return this.dateExpenses$.value.reduce((count, expense) => count += expense.count, 0);
  }

  getExpensesTotal(): number {
    return this.dateExpenses$.value.reduce((total, expense) => total += expense.total, 0);
  }

  getPaymentTypeIcon(paymentType: PaymentType) {
    return PaymentTypeUtils.getPaymentTypeIcon(paymentType);
  }

  loadExpenses() {
    this.loadExpensesFiltered(this.expenseType, this.paymentType, null, null);
  }

  loadExpensesFiltered(expenseType: ExpenseType, paymentType: PaymentType, startDate: Date, endDate: Date) {
    this.expenseService.filterExpensesObservable(expenseType, paymentType, startDate, endDate)
      .pipe(catchError((error) => {
        console.log("Error when filterExpenses: ", error);
        throw error;
      }))
      .subscribe((response) => {
        if (response.succeeded) {
          const dateExpenses: DateExpense[] = this.groupExpenses(response.data);
          this.dateExpenses$.next(dateExpenses);
        } else {
          console.log("Error when filterExpenses");
        }
      });
  }

  groupExpenses(expenses: Expense[]): DateExpense[] {
    let groups: Map<string, Expense[]> = new Map();
    expenses.forEach(credit => {
      const groupId = credit.date.toISOString().split("T")[0];
      const collection = groups.get(groupId);
      if (collection)
        collection.push(credit);
      else
        groups.set(groupId, [credit]);
    });

    const dateExpense: DateExpense[] = [];
    Array.from(groups.values()).forEach(credits => {
      dateExpense.push({
        date: credits[0].date,
        expenses: credits.sort((c1, c2) => c2.date.getTime() - c1.date.getTime()),
        count: credits.reduce((count, expense) => count += 1, 0),
        total: credits.reduce((total, expense) => total += expense.total, 0),
      });
    });

    return dateExpense.sort((c1, c2) => c2.date.getTime() - c1.date.getTime());
  }
}
