/**
 * Regression test for CSV re-import duplicate detection.
 *
 * Bug: When importing the same sample CSV twice, the second import should
 * detect all products as duplicates. Root cause: ProductOfflineService
 * created two separate ProductCategoryRepository instances with independent
 * caches, so categories created via one were invisible to the other.
 *
 * Fix: Share a single ProductCategoryRepository instance between
 * productRepository and categoryRepository in ProductOfflineService.
 */

import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';

const CSV_DIR = path.join(process.cwd(), 'test-results');

async function createCsvFile(name: string, content: string): Promise<string> {
  const filePath = path.join(CSV_DIR, name);
  await fs.mkdir(CSV_DIR, { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

async function importCsvAndWait(page: Page, filePath: string): Promise<boolean> {
  // Returns true if duplicate dialog appeared
  await page.goto('/sales/products');
  await page.getByText('Productos', { exact: true }).waitFor();
  await page.getByTestId('import-csv-button').click();
  await page.getByRole('heading', { name: 'Importar Productos' }).waitFor();
  await page.locator('[data-testid="csv-file-input"]').setInputFiles(filePath);
  await page.getByTestId('csv-import-button').click();
  await page.getByRole('heading', { name: 'Importar Productos' }).waitFor({ state: 'detached' });

  const okButton = page.getByRole('button', { name: 'OK' });
  const hasDuplicates = await okButton.isVisible({ timeout: 3000 }).catch(() => false);
  if (hasDuplicates) {
    await okButton.click();
  }
  return hasDuplicates;
}

test.describe.serial('CSV re-import duplicate detection (S2-B2 regression)', () => {
  test.describe.configure({ timeout: 180_000 });
  test.use({ persona: 'owner-admin' });

  const catP = `Reimp${Date.now()}`;
  const catC = `ReimpC${Date.now()}`;

  const csvContent = [
    'category,name,price,cost,quantity',
    `${catP},PizzaA,150,100,10`,
    `${catP},PizzaB,200,140,5`,
    `${catC},Caramel,20,12,50`,
  ].join('\n');

  test('first import creates all 3 products, second import detects duplicates', async ({ signedInPage }) => {
    const { page } = signedInPage;

    // === FIRST IMPORT: all 3 should be created ===
    const csv1 = await createCsvFile('reimport_first.csv', csvContent);
    const hasDupes1 = await importCsvAndWait(page, csv1);
    expect(hasDupes1).toBe(false); // No duplicates on first import

    // Verify both categories exist with correct product counts
    const toggles = page.locator('[data-testid^="category-panel-toggle-"]');
    await expect(toggles.filter({ hasText: catP })).toHaveCount(1);
    await expect(toggles.filter({ hasText: catC })).toHaveCount(1);

    // Verify products under Pizzas
    await toggles.filter({ hasText: catP }).click();
    await expect(page.getByText('PizzaA')).toBeVisible();
    await expect(page.getByText('PizzaB')).toBeVisible();

    // Verify Caramelo under Confituras
    await toggles.filter({ hasText: catC }).click();
    await expect(page.getByText('Caramel')).toBeVisible();

    // === SECOND IMPORT: all 3 should be detected as duplicates ===
    const csv2 = await createCsvFile('reimport_second.csv', csvContent);
    const hasDupes2 = await importCsvAndWait(page, csv2);
    expect(hasDupes2).toBe(true); // Duplicates detected on second import

    // Products should still be visible after dismissing dialog
    await toggles.filter({ hasText: catC }).click();
    await expect(page.getByText('Caramel')).toBeVisible();
  });
});
