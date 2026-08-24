import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * [S2-A1] CRUD offline de productos — E2E Playwright
 * docs/testing/e2e-stage-2/S2-A1.md
 *
 * Tests the product catalog UI: create, edit, deactivate (soft-delete),
 * validation, offline mode, and persistence.
 *
 * Uses `owner-admin-with-products` persona (zero extra logins — derived
 * from cached owner-admin session with seeded category + product).
 *
 * IMPORTANT: Each test restores the pre-sale snapshot, so products created
 * in test N are NOT visible in test N+1. Tests that need a product create
 * one inline before operating on it.
 */

// i18n literal strings from es.ts — hardcoded, never imported (design.md §5)
const PRODUCTS_HEADER = 'Productos'; // PRODUCT.PRODUCTS
const PRODUCT_NAME_REQUIRED = 'Nombre es requerido'; // GENERAL.VALIDATION.REQUIRED with PRODUCTS.FORM.NAME
const DEACTIVATE_CONFIRM = '¿Está seguro que desea desactivar este producto?';

/**
 * Opens the category gear menu and clicks "Producto" to add a new product.
 */
async function openCreateProductModal(page: Page): Promise<void> {
  const gearToggle = page.locator('[data-testid^="category-actions-toggle-"]').first();
  await expect(gearToggle).toBeVisible();
  await gearToggle.click();

  const addProductBtn = page.getByTestId('add-product-button');
  await expect(addProductBtn).toBeVisible();
  await addProductBtn.click();

  await expect(page.getByTestId('product-name-input')).toBeVisible();
}

/**
 * Fills the create product form and submits.
 */
async function createProduct(page: Page, name: string, price: string): Promise<void> {
  await page.getByTestId('product-name-input').fill(name);
  await page.getByTestId('product-price-input').fill(price);
  await page.getByTestId('create-product-submit').click();
  // Wait for modal to close
  await expect(page.getByTestId('product-name-input')).toHaveCount(0);
}

/**
 * Opens a product's gear menu by finding the gear button in the same row.
 * Uses the ActionMenu default label "Acciones".
 */
async function openProductGear(page: Page, productName: string): Promise<void> {
  // The product row is an <li> with the product name text
  const productRow = page.locator('li').filter({ hasText: productName });
  const gearButton = productRow.locator('button[aria-label="Acciones"]');
  await expect(gearButton).toBeVisible();
  await gearButton.click();
}

/**
 * Navigate to products page and expand first category.
 */
async function navigateToProducts(page: Page): Promise<void> {
  await page.goto('/sales/products');
  await expect(page.getByText(PRODUCTS_HEADER, { exact: true })).toBeVisible();

  const categoryToggle = page.locator('[data-testid^="category-panel-toggle-"]').first();
  await expect(categoryToggle).toBeVisible();
  await categoryToggle.click();
}

test.describe.serial('S2-A1 — CRUD offline de productos', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('crear un producto nuevo aparece en la lista', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await navigateToProducts(page);

    await openCreateProductModal(page);
    await createProduct(page, 'E2E New Product', '25');

    // Verify the product appears in the list
    await expect(page.getByText('E2E New Product')).toBeVisible();
  });

  test('editar un producto modifica nombre y precio', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await navigateToProducts(page);

    // Create a product to edit
    await openCreateProductModal(page);
    await createProduct(page, 'E2E To Edit', '20');

    // Open the product's gear menu
    await openProductGear(page, 'E2E To Edit');
    await page.getByText('Editar producto').click();

    // Wait for edit modal
    await expect(page.getByTestId('edit-product-name-input')).toBeVisible();

    // Modify name and price
    await page.getByTestId('edit-product-name-input').clear();
    await page.getByTestId('edit-product-name-input').fill('E2E Edited Product');
    await page.getByTestId('edit-product-price-input').clear();
    await page.getByTestId('edit-product-price-input').fill('35');
    await page.getByTestId('edit-product-submit').click();

    // Modal should close and edited name should appear
    await expect(page.getByTestId('edit-product-name-input')).toHaveCount(0);
    await expect(page.getByText('E2E Edited Product')).toBeVisible();
  });

  test('desactivar un producto lo marca como inactivo', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await navigateToProducts(page);

    // Create a product to deactivate
    await openCreateProductModal(page);
    await createProduct(page, 'E2E To Deactivate', '30');

    // Open the product's gear menu and deactivate
    await openProductGear(page, 'E2E To Deactivate');
    await page.getByText('Desactivar Producto').click();

    // Confirm the deactivation
    await expect(page.getByText(DEACTIVATE_CONFIRM)).toBeVisible();
    await page.getByRole('button', { name: 'Si' }).click();

    // The product should show the "Inactivo" badge
    await expect(page.getByTestId('inactive-badge').first()).toBeVisible();
  });

  test('crear producto sin nombre muestra error de validación', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await navigateToProducts(page);
    await openCreateProductModal(page);

    // Fill only price, leave name empty
    await page.getByTestId('product-price-input').fill('10');
    await page.getByTestId('create-product-submit').click();

    // Validation error should appear
    await expect(page.getByText(PRODUCT_NAME_REQUIRED)).toBeVisible();
    await expect(page.getByTestId('product-name-input')).toBeVisible();
  });

  test('la operación funciona correctamente en modo offline', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await navigateToProducts(page);

    // Go offline
    await page.context().setOffline(true);

    // Create a product offline
    await openCreateProductModal(page);
    await createProduct(page, 'E2E Offline Product', '15');

    // The product should appear even offline
    await expect(page.getByText('E2E Offline Product')).toBeVisible();

    await page.context().setOffline(false);
  });

  test('los datos persisten tras recargar', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await navigateToProducts(page);

    // Create a product
    await openCreateProductModal(page);
    await createProduct(page, 'E2E Persistent Product', '40');

    // Verify it's there
    await expect(page.getByText('E2E Persistent Product')).toBeVisible();

    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Re-expand the category
    const categoryToggle = page.locator('[data-testid^="category-panel-toggle-"]').first();
    await expect(categoryToggle).toBeVisible();
    await categoryToggle.click();

    // The product should still be there
    await expect(page.getByText('E2E Persistent Product')).toBeVisible();
  });
});
