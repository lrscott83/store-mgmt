/**
 * Shared USD currency formatter, matching Angular's `{{ value | currency }}`
 * (default `en-US` style, `$` symbol, 2 decimals) independent of the app's
 * own display locale (`'es'`). `react-intl`'s `formatNumber` is NOT usable
 * here — its `'es'` locale renders `"2.000,00 US$"` instead of `"$2,000.00"`.
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
