import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services.index';
import { NavigationEnd, Router } from '@angular/router';
import { catchError, filter, Subscription } from 'rxjs';
import { Guid } from 'guid-typescript';
import { BaseResponseModel } from '../_models/base.model';
import { environment } from 'src/environments/environment';
import { DailyUsage, Usage } from './usage.model';

const API_URL = `${environment.apiUrl}`;

@Injectable({ providedIn: 'root' })
export class StoreUsageTrackerService implements OnDestroy {
    private static readonly STORE_DAILY_USAGE_KEY = 'lizoft.store-daily-usage-';

    private sending: boolean = false;
    private eventSubscription: Subscription;

    constructor(
        private authService: AuthService,
        private http: HttpClient,
        private router: Router
    ) {
        this.startTracking();
    }

    private isUserAuthenticated(): boolean {
        return this.authService.currentUserValue
            && this.authService.currentUserValue.id
            && Guid.EMPTY !== this.authService.currentUserValue.id
            && this.authService.currentUserValue.selectedStoreId
            && Guid.EMPTY !== this.authService.currentUserValue.selectedStoreId
    }

    public startTracking() {
        if (this.eventSubscription
            || !this.isUserAuthenticated())
            return;

        this.eventSubscription = this.router.events.pipe(
            filter(event => event instanceof NavigationEnd)
        ).subscribe(() => {
            this.registerActivity();
        });
    }

    public stopTracking() {
        if (this.eventSubscription) {
            this.eventSubscription.unsubscribe();
            this.eventSubscription = null;
        }
    }

    private registerActivity() {
        if (!this.isUserAuthenticated())
            return;

        const usageData = this.getUsageData();
        if (!this.wasUsedToday(usageData)) {
            const today = this.getToday(); // Formato YYYY-MM-DD
            usageData.activeDays.push({ day: today, saved: false });
            this.setUsageData(usageData);
        }
        this.sendUsageData();
    }

    private sendUsageData() {
        if (this.sending || !this.isUserAuthenticated())
            return;

        const usageData = this.getUsageData();
        const unSavedDays = usageData.activeDays.filter(day => !day.saved);
        if (unSavedDays.length === 0)
            return;

        this.sending = true;
        const requestData = {
            activeDays: unSavedDays
        };
        this.http.post<BaseResponseModel<DailyUsage[]>>(`${API_URL}/${environment.apiVersion}/usages/store-daily-usage`, requestData)
            .pipe(catchError((error) => {
                this.sending = false;
                throw error;
            }))
            .subscribe(async response => {
                if (response && response.succeeded && response.data) {
                    const usageData = this.getUsageData();
                    usageData.activeDays.forEach(usage => {
                        usage.saved = true;
                    });
                    this.setUsageData(usageData);
                }
                this.sending = false;
            });;
    }

    private wasUsedToday(usage: Usage): boolean {
        return usage.activeDays.some(day => day.day === this.getToday());
    }

    private getToday(): string {
        return new Date().toISOString().split('T')[0];
    }

    private getCurrentStorageKey() {
        return StoreUsageTrackerService.STORE_DAILY_USAGE_KEY + this.authService.currentUserValue.id;
    }

    private getUsageData(): Usage {
        const data = localStorage.getItem(this.getCurrentStorageKey());
        return data ? JSON.parse(data) : { activeDays: [] };
    }

    private setUsageData(usage: Usage) {
        localStorage.setItem(this.getCurrentStorageKey(), JSON.stringify(usage));
    }

    // Opcional: Limpiar datos antiguos si solo quieres mantener X días de registro
    public cleanOldData(daysToKeep: number) {
        if (!this.isUserAuthenticated())
            return;
        
        const usageData = this.getUsageData();
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        const filteredData = usageData.activeDays.filter(day => {
            const date = new Date(day.day);
            return date >= cutoffDate;
        });

        if (filteredData.length !== usageData.activeDays.length) {
            this.setUsageData({ activeDays: filteredData });
        }
    }

    ngOnDestroy() {
        this.stopTracking();
    }
}