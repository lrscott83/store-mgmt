import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SharedModule } from '../../shared/shared.module';
import { BehaviorSubject, Observable } from 'rxjs';
import { Expense, ExpenseType, ExpenseTypeUtils } from 'src/app/domain/entities/expenses/expense.model';
import { EditExpenseModalComponent } from '../edit-expense-modal/edit-expense-modal.component';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { ExpenseOfflineService } from 'src/app/application/expenses/expense-offline.service';
import { PaymentType, PaymentTypeUtils } from 'src/app/domain/commons/payment-type';

@Component({
    selector: 'app-expense-list',
    imports: [SharedModule, TranslateModule, EditExpenseModalComponent],
    templateUrl: './expense-list.component.html',
    styleUrl: './expense-list.component.scss'
})
export class ExpenseListComponent {
  @Input() expenses$: Observable<Expense[]> = new BehaviorSubject<Expense[]>([]).asObservable();
  @Input() readOnly: boolean = true;

  @Output() expensesUpdatedEmitter = new EventEmitter();

  constructor(private modalService: NgbModal, private translate: TranslateService, private expenseService: ExpenseOfflineService) {

  }

  getExpenseTypeText(type: ExpenseType): string {
    return ExpenseTypeUtils.getExpenseTypeText(type);
  }

  getPaymentTypeText(type: PaymentType): string {
    return PaymentTypeUtils.getPaymentTypeText(type);
  }

  getPaymentTypeIcon(paymentType: PaymentType) {
    return PaymentTypeUtils.getPaymentTypeIcon(paymentType);
  }

  openEditExpenseModal(expense: Expense) {
    const modalRef = this.modalService.open(EditExpenseModalComponent, { centered: true, size: "lg" });
    modalRef.componentInstance.expense = expense;
    modalRef.componentInstance.expenseUpdatedEmitter.subscribe((updatedExpense: Expense) => {
      expense.type = updatedExpense.type;
      expense.total = updatedExpense.total;
      expense.note = updatedExpense.note;
      expense.date = updatedExpense.date;
    });
  }

  onDeleteExpense(expenseId: string) {
    Swal.fire({
      title: this.translate.instant('GENERAL.DELETE_CONFIRM_TITLE'),
      text: this.translate.instant('GENERAL.DELETE_CONFIRM_MESSAGE',
        { name: this.translate.instant('GENERAL.EXPENSE') }),
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#3456ff",
      cancelButtonColor: "#dc3545",
      confirmButtonText: this.translate.instant('GENERAL.YES'),
      cancelButtonText: this.translate.instant('GENERAL.NO'),
    }).then((result) => {
      if (result.isConfirmed) {
        this.expenseService.deleteExpense(expenseId);
        if (this.expensesUpdatedEmitter)
          this.expensesUpdatedEmitter.emit();
      }
    });
  }

}
