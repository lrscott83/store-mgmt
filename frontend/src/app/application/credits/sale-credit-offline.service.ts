import { Injectable, Inject } from '@angular/core';
import { Guid } from 'guid-typescript';
import { Observable, of } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { BaseService } from 'src/app/_services/base.service';
import { AuthService } from 'src/app/_services/services.index';
import { DataResult, Result } from 'src/app/domain/commons/result';
import { BaseResponseModel } from 'src/app/_services/_models/base.model';
import { SaleCredit } from 'src/app/domain/entities/sale-credits/sale-credit.model';
import { SaleCreditErrors } from 'src/app/domain/entities/sale-credits/sale-credit.errors';
import { PaymentType } from 'src/app/domain/commons/payment-type';
import { startOfDay, subDays, addDays} from 'date-fns';

@Injectable({
    providedIn: "root"
})

export class SaleCreditOfflineService extends BaseService<SaleCredit> {
    private static STORE_EXPENSES_KEY: string = "lizoft.store-saleCredits-";

    private lastUserSaleCreditsKey: string;
    private saleCredits: SaleCredit[] = null;

    constructor(@Inject(HttpClient) http, private authService: AuthService) {
        super(http);
    }

    public getStorageSaleCredits(): SaleCredit[] {
        if (!this.saleCredits || this.saleCredits.length === 0
            || this.getCurrentStorageKey() !== this.lastUserSaleCreditsKey)
            this.saleCredits = this.getSaleCreditsFromLocalStorage();
        return this.saleCredits;
    }

    private getStorageActiveSaleCredits(): SaleCredit[] {
        return this.getStorageSaleCredits().filter(saleCredit => saleCredit.isActive);
    }

    // Begin SaleCredits management

    createSaleCredit(orderId: string, client: string, total: number, note: string): DataResult<SaleCredit> {
        const id: string = Guid.create().toString();
        this.saleCredits = this.getStorageSaleCredits();
        const date = new Date();
        const saleCredit: SaleCredit = {
            id: id,
            orderId: orderId,
            client: client,
            total: total,
            note: note,
            date: date,
            paid: 0,
            isPaid: false,
            isActive: true,
            paidDate: null,
            paidType: null,
            createdDate: date,
            createdByName: this.authService.currentUserValue.login,
            updatedDate: undefined,
            updatedByName: undefined,
        };
        this.saleCredits.push(saleCredit);
        this.setSaleCreditsLocalStorage(this.saleCredits);
        return new DataResult(saleCredit, true, []);
    }

    updateSaleCredit(saleCreditId: string, client: string, note: string): DataResult<SaleCredit> {
        this.saleCredits = this.getStorageSaleCredits();
        let saleCredit = this.saleCredits.find(e => e.id === saleCreditId);
        if (!saleCredit)
            return new DataResult(undefined, false, [SaleCreditErrors.NotExists]);

        saleCredit.client = client;
        saleCredit.note = note;
        saleCredit.updatedDate = new Date();
        saleCredit.updatedByName = this.authService.currentUserValue.login;
        this.setSaleCreditsLocalStorage(this.saleCredits);
        return new DataResult(saleCredit, true, []);
    }

    paidSaleCredit(saleCreditId: string, paidType: PaymentType, note: string): DataResult<SaleCredit> {
        this.saleCredits = this.getStorageSaleCredits();
        let saleCredit = this.saleCredits.find(e => e.id === saleCreditId);
        if (!saleCredit)
            return new DataResult(undefined, false, [SaleCreditErrors.NotExists]);

        const date = new Date();
        saleCredit.paid = saleCredit.total;
        saleCredit.isPaid = true;
        saleCredit.paidDate = date;
        saleCredit.paidType = paidType;
        saleCredit.note = note;
        saleCredit.updatedDate = date;
        saleCredit.updatedByName = this.authService.currentUserValue.login;
        this.setSaleCreditsLocalStorage(this.saleCredits);
        return new DataResult(saleCredit, true, []);
    }

    deleteSaleCredit(saleCreditId: string): Result {
        this.saleCredits = this.getStorageSaleCredits();
        let saleCredit = this.saleCredits.find(e => e.id === saleCreditId);
        if (!saleCredit)
            return Result.Failure([SaleCreditErrors.NotExists]);
        saleCredit.isActive = false;
        saleCredit.updatedDate = new Date();
        saleCredit.updatedByName = this.authService.currentUserValue.login;
        this.setSaleCreditsLocalStorage(this.saleCredits);
        return Result.Success();
    }

