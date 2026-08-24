import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';

/**
 * [S2-A3] Importación CSV de productos — E2E Playwright
 * docs/testing/e2e-stage-2/S2-A3.md
 *
 * Tests the CSV product import UI: file upload, validation, and offline mode.
 *
 * Uses `owner-admin-with-products` persona (has seeded category).
 */

// i18n literal strings from es.ts
const PRODUCTS_HEADER = 'Productos'; // PRODUCT.PRODUCTS
const IMPORT_TITLE = 'Importar Productos'; // PRODUCT_CATEGORY.IMPORT_PRODUCTS
const FILE_REQUIRED = 'Fichero es requerido'; // GENERAL.VALIDATION.REQUIRED with GENERAL.FILE

const CSV_DIR = path.join(process.cwd(), 'test-results');

/**
 * Creates a valid CSV file and returns its path.
 */
async function createCsvFile(
  name: string,
  rows: string,
): Promise<string> {
  const filePath = path.join(CSV_DIR, name);
  await fs.mkdir(CSV_DIR, { recursive: true });
  await fs.writeFile(filePath, rows, 'utf-8');
  return filePath;
}

/**
 * Navigate to products page and open the CSV import modal.
 */
async function openCsvImportModal(page: Page): Promise<void> {
  await page.goto('/sales/products');
  await expect(page.getByText(PRODUCTS_HEADER, { exact: true })).toBeVisible();

  await page.getByTestId('import-csv-button').click();
  await expect(page.getByRole('heading', { name: IMPORT_TITLE })).toBeVisible();
}

test.describe.serial('S2-A3 — Importación CSV de productos', () => {
  test.describe.configure({ timeout: 180_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('seleccionar un CSV válido importa los productos', async ({ signedInPage }) => {
    const { page } = signedInPage;

    // Create a valid CSV file
    const csvPath = await createCsvFile(
      'valid-import.csv',
      'category,name,price,cost,quantity\nTestCategory,CSV Product A,100,80,10\nTestCategory,CSV Product B,200,150,5',
    );

    await openCsvImportModal(page);

    // Upload the CSV file
    await page.locator('[data-testid="csv-file-input"]').setInputFiles(csvPath);

    // Click Importar
    await page.getByTestId('csv-import-button').click();

    // Wait for modal to close (heading disappears)
    await expect(page.getByRole('heading', { name: IMPORT_TITLE })).toHaveCount(0);

    // The new category from the CSV should appear in the accordion
    await expect(page.getByText('TestCategory')).toBeVisible();
  });

  test('sin archivo seleccionado muestra error', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await openCsvImportModal(page);

    // Click Importar without selecting a file
    await page.getByTestId('csv-import-button').click();

    // Error should appear
    await expect(page.getByText(FILE_REQUIRED)).toBeVisible();

    // Modal should still be open
    await expect(page.getByRole('heading', { name: IMPORT_TITLE })).toBeVisible();
  });

  test('la operación funciona correctamente en modo offline', async ({ signedInPage }) => {
    const { page } = signedInPage;

    const csvPath = await createCsvFile(
      'offline-import.csv',
      'category,name,price,cost,quantity\nTestCategory,Offline CSV,50,30,20',
    );

    await openCsvImportModal(page);

    // Go offline
    await page.context().setOffline(true);

    // Upload and import offline
    await page.locator('[data-testid="csv-file-input"]').setInputFiles(csvPath);
    await page.getByTestId('csv-import-button').click();

    // Wait for modal to close
    await expect(page.getByRole('heading', { name: IMPORT_TITLE })).toHaveCount(0);

    // The new category from the CSV should appear even offline
    await expect(page.getByText('TestCategory')).toBeVisible();

    await page.context().setOffline(false);
  });
});
