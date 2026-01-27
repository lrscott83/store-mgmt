import { Component, EventEmitter, Input, Output, ViewEncapsulation } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ExpenseOfflineService } from 'src/app/application/expenses/expense-offline.service';
import { Expense, ExpenseType, ExpenseTypeUtils } from 'src/app/domain/entities/expenses/expense.model';
import { SharedModule } from '../../shared/shared.module';
import { DataResult } from 'src/app/domain/commons/result';
import Swal from 'sweetalert2';
import { RegExExtensions } from 'src/app/_helpers/extensions/regex-extension';
import { TypeData } from 'src/app/domain/commons/type-data';
import { PaymentType, PaymentTypeUtils } from 'src/app/domain/commons/payment-type';

@Component({
    selector: 'app-edit-expense-modal',
    imports: [SharedModule, TranslateModule],
    templateUrl: './edit-expense-modal.component.html',
    styleUrl: './edit-expense-modal.component.scss',
    encapsulation: ViewEncapsulation.None
})
export class EditExpenseModalComponent {

  expenseType: ExpenseType = ExpenseType.Salario;
  expenseTypes: TypeData[] = ExpenseTypeUtils.getExpenseTypes();

  paymentType: PaymentType = PaymentType.Efectivo;
  paymentTypes: TypeData[] = PaymentTypeUtils.getPaymentTypes();

  @Input() expense: Expense;

  @Output() expenseInsertedEmitter: EventEmitter<Expense> = new EventEmitter<Expense>();
  @Output() expenseUpdatedEmitter: EventEmitter<Expense> = new EventEmitter<Expense>();

  formGroup: FormGroup;
  formPatterns: any;

  constructor(private expenseService: ExpenseOfflineService, private formBuilder: FormBuilder, private modal: NgbActiveModal, private translate: TranslateService) {
    this.loadForm();
  }

  ngOnInit(): void {
    if (this.expense) {
      // Update mode.
      this.formGroup.patchValue(this.expense);
    }
  }

  closeModal() {
    this.modal.close();
  }

  onSubmit() {
    if (!this.formGroup.valid) {
      this.formGroup.markAllAsTouched();
      return;
    }

    if (!this.expense) {
      // Insert
      const dataEntry: DataResult<Expense> = this.expenseService.createExpense(this.expenseType, this.formGroup.value.total, this.formGroup.value.note, new Date(), this.paymentType);
      if (this.expenseInsertedEmitter) {
        this.expenseInsertedEmitter.emit(dataEntry.data);
      }
      this.closeModal();

    } else {
      // Update
      const dataEntry: DataResult<Expense> = this.expenseService.updateExpense(this.expense.id, this.expenseType, this.formGroup.value.total, this.formGroup.value.note, this.expense.date, this.paymentType);
      if (dataEntry && dataEntry.succeeded) {
        if (this.expenseUpdatedEmitter) {
          this.expenseUpdatedEmitter.emit(dataEntry.data);
        }
        this.closeModal();
      } else {
        Swal.fire({
          icon: 'error',
          title: this.translate.instant('GENERAL.ERROR'),
          text: dataEntry.errors[0].description
        });
      }
    }
  }

  loadForm() {
    this.loadPatterns();
    this.formGroup = this.formBuilder.group({
      note: [{ value: "", disabled: false }, Validators.compose([])],
      total: [{ value: "", disabled: false }, Validators.compose([
        Validators.required,
        Validators.min(0),
        Validators.pattern(this.formPatterns.currency.regex)
      ])]
    });
  }

  loadPatterns() {
    this.formPatterns = {
      number: {
        regex: RegExExtensions.numeric,
        mask: "0*",
      },
      currency: {
        regex: RegExExtensions.currency,
        mask: "0*.00",
      }
    };
  }

  // patterns(controlName: string): any {
  //   return this.formPatterns[controlName].pattern;
  // }

  // mask(controlName: string): any {
  //   return this.formPatterns[controlName].mask;
  // }

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