    private getSaleCreditByOrderId(orderId: string): SaleCredit {
        return this.getStorageActiveSaleCredits().find(credit => credit.orderId === orderId);
    }

    deactivateSaleCreditByOrderId(orderId: string): Result {
        const saleCredit: SaleCredit = this.getSaleCreditByOrderId(orderId);
        return saleCredit != null ? this.deleteSaleCredit(saleCredit.id) : Result.Success();
    }

    // End SaleCredits management

    getSaleCreditsInDayObservable(date: Date): Observable<BaseResponseModel<SaleCredit[]>> {
        return of(this.getSaleCreditsInDay(date));
    }

    getUnPaidSaleCreditsInDayObservable(date: Date): Observable<BaseResponseModel<SaleCredit[]>> {
        const activeCreditsResponse = this.getSaleCreditsInDay(date);
        return of(this.Success(activeCreditsResponse.succeeded
            ? activeCreditsResponse.data.filter(credit => !credit.isPaid)
            : []
        ));
    }

    getPaidSaleCreditsInDayObservable(date: Date): Observable<BaseResponseModel<SaleCredit[]>> {
        const startDate = startOfDay(date);
        const endDate = addDays(startDate, 1);
        const filteredSaleCredits: SaleCredit[] = this.getStorageSaleCredits()
            .filter(saleCredit => saleCredit.isActive && saleCredit.isPaid && saleCredit.paidDate
                && saleCredit.paidDate >= startDate && saleCredit.paidDate < endDate)
            .sort((e1, e2) => e1.date.getTime() - e2.date.getTime());

        return of(this.Success(filteredSaleCredits));
    }

    getSaleCreditsObservable(): Observable<BaseResponseModel<SaleCredit[]>> {
        return of(this.Success(this.getStorageActiveSaleCredits()));
    }

    filterSaleCredits(isPaid: boolean, client: string, startDate: Date, endDate: Date)
        : Observable<BaseResponseModel<SaleCredit[]>> {
        const credits: SaleCredit[] = this.getStorageActiveSaleCredits()
            .filter(credit => (!client || credit.client.includes(client))
                && (!isPaid || credit.isPaid === isPaid)
                && (!startDate || credit.date >= startDate)
                && (!endDate || credit.date < endDate));
        return of(this.Success(credits));
    }

    getSaleCreditsInDay(date: Date): BaseResponseModel<SaleCredit[]> {
        const startDate = startOfDay(date);
        const endDate = addDays(startDate, 1);
        const filteredSaleCredits: SaleCredit[] = this.getStorageSaleCredits()
            .filter(saleCredit => saleCredit.isActive
                && saleCredit.date >= startDate && saleCredit.date < endDate)
            .sort((e1, e2) => e1.date.getTime() - e2.date.getTime());

        return this.Success(filteredSaleCredits);
    }

    getSaleCreditsTotalBefore(date: Date): number {
        const saleCredits: SaleCredit[] = this.getStorageActiveSaleCredits();
        let totalSum: number = 0;
        saleCredits
            .filter(saleCredit => saleCredit.date < date)
            .forEach((saleCredit) => {
                totalSum += saleCredit.total;
            });
        return totalSum;
    }

    getSaleCreditsTotal(): number {
        const startDate = startOfDay(new Date());
        const endDate = addDays(startDate, 1);
        return this.getSaleCreditsTotalBefore(endDate);
    }

    getSaleCreditsTotalYesterday(): number {
        const startDate = startOfDay(new Date());
        const endDate = addDays(startDate, 1);
        return this.getSaleCreditsTotalBefore(startDate);
    }


    private getActiveSaleCreditsBetweenDates(startDate: Date, endDate: Date): SaleCredit[] {
        return this.getStorageSaleCredits()
            .filter(saleCredit => saleCredit.isActive
                && saleCredit.date >= startDate && saleCredit.date < endDate)
            .sort((o1, o2) => o1.date.getTime() - o2.date.getTime());
    }

