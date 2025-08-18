import { Component, OnInit } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { Expense } from 'src/app/domain/entities/expenses/expense.model';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { EditExpenseModalComponent } from '../edit-expense-modal/edit-expense-modal.component';
import { ExpenseOfflineService } from 'src/app/application/expenses/expense-offline.service';
import Swal from 'sweetalert2';
import { ExpenseListComponent } from '../expense-list/expense-list.component';

@Component({
  selector: 'app-expenses-today',
  standalone: true,
  imports: [SharedModule, TranslateModule, EditExpenseModalComponent, ExpenseListComponent],
  templateUrl: './expenses-today.component.html',
  styleUrl: './expenses-today.component.scss'
})
export class ExpensesTodayComponent implements OnInit {
  expenses$: BehaviorSubject<Expense[]> = new BehaviorSubject<Expense[]>([]);

  constructor(private modalService: NgbModal, private expenseService: ExpenseOfflineService, private translate: TranslateService) { }

  ngOnInit(): void {
    this.loadExpenses();
  }

  loadExpenses() {
    this.expenseService.getExpensesInDayObservable(new Date()).subscribe(response => {
      if (response.succeeded) {
        this.expenses$.next(response.data);
      } else {
        console.log("Error when getExpensesInDay");
      }
    }, error => {
      console.log("Error when getExpensesInDay: ", error);
    });
  }

  openCreateExpenseModal() {
    const modalRef = this.modalService.open(EditExpenseModalComponent, { centered: true, size: "lg" });
    modalRef.componentInstance.expenseInsertedEmitter.subscribe((expense) => {
      this.expenses$.next([expense, ...this.expenses$.value]);
    });
  }
}
