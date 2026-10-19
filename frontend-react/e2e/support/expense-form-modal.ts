import type { Page } from '@playwright/test';
import { expect } from './test';

/**
 * NEW support file (store-payment-methods-config, T7 — 2026-09-22): helpers to
 * open the expense create modal on `/expenses/today` and read its payment
 * method options. Mirrors the navigation pattern of `expense-crud.spec.ts`
 * (untouched); the payment-method select is asserted by OPTION TEXT, which is
 * what the two new specs need to observe the per-store config.
 */

export const EXPENSES_HEADER = 'Gastos del día';
export const NEW_EXPENSE_TITLE = 'Adicionar Gasto';
export const EXPENSE_BUTTON = 'Gasto';

/**
 * Testid of the expense modal's CURRENCY select. It only renders with the
 * MultiMonedas module (15) — which every store born on the Superior plan has
 * since 2026-10-13 — so its presence is itself the module gate, and its absence
 * shifts every later `<select>` index by one.
 */
export const EXPENSE_CURRENCY_SELECT = 'expense-currency-select';

/** Opens the expense create modal on `/expenses/today` (create mode, no save). */
export async function openExpenseFormModal(page: Page): Promise<void> {
  await page.goto('/expenses/today');
  await expect(page.getByText(EXPENSES_HEADER)).toBeVisible();
  await page.getByRole('button', { name: EXPENSE_BUTTON }).click();
  await expect(page.getByText(NEW_EXPENSE_TITLE)).toBeVisible();
}

/**
 * Payment-method combobox inside the expense modal: the LAST `<select>` in the
 * dialog. The dialog renders type → currency → payment method, and the CURRENCY
 * select only exists with the MultiMonedas module (15) — which a newly
 * registered store now always has, since the birth plan is Superior (owner
 * decision 2026-10-13). The old `nth(1)` index silently pointed at the currency
 * select in that layout and read 7 currency codes as "payment options".
 *
 * Targeting the last combobox is correct in BOTH layouts: without module 15 the
 * dialog has [type, payment] and with it [type, currency, payment]. The note
 * field is a `<textarea>`, so it never matches a combobox.
 */
export function expensePaymentSelect(page: Page) {
  const dialog = page.getByRole('dialog');
  return dialog.getByRole('combobox').last();
}

/** Visible option labels of the expense modal's payment-method select. */
export async function expensePaymentOptions(page: Page): Promise<string[]> {
  return expensePaymentSelect(page).locator('option').allTextContents();
}