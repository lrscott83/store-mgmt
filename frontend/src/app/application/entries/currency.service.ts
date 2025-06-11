import { Injectable } from "@angular/core";

export interface CurrencyData {
  currency: 'CUP' | 'USD';
  rate: number;
}

const CURRENCY_LOCAL_STORAGE_KEY = 'lizoft.store-currency';

@Injectable({
    providedIn: 'root',
})
export class CurrencyService {

    setCurrency(currency: CurrencyData) {
        if (currency) {
            localStorage.setItem(CURRENCY_LOCAL_STORAGE_KEY, JSON.stringify(currency));
        }
    }

    getCurrentCurrency(): CurrencyData {
        const currency: string = localStorage.getItem(CURRENCY_LOCAL_STORAGE_KEY);
        return currency ? JSON.parse(currency) : {currency: 'CUP', rate: 370};
    }

}