/**
 * Shared currency formatter for sales, expenses, credits and any other money
 * amount. Space-separated thousands groups, dot decimals, `$` prefix:
 *
 * - Integers drop the decimals entirely (space win): `12345678` → `$12 345 678`
 * - Non-zero cents keep exactly two digits: `23456.7` → `$23 456.70`
 *
 * `Intl` cannot produce this shape directly (`en-US` gives `,` groups and
 * forces trailing `.00`; `es` gives `.` decimals), so the grouping is applied
 * manually over the integer part. Independent of the app's display locale.
 */
export function formatCurrency(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const [intPart, decPart] = Math.abs(amount).toFixed(2).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const decimals = decPart === '00' ? '' : `.${decPart}`;
  return `${sign}$${grouped}${decimals}`;
}
