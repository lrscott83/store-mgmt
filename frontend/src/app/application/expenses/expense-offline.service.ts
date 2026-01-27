import { Injectable, Inject } from '@angular/core';
import { Guid } from 'guid-typescript';
import { Observable, of } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { BaseService } from 'src/app/_services/base.service';
import { AuthService } from 'src/app/_services/services.index';
import { DataResult, Result } from 'src/app/domain/commons/result';
import { BaseResponseModel } from 'src/app/_services/_models/base.model';
import { Expense, ExpenseType } from 'src/app/domain/entities/expenses/expense.model';
import { ExpenseErrors } from 'src/app/domain/entities/expenses/expense.errors';
import { PaymentType } from 'src/app/domain/commons/payment-type';
import { startOfDay, addDays, subDays } from 'date-fns';

@Injectable({
    providedIn: "root"
})

export class ExpenseOfflineService extends BaseService<Expense> {
    private static STORE_EXPENSES_KEY: string = "lizoft.store-expenses-";

    private lastUserExpensesKey: string;
    private expenses: Expense[] = null;

    constructor(@Inject(HttpClient) http, private authService: AuthService) {
        super(http);
    }

    public getStorageExpenses(): Expense[] {
        if (!this.expenses || this.expenses.length === 0
            || this.getCurrentStorageKey() !== this.lastUserExpensesKey)
            this.expenses = this.getExpensesFromLocalStorage();
        return this.expenses;
    }

    private getStorageActiveExpenses(): Expense[] {
        return this.getStorageExpenses().filter(expense => expense.isActive);
    }

    // Begin Expenses management

    createExpense(expenseType: ExpenseType, total: number, note: string, date: Date, paymentType: PaymentType): DataResult<Expense> {
        const id: string = Guid.create().toString();
        this.expenses = this.getStorageExpenses();
        const expense: Expense = {
            id: id,
            type: expenseType,
            total: total,
            note: note,
            date: date,
            paymentType: paymentType,
            isActive: true,
            createdDate: date,
            createdByName: this.authService.currentUserValue.login,
            updatedDate: undefined,
            updatedByName: undefined,
        };
        this.expenses.push(expense);
        this.setExpensesLocalStorage(this.expenses);
        return new DataResult(expense, true, []);
    }

    updateExpense(expenseId: string, expenseType: ExpenseType, total: number, note: string, date: Date, paymentType: PaymentType): DataResult<Expense> {
        this.expenses = this.getStorageExpenses();
        let expense = this.expenses.find(e => e.id === expenseId);
        if (!expense)
            return new DataResult(undefined, false, [ExpenseErrors.NotExists]);

        expense.type = expenseType;
        expense.total = total;
        expense.note = note;
        expense.date = date;
        expense.paymentType = paymentType,
        expense.updatedDate = new Date();
        expense.updatedByName = this.authService.currentUserValue.login;
        this.setExpensesLocalStorage(this.expenses);
        return new DataResult(expense, true, []);
    }

    deleteExpense(expenseId: string): Result {
        this.expenses = this.getStorageExpenses();
        let expense = this.expenses.find(e => e.id === expenseId);
        if (!expense)
            return Result.Failure([ExpenseErrors.NotExists]);
        expense.isActive = false;
        expense.updatedDate = new Date();
        expense.updatedByName = this.authService.currentUserValue.login;
        this.setExpensesLocalStorage(this.expenses);
        return Result.Success();
    }

    // End Expenses management

    getExpensesInDayObservable(date: Date): Observable<BaseResponseModel<Expense[]>> {
        return of(this.getExpensesInDay(date));
    }

    filterExpensesObservable(expenseType: ExpenseType, paymentType: PaymentType, startDate: Date, endDate: Date): Observable<BaseResponseModel<Expense[]>> {
            const orders: Expense[] = this.getStorageActiveExpenses()
                .filter(expense => (!expenseType || expenseType === expense.type)
                    && (!paymentType || paymentType === expense.paymentType)
                    && (!startDate || expense.date >= startDate)
                    && (!endDate || expense.date < endDate));
            return of(this.Success(orders));
        }

