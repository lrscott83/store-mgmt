import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';

/**
 * CSV import with shared categories — regression test for the bug where
 * addProductCategoryByName() generated a new ID instead of reusing the
 * existing category ID when the name already existed.
 */

const CSV_DIR = path.join(process.cwd(), 'test-results');

async function createCsvFile(name: string, content: string): Promise<string> {
  const filePath = path.join(CSV_DIR, name);
  await fs.mkdir(CSV_DIR, { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

async function importCsvAndWait(page: Page, filePath: string): Promise<void> {
  await page.goto('/sales/products');
  await page.getByText('Productos', { exact: true }).waitFor();
  await page.getByTestId('import-csv-button').click();
  await page.getByRole('heading', { name: 'Importar Productos' }).waitFor();
  await page.locator('[data-testid="csv-file-input"]').setInputFiles(filePath);
  await page.getByTestId('csv-import-button').click();
  await page.getByRole('heading', { name: 'Importar Productos' }).waitFor({ state: 'detached' });
  // Dismiss info dialog if duplicates were detected
  const okButton = page.getByRole('button', { name: 'OK' });
  if (await okButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await okButton.click();
  }
}

test.describe.serial('CSV import shared categories regression', () => {
  test.describe.configure({ timeout: 180_000 });
  test.use({ persona: 'owner-admin' });

  test('3 products with the same category in one CSV import all succeed', async ({ signedInPage }) => {
    const { page } = signedInPage;
    // Use unique timestamp to avoid collision with prior test runs
    const cat = `RgCat${Date.now()}`
    const csv = await createCsvFile('reg_shared.csv',
      `category,name,price,cost,quantity\n${cat},ProductA,10,5,1\n${cat},ProductB,20,5,2\n${cat},ProductC,30,5,3`);
    await importCsvAndWait(page, csv);

    // Category should exist once (not duplicated)
    const panelToggles = page.locator('[data-testid^="category-panel-toggle-"]');
    const catPanels = panelToggles.filter({ hasText: cat });
    await expect(catPanels).toHaveCount(1);

    // Expand the category to reveal products
    await catPanels.first().click();

    // All 3 products should be visible
    await expect(page.getByText('ProductA')).toBeVisible();
    await expect(page.getByText('ProductB')).toBeVisible();
    await expect(page.getByText('ProductC')).toBeVisible();
  });

  test('adding another product to the same category via second import', async ({ signedInPage }) => {
    const { page } = signedInPage;
    const cat = `RgSeq${Date.now()}`;

    // First import creates the category with one product
    const csv1 = await createCsvFile('reg_seq_a.csv',
      `category,name,price,cost,quantity\n${cat},FirstItem,10,5,1`);
    await importCsvAndWait(page, csv1);

    // Second import adds another product to the same category
    const csv2 = await createCsvFile('reg_seq_b.csv',
      `category,name,price,cost,quantity\n${cat},SecondItem,20,5,2`);
    await importCsvAndWait(page, csv2);

    // Category exists once
    const panelToggles = page.locator('[data-testid^="category-panel-toggle-"]');
    const catPanels = panelToggles.filter({ hasText: cat });
    await expect(catPanels).toHaveCount(1);

    // Expand and verify both products
    await catPanels.first().click();
    await expect(page.getByText('FirstItem')).toBeVisible();
    await expect(page.getByText('SecondItem')).toBeVisible();
  });
});
