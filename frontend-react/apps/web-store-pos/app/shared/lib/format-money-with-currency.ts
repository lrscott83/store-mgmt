import { Currency } from '@store-mgmt/domain';

/**
 * Money formatter with a visible currency label (MultiMonedas feature):
 * keeps the unbreakable NBSP thousands grouping of formatCurrency but replaces
 * the `$` prefix with the currency code as a suffix:
 *
 * - `2000 CUP` → `"2 000 CUP"`, `10 USD` → `"10 USD"`
 * - Integers drop decimals, cents keep two digits (same rules as formatCurrency)
 * - Absent/unknown currency falls back to CUP (DEFAULT_CURRENCY)
 */
export function formatMoneyWithCurrency(amount: number, currency?: number): string {
  const sign = amount < 0 ? '-' : '';
  const [intPart, decPart] = Math.abs(amount).toFixed(2).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  const decimals = decPart === '00' ? '' : `.${decPart}`;
  const currencyCode = currencyLabel(currency);
  return `${sign}${grouped}${decimals}\u00A0${currencyCode}`;
}

/** Currency code labels. CLA keeps its code as-is (product requirement). */
export function currencyLabel(currency?: number): string {
  switch (currency) {
    case Currency.USD:
      return 'USD';
    case Currency.EUR:
      return 'EUR';
    case Currency.CLA:
      return 'CLA';
    case Currency.MLC:
      return 'MLC';
    case Currency.CAD:
      return 'CAD';
    case Currency.MXN:
      return 'MXN';
    default:
      return 'CUP';
  }
}