    getExpensesInDay(date: Date): BaseResponseModel<Expense[]> {
        const startDate = startOfDay(new Date());
        const endDate = addDays(startDate, 1);
        const filteredExpenses: Expense[] = this.getStorageExpenses()
            .filter(expense => expense.isActive
                && expense.date >= startDate && expense.date < endDate)
            .sort((e1, e2) => e2.date.getTime() - e1.date.getTime());

        return this.Success(filteredExpenses);
    }

    getExpensesTotalBefore(date: Date): number {
        const expenses: Expense[] = this.getStorageActiveExpenses();
        let totalSum: number = 0;
        expenses
            .filter(expense => expense.date < date)
            .forEach((expense) => {
                totalSum += expense.total;
            });
        return totalSum;
    }

    getExpensesTotal(): number {
        const startDate = startOfDay(new Date());
        const endDate = addDays(startDate, 1);
        return this.getExpensesTotalBefore(endDate);
    }

    getExpensesTotalYesterday(): number {
        const startDate = startOfDay(new Date());
        return this.getExpensesTotalBefore(startDate);
    }

    private getActiveExpensesBetweenDates(startDate: Date, endDate: Date): Expense[] {
        return this.getStorageExpenses()
            .filter(expense => expense.isActive
                && expense.date >= startDate && expense.date < endDate)
            .sort((o1, o2) => o1.date.getTime() - o2.date.getTime());
    }

    public getActiveExpensesPriceBetweenDates(startDate: Date, endDate: Date): number {
        return this.getActiveExpensesBetweenDates(startDate, endDate)
            .reduce((total, expense) => total + expense.total, 0);
    }

    getActiveExpensesPriceToday(): number {
        const startDate = startOfDay(new Date());
        const endDate = addDays(startDate, 1);
        return this.getActiveExpensesPriceBetweenDates(startDate, endDate);;
    }

    getActiveExpensesPriceYesterday(): number {
        const startDate = startOfDay(subDays(new Date(), 1));
        const endDate = startOfDay(new Date());
        return this.getActiveExpensesPriceBetweenDates(startDate, endDate);
    }

    private getStorageKey() {
        this.lastUserExpensesKey = this.getCurrentStorageKey();
        return this.lastUserExpensesKey;
    }

    private getCurrentStorageKey() {
        return ExpenseOfflineService.STORE_EXPENSES_KEY + this.authService.currentUserValue.selectedStoreId;
    }

    getExpensesJson(): string {
        return localStorage.getItem(this.getStorageKey()) || "[]";
    }

    addImportedExpense(expense: Expense): Result {
        this.expenses = this.getExpensesFromLocalStorage();
        expense.date = new Date(expense.date);
        this.expenses.push(expense);
        this.setExpensesLocalStorage(this.expenses);
        return Result.Success();
    }

    updateImportedExpense(importedExpense: Expense): Result {
        this.expenses = this.getExpensesFromLocalStorage();
        let expense: Expense = this.expenses.find(o => o.id === importedExpense.id);
        if (expense) {
            expense.date = new Date(importedExpense.date);
            expense.isActive = importedExpense.isActive;
            expense.total = importedExpense.total;
            expense.note = importedExpense.note;
            expense.type = importedExpense.type;
            expense.updatedDate = importedExpense.updatedDate;
            expense.updatedByName = importedExpense.updatedByName;
            this.setExpensesLocalStorage(this.expenses);
        }
        return Result.Success();
    }

    private setExpensesLocalStorage(expenses: Expense[]) {
        let expensesMapJson = JSON.stringify(expenses);
        localStorage.setItem(this.getStorageKey(), expensesMapJson);
    }

    private setCurrentExpensesLocalStorage() {
        this.setExpensesLocalStorage(this.expenses);
    }

    private getExpensesFromLocalStorage(): Expense[] {
        try {
            let expensesJson = localStorage.getItem(this.getStorageKey());
            if (expensesJson) {
                const expenses = JSON.parse(expensesJson);
                return expenses.map(expense => {
                    expense.date = new Date(expense.date);
                    if (!expense.paymentType)
                        expense.paymentType = PaymentType.Efectivo;
                    return expense;
                });
            }
        } catch (ignore) {

        }
        this.setExpensesLocalStorage([]);
        return [];
    }
}
