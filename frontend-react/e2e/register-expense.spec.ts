import { test, expect } from './support/test';

/**
 * [S2-E1] Registrar gasto — E2E Playwright
 * docs/testing/e2e-stage-2/S2-E1.md
 *
 * Tests the expense registration UI: create an expense, validation,
 * and offline mode.
 *
 * Uses `owner-admin-with-products` persona.
 */

// i18n literal strings from es.ts
const EXPENSES_HEADER = 'Gastos del día'; // EXPENSES.TODAY.TITLE
const NEW_EXPENSE_TITLE = 'Adicionar Gasto'; // EXPENSES.NEW_TITLE
const EXPENSE_BUTTON = 'Gasto'; // EXPENSES.ADD_BUTTON
const INSERT_BUTTON = 'Adicionar'; // GENERAL.INSERT
const TOTAL_REQUIRED = 'El total debe ser mayor a 0'; // EXPENSES.FORM.TOTAL_REQUIRED
const NO_EXPENSE_FOUND = 'No existe ningún gasto en el día'; // EXPENSES.EMPTY_STATE

/**
 * Navigate to the today expenses page.
 */
async function navigateToExpenses(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/expenses/today');
  await expect(page.getByText(EXPENSES_HEADER)).toBeVisible();
}

/**
 * Opens the new expense modal and fills the form.
 */
async function createExpense(
  page: import('@playwright/test').Page,
  total: string,
  note: string,
): Promise<void> {
  // Click "Gasto" button to open the modal
  await page.getByRole('button', { name: EXPENSE_BUTTON }).click();

  // Wait for the modal to appear
  await expect(page.getByText(NEW_EXPENSE_TITLE)).toBeVisible();

  // Fill total
  await page.locator('#expense-form-total').fill(total);

  // Fill note
  await page.locator('textarea').fill(note);

  // Submit
  await page.getByRole('button', { name: INSERT_BUTTON }).click();

  // Wait for modal to close
  await expect(page.getByText(NEW_EXPENSE_TITLE)).toHaveCount(0);
}

test.describe.serial('S2-E1 — Registrar gasto', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('registrar un gasto aparece en la lista', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await navigateToExpenses(page);

    // Verify empty state first
    await expect(page.getByText(NO_EXPENSE_FOUND)).toBeVisible();

    // Create an expense
    await createExpense(page, '50', 'E2E test expense');

    // The expense should appear in the list (type + amount)
    await expect(page.getByText('$50.00')).toBeVisible();

    // The empty state should be gone
    await expect(page.getByText(NO_EXPENSE_FOUND)).toHaveCount(0);
  });

  test('gasto sin monto muestra error de validación', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await navigateToExpenses(page);

    // Open the modal
    await page.getByRole('button', { name: EXPENSE_BUTTON }).click();
    await expect(page.getByText(NEW_EXPENSE_TITLE)).toBeVisible();

    // Leave total empty, fill note
    await page.locator('textarea').fill('No total expense');

    // Submit without filling total
    await page.getByRole('button', { name: INSERT_BUTTON }).click();

    // Validation error should appear
    await expect(page.getByText(TOTAL_REQUIRED)).toBeVisible();

    // Modal should still be open
    await expect(page.getByText(NEW_EXPENSE_TITLE)).toBeVisible();
  });

  test('la operación funciona correctamente en modo offline', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await navigateToExpenses(page);

    // Go offline
    await page.context().setOffline(true);

    // Create an expense offline
    await createExpense(page, '25', 'Offline expense');

    // The expense should appear even offline (check amount)
    await expect(page.getByText('$25.00')).toBeVisible();

    await page.context().setOffline(false);
  });
});
