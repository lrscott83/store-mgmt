import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * [S4-A1/A2/A3] Gastos: editar, eliminar, historial — E2E Playwright
 * docs/testing/e2e-stage-4/S4-A1.md, S4-A2.md, S4-A3.md
 *
 * Tests expense edit/delete on today's expenses page, and the
 * history page grouped by day.
 *
 * Uses `owner-admin-with-products` persona.
 */

const EXPENSES_HEADER = 'Gastos del día';
const NEW_EXPENSE_TITLE = 'Adicionar Gasto';
const EDIT_EXPENSE_TITLE = 'Editar Gastos';
const EXPENSE_BUTTON = 'Gasto';
const INSERT_BUTTON = 'Adicionar';
const HISTORY_HEADER = 'Historial de Gastos';
const DELETE_CONFIRM = '¿Está seguro que desea eliminar este gasto?';

async function createExpense(page: Page, total: string, note: string): Promise<void> {
  await page.goto('/expenses/today');
  await expect(page.getByText(EXPENSES_HEADER)).toBeVisible();
  await page.getByRole('button', { name: EXPENSE_BUTTON }).click();
  await expect(page.getByText(NEW_EXPENSE_TITLE)).toBeVisible();
  await page.locator('#expense-form-total').fill(total);
  await page.locator('textarea').fill(note);
  await page.getByRole('button', { name: INSERT_BUTTON }).click();
  await expect(page.getByText(NEW_EXPENSE_TITLE)).toHaveCount(0);
}

test.describe.serial('S4-A1/A2/A3 — Gastos: editar, eliminar, historial', () => {
  test.describe.configure({ timeout: 180_000 });

  test.use({ persona: 'owner-admin-with-products' });

  // S4-A1 — Editar gasto
  test('S4-A1: editar un gasto cambia el monto', async ({ signedInPage }) => {
    const { page } = signedInPage;

    // Create an expense first
    await createExpense(page, '50', 'E2E to edit');

    // Find the expense gear menu
    const gearToggle = page.locator('[data-testid^="expense-actions-toggle-"]').first();
    await expect(gearToggle).toBeVisible();
    await gearToggle.click();

    // Click Editar
    await page.getByRole('menuitem', { name: 'Editar' }).click();

    // Edit modal should open
    await expect(page.getByText(EDIT_EXPENSE_TITLE)).toBeVisible();

    // Change the total
    await page.locator('#expense-form-total').clear();
    await page.locator('#expense-form-total').fill('75');

    // Save
    await page.getByRole('button', { name: 'Actualizar' }).click();

    // Modal should close
    await expect(page.getByText(EDIT_EXPENSE_TITLE)).toHaveCount(0);

    // The updated amount should be visible
    await expect(page.getByText('$75.00')).toBeVisible();
  });

  // S4-A2 — Eliminar gasto
  test('S4-A2: eliminar un gasto lo remueve de la lista', async ({ signedInPage }) => {
    const { page } = signedInPage;

    // Create an expense first
    await createExpense(page, '30', 'E2E to delete');

    // Find the expense gear menu
    const gearToggle = page.locator('[data-testid^="expense-actions-toggle-"]').first();
    await expect(gearToggle).toBeVisible();
    await gearToggle.click();

    // Click Eliminar
    await page.getByRole('menuitem', { name: 'Eliminar' }).click();

    // Confirm dialog
    await expect(page.getByText(DELETE_CONFIRM)).toBeVisible();
    await page.getByRole('button', { name: 'Si' }).click();

    // The expense should be removed — empty state
    await expect(page.getByText('No existe ningún gasto en el día')).toBeVisible();
  });

  // S4-A3 — Historial agrupado por día
  test('S4-A3: historial muestra gastos agrupados por día', async ({ signedInPage }) => {
    const { page } = signedInPage;

    // Create an expense first
    await createExpense(page, '40', 'E2E history test');

    // Navigate to history
    await page.goto('/expenses/expenses');
    await expect(page.getByText(HISTORY_HEADER)).toBeVisible();

    // A day panel should be visible
    const dayToggle = page.locator('[data-testid^="expense-day-panel-toggle-"]').first();
    await expect(dayToggle).toBeVisible();

    // Expand the day panel
    await dayToggle.click();
    await expect(dayToggle).toHaveAttribute('aria-expanded', 'true');
  });
});
