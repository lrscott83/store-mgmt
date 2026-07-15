/**
 * Mirrors Angular's `CurrencyService`
 * (frontend/src/app/application/entries/currency.service.ts): a stateless,
 * root-provided singleton that reads/writes the selected display currency
 * (CUP or USD) and its USD conversion rate to localStorage.
 *
 * Framework-agnostic module of plain functions, matching the React port
 * convention for other stateless localStorage-backed Angular singletons
 * (see `~/shared/lib/usage/store-usage-tracker.ts`).
 */

const CURRENCY_LOCAL_STORAGE_KEY = 'lizoft.store-currency';

export interface CurrencyData {
  currency: 'CUP' | 'USD';
  rate: number;
}

export function setCurrency(currency: CurrencyData): void {
  if (currency) {
    localStorage.setItem(CURRENCY_LOCAL_STORAGE_KEY, JSON.stringify(currency));
  }
}

export function getCurrentCurrency(): CurrencyData {
  const currency = localStorage.getItem(CURRENCY_LOCAL_STORAGE_KEY);
  return currency ? JSON.parse(currency) : { currency: 'CUP', rate: 370 };
}