    private getActiveSaleCreditsPriceBetweenDates(startDate: Date, endDate: Date): number {
        return this.getActiveSaleCreditsBetweenDates(startDate, endDate)
            .reduce((total, saleCredit) => total + saleCredit.total, 0);
    }

    private getActiveUnpaidSaleCreditsPriceBetweenDates(startDate: Date, endDate: Date): number {
        return this.getActiveSaleCreditsBetweenDates(startDate, endDate)
            .filter(credit => !credit.isPaid)
            .reduce((total, saleCredit) => total + saleCredit.total, 0);
    }

    getActiveUnpaidSaleCreditsPriceToday(): number {
        const startDate = startOfDay(new Date());
        const endDate = addDays(startDate, 1);
        return this.getActiveUnpaidSaleCreditsPriceBetweenDates(startDate, endDate);
    }

    getActiveUnpaidSaleCreditsPriceYesterday(): number {
        const startDate = startOfDay(subDays(new Date(), 1));
        const endDate = startOfDay(new Date());
        return this.getActiveUnpaidSaleCreditsPriceBetweenDates(startDate, endDate);
    }

    getActiveSaleCreditsPriceToday(): number {
        const startDate = startOfDay(new Date());
        const endDate = addDays(startDate, 1);
        return this.getActiveSaleCreditsPriceBetweenDates(startDate, endDate);
    }

    getActiveSaleCreditsPriceYesterday(): number {
        const startDate = startOfDay(subDays(new Date(), 1));
        const endDate = startOfDay(new Date());
        return this.getActiveSaleCreditsPriceBetweenDates(startDate, endDate);
    }

    private getStorageKey() {
        this.lastUserSaleCreditsKey = this.getCurrentStorageKey();
        return this.lastUserSaleCreditsKey;
    }

    private getCurrentStorageKey() {
        return SaleCreditOfflineService.STORE_EXPENSES_KEY + this.authService.currentUserValue.selectedStoreId;
    }

    getSaleCreditsJson(): string {
        return localStorage.getItem(this.getStorageKey()) || "[]";
    }

    addImportedSaleCredit(saleCredit: SaleCredit): Result {
        this.saleCredits = this.getSaleCreditsFromLocalStorage();
        saleCredit.date = new Date(saleCredit.date);
        this.saleCredits.push(saleCredit);
        this.setSaleCreditsLocalStorage(this.saleCredits);
        return Result.Success();
    }

    updateImportedSaleCredit(importedSaleCredit: SaleCredit): Result {
        this.saleCredits = this.getSaleCreditsFromLocalStorage();
        let saleCredit: SaleCredit = this.saleCredits.find(o => o.id === importedSaleCredit.id);
        if (saleCredit) {
            saleCredit.isActive = importedSaleCredit.isActive;
            saleCredit.client = importedSaleCredit.client;
            saleCredit.note = importedSaleCredit.note;
            saleCredit.updatedDate = importedSaleCredit.updatedDate;
            saleCredit.updatedByName = importedSaleCredit.updatedByName;
            if (!saleCredit.paid) {
                saleCredit.paid = importedSaleCredit.paid;
                saleCredit.isPaid = importedSaleCredit.isPaid;
                saleCredit.paidDate = importedSaleCredit.paidDate;
            }
            this.setSaleCreditsLocalStorage(this.saleCredits);
        }
        return Result.Success();
    }

    private setSaleCreditsLocalStorage(saleCredits: SaleCredit[]) {
        let saleCreditsMapJson = JSON.stringify(saleCredits);
        localStorage.setItem(this.getStorageKey(), saleCreditsMapJson);
    }

    private setCurrentSaleCreditsLocalStorage() {
        this.setSaleCreditsLocalStorage(this.saleCredits);
    }

    private getSaleCreditsFromLocalStorage(): SaleCredit[] {
        try {
            let saleCreditsJson = localStorage.getItem(this.getStorageKey());
            if (saleCreditsJson) {
                const saleCredits = JSON.parse(saleCreditsJson);
                return saleCredits.map(saleCredit => {
                    saleCredit.date = new Date(saleCredit.date);
                    saleCredit.paymentDate = new Date(saleCredit.paymentDate);
                    saleCredit.paidDate = new Date(saleCredit.paidDate);
                    return saleCredit;
                });
            }
        } catch (ignore) {

        }
        this.setSaleCreditsLocalStorage([]);
        return [];
    }
}
