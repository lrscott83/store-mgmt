/**
 * Shared currency formatter for sales, expenses, credits and any other money
 * amount. Non-breaking-space (U+00A0) thousands groups, dot decimals, `$` prefix:
 *
 * - Integers drop the decimals entirely (space win): `12345678` → `$12 345 678`
 * - Non-zero cents keep exactly two digits: `23456.7` → `$23 456.70`
 *
 * `Intl` cannot produce this shape directly (`en-US` gives `,` groups and
 * forces trailing `.00`; `es` gives `.` decimals), so the grouping is applied
 * manually over the integer part. Independent of the app's display locale.
 *
 * The thousands separator is U+00A0 (NO-BREAK SPACE), NOT a regular space:
 * a breakable space lets the browser wrap `$16 840` into `$16` / `840` on two
 * lines inside narrow price cells (order details, day-group totals, day-stats
 * panels). A single amount must never split across lines anywhere it renders,
 * so every money string this app produces is a single unbreakable unit.
 */
function groupAmount(amount: number): { sign: string; grouped: string; decimals: string } {
  const sign = amount < 0 ? '-' : '';
  const [intPart, decPart] = Math.abs(amount).toFixed(2).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  const decimals = decPart === '00' ? '' : `.${decPart}`;
  return { sign, grouped, decimals };
}

export function formatCurrency(amount: number): string {
  const { sign, grouped, decimals } = groupAmount(amount);
  return `${sign}$${grouped}${decimals}`;
}

/**
 * Money string carrying an EXPLICIT currency suffix (`12 500 CUP`, `25 USD`).
 *
 * For screens where a bare `$` would lie or mislead: the payment history shows two
 * currencies side by side, and the commissions screen sums them into separate columns.
 * Grouping is identical to `formatCurrency` (U+00A0 thousands, decimals only when
 * non-zero) — only the symbol slot differs.
 *
 * The currency is a structural union rather than the domain model's type so this module
 * stays dependency-free.
 */
export function formatMoneyWithCurrency(amount: number, currency: 'USD' | 'CUP'): string {
  const { sign, grouped, decimals } = groupAmount(amount);
  return `${sign}${grouped}${decimals} ${currency}`;
}
