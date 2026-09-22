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

/** Opens the expense create modal on `/expenses/today` (create mode, no save). */
export async function openExpenseFormModal(page: Page): Promise<void> {
  await page.goto('/expenses/today');
  await expect(page.getByText(EXPENSES_HEADER)).toBeVisible();
  await page.getByRole('button', { name: EXPENSE_BUTTON }).click();
  await expect(page.getByText(NEW_EXPENSE_TITLE)).toBeVisible();
}

/**
 * Payment-method combobox inside the expense modal: the 2nd `<select>` in the
 * dialog (the 1st is the expense type; the currency select only renders with
 * the MultiMonedas module, which the E2E personas' Pago store does not have).
 */
export function expensePaymentSelect(page: Page) {
  const dialog = page.getByRole('dialog');
  return dialog.getByRole('combobox').nth(1);
}

/** Visible option labels of the expense modal's payment-method select. */
export async function expensePaymentOptions(page: Page): Promise<string[]> {
  return expensePaymentSelect(page).locator('option').allTextContents();
}