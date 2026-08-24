import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * [S2-A2] CRUD offline de categorías — E2E Playwright
 * docs/testing/e2e-stage-2/S2-A2.md
 *
 * Tests the category management UI: create, edit, validation,
 * offline mode, and persistence.
 *
 * Uses `owner-admin-with-products` persona (has a seeded category
 * and product from the fixture).
 *
 * IMPORTANT: Each test restores the pre-snapshot, so categories created
 * in test N are NOT visible in test N+1. Tests that need a category
 * create one inline before operating on it.
 */

// i18n literal strings from es.ts — hardcoded, never imported
const PRODUCTS_HEADER = 'Productos'; // PRODUCT.PRODUCTS
const CATEGORY_NAME_REQUIRED = 'Nombre es requerido'; // GENERAL.VALIDATION.REQUIRED with PRODUCTS.FORM.NAME

/**
 * Creates a new category via the "Categoría" button in the page header.
 */
async function createCategory(page: Page, name: string): Promise<void> {
  await page.getByTestId('add-category-button').click();

  // Wait for the modal to appear
  await expect(page.getByTestId('category-name-input')).toBeVisible();

  await page.getByTestId('category-name-input').fill(name);
  await page.getByTestId('category-save-button').click();

  // Wait for modal to close
  await expect(page.getByTestId('category-name-input')).toHaveCount(0);
}

/**
 * Opens the category gear menu by finding the gear trigger for a category.
 */
async function openCategoryGear(page: Page, categoryTestId: string): Promise<void> {
  const gearToggle = page.getByTestId(categoryTestId);
  await expect(gearToggle).toBeVisible();
  await gearToggle.click();
}

/**
 * Navigate to products page.
 */
async function navigateToProducts(page: Page): Promise<void> {
  await page.goto('/sales/products');
  await expect(page.getByText(PRODUCTS_HEADER, { exact: true })).toBeVisible();
}

test.describe.serial('S2-A2 — CRUD offline de categorías', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('crear una categoría nueva aparece en la lista', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await navigateToProducts(page);
    await createCategory(page, 'E2E New Category');

    // The category should appear in the list
    await expect(page.getByText('E2E New Category')).toBeVisible();
  });

  test('editar una categoría modifica el nombre', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await navigateToProducts(page);

    // Create a category to edit
    await createCategory(page, 'E2E To Edit');

    // Find the category's gear menu (it should be the one NOT for the seeded category)
    const categories = page.locator('[data-testid^="category-actions-toggle-"]');
    const count = await categories.count();

    // The last category gear menu should be our new one (created last)
    const gearToggle = categories.nth(count - 1);
    await expect(gearToggle).toBeVisible();
    await gearToggle.click();

    // Click "Categoría" to edit
    const editBtn = page.getByTestId('edit-category-button');
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    // Wait for the modal to appear with the category name
    await expect(page.getByTestId('category-name-input')).toBeVisible();

    // Modify the name
    await page.getByTestId('category-name-input').clear();
    await page.getByTestId('category-name-input').fill('E2E Edited Category');
    await page.getByTestId('category-save-button').click();

    // Wait for modal to close
    await expect(page.getByTestId('category-name-input')).toHaveCount(0);

    // The edited name should appear
    await expect(page.getByText('E2E Edited Category')).toBeVisible();
  });

  test('crear categoría sin nombre muestra error de validación', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await navigateToProducts(page);

    // Open the create category modal
    await page.getByTestId('add-category-button').click();
    await expect(page.getByTestId('category-name-input')).toBeVisible();

    // Leave name empty, try to save
    await page.getByTestId('category-save-button').click();

    // Validation error should appear
    await expect(page.getByText(CATEGORY_NAME_REQUIRED)).toBeVisible();

    // Modal should still be open
    await expect(page.getByTestId('category-name-input')).toBeVisible();
  });

  test('la operación funciona correctamente en modo offline', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await navigateToProducts(page);

    // Go offline
    await page.context().setOffline(true);

    // Create a category offline
    await createCategory(page, 'E2E Offline Category');

    // The category should appear even offline
    await expect(page.getByText('E2E Offline Category')).toBeVisible();

    await page.context().setOffline(false);
  });

  test('los datos persisten tras recargar', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await navigateToProducts(page);

    // Create a category
    await createCategory(page, 'E2E Persistent Category');

    // Verify it's there
    await expect(page.getByText('E2E Persistent Category')).toBeVisible();

    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // The category should still be there (no expansion needed — categories are visible by default)
    await expect(page.getByText('E2E Persistent Category')).toBeVisible();
  });
});
