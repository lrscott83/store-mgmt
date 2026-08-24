import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * [S2-D1] Entradas de inventario — E2E Playwright
 * docs/testing/e2e-stage-2/S2-D1.md
 *
 * Tests the inventory entry UI: create an entry, validation errors,
 * and offline mode.
 *
 * Uses `owner-admin-with-products` persona (has seeded products).
 */

// i18n literal strings from es.ts
const ENTRIES_HEADER = 'Entradas del día'; // INVENTORY.TODAY_ENTRIES.TITLE
const NEW_ENTRY_TITLE = 'Adicionar Entrada'; // INVENTORY_ENTRY.NEW_INVENTORY_ENTRY
const PRODUCT_LABEL = 'Producto'; // INVENTORY.ENTRY.PRODUCT
const ENTRY_BUTTON = 'Entrada'; // GENERAL.ENTRY
const INSERT_BUTTON = 'Adicionar'; // GENERAL.INSERT

/**
 * Navigate to the inventory entries page.
 */
async function navigateToEntries(page: Page): Promise<void> {
  await page.goto('/inventory/today-entries');
  await expect(page.getByText(ENTRIES_HEADER)).toBeVisible();
}

/**
 * Opens the new entry modal and fills the form.
 */
async function createEntry(page: Page, productName: string, quantity: string, costPrice: string): Promise<void> {
  // Click "Entrada" button to open the modal
  await page.getByRole('button', { name: ENTRY_BUTTON }).click();

  // Wait for the modal to appear
  await expect(page.getByText(NEW_ENTRY_TITLE)).toBeVisible();

  // Type in the product combobox to filter
  const productInput = page.getByRole('combobox', { name: PRODUCT_LABEL });
  await expect(productInput).toBeVisible();
  await productInput.fill(productName);

  // Select the first matching product from the dropdown
  const option = page.locator('[role="option"]').first();
  await expect(option).toBeVisible();
  await option.click();

  // Fill quantity
  await page.locator('#entry-quantity').fill(quantity);

  // Fill cost price
  await page.locator('#entry-cost-price').fill(costPrice);

  // Submit
  await page.getByRole('button', { name: INSERT_BUTTON }).click();

  // Wait for modal to close
  await expect(page.getByText(NEW_ENTRY_TITLE)).toHaveCount(0);
}

test.describe.serial('S2-D1 — Entradas de inventario', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('registrar una entrada de stock aparece en la lista', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await navigateToEntries(page);

    // Create an entry
    await createEntry(page, 'E2E Product', '10', '5');

    // The entry should appear in the list with the product name
    await expect(page.getByText('E2E Product')).toBeVisible();
  });

  test('sin producto seleccionado muestra error de validación', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await navigateToEntries(page);

    // Open the modal
    await page.getByRole('button', { name: ENTRY_BUTTON }).click();
    await expect(page.getByText(NEW_ENTRY_TITLE)).toBeVisible();

    // Don't select a product, just fill quantity and cost
    await page.locator('#entry-quantity').fill('5');
    await page.locator('#entry-cost-price').fill('3');

    // Submit without selecting a product
    await page.getByRole('button', { name: INSERT_BUTTON }).click();

    // Validation error should appear
    await expect(page.getByText('Producto es requerido')).toBeVisible();

    // Modal should still be open
    await expect(page.getByText(NEW_ENTRY_TITLE)).toBeVisible();
  });

  test('la operación funciona correctamente en modo offline', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await navigateToEntries(page);

    // Go offline
    await page.context().setOffline(true);

    // Create an entry offline
    await createEntry(page, 'E2E Product', '5', '3');

    // The entry should appear even offline
    await expect(page.getByText('E2E Product')).toBeVisible();

    await page.context().setOffline(false);
  });
});
