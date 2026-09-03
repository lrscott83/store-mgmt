/**
 * Regression test for CSV re-import behavior (2026-09-02 row-level import rule).
 *
 * Previously this spec guarded the OLD duplicate-detection behavior: importing the
 * same CSV twice would flag every already-seen product as a duplicate failure and
 * raise a "ya existen" dialog. That behavior was retired by the 2026-09-02 row-level
 * import rule (`5fef302f`): product uniqueness is now category + name (case-insensitive)
 * with NO duplicate failures — a repeated row REUSES the existing product's id, updates
 * its sale price to the row's value, and adds an inventory entry (per row, created or
 * reused) against that product. The "ya existen" dialog no longer exists.
 *
 * This spec now verifies the CURRENT contract on re-import of the same CSV:
 *   1. the second import still reports success (same toast), no "ya existen" dialog;
 *   2. products are reused (still exactly one row each, never duplicated in the list);
 *   3. the reused product's sale price updates to the re-imported row's value;
 *   4. every repeated row adds an inventory entry (covered by the toast's entry count).
 */

import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';

const CSV_DIR = path.join(process.cwd(), 'test-results');

/** `showToastSuccess` literal in products.tsx (handleCsvImport), hardcoded Spanish. */
function successToast(products: number, entries: number): string {
  return `Importados ${products} productos y ${entries} entradas correctamente.`;
}

async function createCsvFile(name: string, content: string): Promise<string> {
  const filePath = path.join(CSV_DIR, name);
  await fs.mkdir(CSV_DIR, { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Wipe the per-store offline business-entity keys for EVERY store, so the test
 * starts from a clean product/category/inventory slate regardless of residual
 * state from a prior run on the same worker (e.g. Playwright `--repeat-each`).
 * Deliberately leaves `AUTH_MODEL`, `currentUser`, `token`, the DEK, and the
 * roster untouched — the signed-in session survives.
 */
async function clearOfflineStoreState(page: Page): Promise<void> {
  await page.evaluate(() => {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('lizoft.store-')) doomed.push(key);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  });
}

/**
 * Import the given CSV via the UI and wait for the modal to close. Returns the
 * success toast text, which carries the products/entries counts to assert on.
 */
async function importCsvAndGetToast(page: Page, filePath: string): Promise<string | null> {
  await page.goto('/sales/products');
  await page.getByText('Productos', { exact: true }).waitFor();
  await page.getByTestId('import-csv-button').click();
  await page.getByRole('heading', { name: 'Importar Productos' }).waitFor();
  await page.locator('[data-testid="csv-file-input"]').setInputFiles(filePath);
  await page.getByTestId('csv-import-button').click();
  await page.getByRole('heading', { name: 'Importar Productos' }).waitFor({ state: 'detached' });

  // The old "ya existen" duplicate dialog no longer exists; only the toast fires.
  const toast = page.getByText(/^Importados .+ productos y .+ entradas correctamente\.$/);
  await expect(toast).toBeVisible();
  return (await toast.textContent())?.trim() ?? null;
}

test.describe.serial('CSV re-import reuses products (2026-09-02 row-level rule)', () => {
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

  test('second import reuses products, updates prices, adds entries, no duplicate dialog', async ({ signedInPage }) => {
    const { page } = signedInPage;

    // Start from a clean offline slate (products/categories/inventory for every
    // store), keeping the signed-in session intact — makes the first import
    // deterministic even when a prior run on the same worker left residual state.
    await clearOfflineStoreState(page);

    // === FIRST IMPORT: all 3 rows create products + 3 inventory entries ===
    const csv1 = await createCsvFile('reimport_first.csv', csvContent);
    const toast1 = await importCsvAndGetToast(page, csv1);
    expect(toast1).toBe(successToast(3, 3)); // 3 products created, 3 entries

    // Both categories exist with one toggle each. (After an import the modal
    // closes and the toast fires BEFORE `loadData()` repaints the panels, so the
    // toggle assertions use a longer timeout to absorb that async repaint.)
    const toggles = page.locator('[data-testid^="category-panel-toggle-"]');
    await expect(toggles.filter({ hasText: catP })).toHaveCount(1, { timeout: 15_000 });
    await expect(toggles.filter({ hasText: catC })).toHaveCount(1, { timeout: 15_000 });

    // Products under Pizzas, priced as imported.
    await toggles.filter({ hasText: catP }).click();
    await expect(page.getByText('PizzaA')).toBeVisible();
    await expect(page.getByText('$150')).toBeVisible();
    await expect(page.getByText('PizzaB')).toBeVisible();
    await expect(page.getByText('$200')).toBeVisible();

    // Product under Confituras.
    await toggles.filter({ hasText: catC }).click();
    await expect(page.getByText('Caramel')).toBeVisible();

    // === SECOND IMPORT: different prices on the same rows → products are REUSED,
    //     not duplicated, their prices update to the new values, and each row
    //     adds an inventory entry. No "ya existen" dialog fires (rule retired). ===
    const csv2 = await createCsvFile(
      'reimport_second.csv',
      [
        'category,name,price,cost,quantity',
        `${catP},PizzaA,160,110,7`,
        `${catP},PizzaB,190,150,9`,
        `${catC},Caramel,25,18,3`,
      ].join('\n'),
    );
    const toast2 = await importCsvAndGetToast(page, csv2);
    // 3 rows processed (all reused), 3 inventory entries added — same toast wording.
    expect(toast2).toBe(successToast(3, 3));

    // No duplicate dialog: the OK button never existed under the new rule. (The
    // toast above already implies the modal closed normally; keep the rows reset.)
    await toggles.filter({ hasText: catP }).click();

    // Products are NOT duplicated: still exactly one row per product, never a list
    // entry per import. (Playwright auto-waits/retries on the count assertion.)
    await expect(page.getByText('PizzaA')).toHaveCount(1);
    await expect(page.getByText('PizzaB')).toHaveCount(1);

    // Reused products' prices updated to the second import's values.
    await expect(page.getByText('$160')).toBeVisible();
    await expect(page.getByText('$190')).toBeVisible();

    await toggles.filter({ hasText: catC }).click();
    await expect(page.getByText('Caramel')).toHaveCount(1);
    await expect(page.getByText('$25')).toBeVisible();
  });
});