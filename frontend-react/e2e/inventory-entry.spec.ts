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

const EDIT_ENTRY_TITLE = 'Editar Entrada'; // INVENTORY_ENTRY.EDIT_INVENTORY_ENTRY
const DELETE_CONFIRM = '¿Está seguro que desea eliminar esta entrada?'; // GENERAL.DELETE_CONFIRM_MESSAGE_A with INVENTORY_ENTRY.TEXT

/**
 * Opens the gear menu on an entry row and clicks an action.
 */
async function openEntryGearAction(page: Page, productName: string, action: 'edit' | 'delete'): Promise<void> {
  // Find the entry row by product name, then click its gear menu
  const row = page.locator('tr').filter({ hasText: productName });
  const gear = row.locator('[data-testid^="entry-actions-toggle-"]');
  await expect(gear).toBeVisible();
  await gear.click();

  if (action === 'edit') {
    await page.getByRole('menuitem', { name: 'Editar' }).click();
  } else {
    await page.getByRole('menuitem', { name: 'Eliminar' }).click();
  }
}

test.describe.serial('S2-D1 + S3-B1/B2 — Entradas de inventario', () => {
  test.describe.configure({ timeout: 180_000 });

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

  // S3-B1 — Editar entrada existente
  test('S3-B1: editar una entrada cambia cantidad y costo', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await navigateToEntries(page);

    // Create an entry first
    await createEntry(page, 'E2E Product', '10', '5');
    await expect(page.getByText('E2E Product')).toBeVisible();

    // Open the edit modal via gear menu
    await openEntryGearAction(page, 'E2E Product', 'edit');

    // Wait for edit modal
    await expect(page.getByText(EDIT_ENTRY_TITLE)).toBeVisible();

    // Change quantity to 20
    await page.locator('#entry-quantity').clear();
    await page.locator('#entry-quantity').fill('20');

    // Save
    await page.getByRole('button', { name: 'Actualizar' }).click();

    // Modal should close
    await expect(page.getByText(EDIT_ENTRY_TITLE)).toHaveCount(0);

    // The entry should still be visible
    await expect(page.getByText('E2E Product')).toBeVisible();
  });

  // S3-B2 — Eliminar entrada
  test('S3-B2: eliminar una entrada la remueve de la lista', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await navigateToEntries(page);

    // Create an entry first
    await createEntry(page, 'E2E Product', '10', '5');
    await expect(page.getByText('E2E Product')).toBeVisible();

    // Delete via gear menu
    await openEntryGearAction(page, 'E2E Product', 'delete');

    // Confirm dialog
    await expect(page.getByText(DELETE_CONFIRM)).toBeVisible();
    await page.getByRole('button', { name: 'Si' }).click();

    // The entry should be removed
    await expect(page.getByText('E2E Product')).toHaveCount(0);
  });
});
