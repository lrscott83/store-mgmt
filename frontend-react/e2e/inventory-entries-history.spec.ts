import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * [S3-F1/F2] Historial de entradas — E2E Playwright
 * docs/testing/e2e-stage-3/S3-F1.md, S3-F2.md
 *
 * Tests the entries history page: entries grouped by day,
 * and expanding day panels.
 *
 * Uses `owner-admin-with-products` persona.
 */

const ENTRIES_HISTORY_HEADER = 'Historial de Entradas'; // INVENTORY.ENTRIES.TITLE
const NO_ENTRIES = 'No se encontró ninguna entrada'; // INVENTORY.NO_HISTORY_ENTRY_FOUND
const TODAY_ENTRIES_HEADER = 'Entradas del día';
const ENTRY_BUTTON = 'Entrada';
const NEW_ENTRY_TITLE = 'Adicionar Entrada';
const PRODUCT_LABEL = 'Producto';
const INSERT_BUTTON = 'Adicionar';

async function navigateToHistory(page: Page): Promise<void> {
  await page.goto('/inventory/entries');
  await expect(page.getByText(ENTRIES_HISTORY_HEADER)).toBeVisible();
}

async function createEntry(page: Page, productName: string): Promise<void> {
  await page.goto('/inventory/today-entries');
  await expect(page.getByText(TODAY_ENTRIES_HEADER)).toBeVisible();
  await page.getByRole('button', { name: ENTRY_BUTTON }).click();
  await expect(page.getByText(NEW_ENTRY_TITLE)).toBeVisible();
  const productInput = page.getByRole('combobox', { name: PRODUCT_LABEL });
  await expect(productInput).toBeVisible();
  await productInput.fill(productName);
  const option = page.locator('[role="option"]').first();
  await expect(option).toBeVisible();
  await option.click();
  await page.locator('#entry-quantity').fill('10');
  await page.locator('#entry-cost-price').fill('5');
  await page.getByRole('button', { name: INSERT_BUTTON }).click();
  await expect(page.getByText(NEW_ENTRY_TITLE)).toHaveCount(0);
}

test.describe.serial('S3-F1/F2 — Historial de entradas', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('S3-F2: sin entradas muestra empty state', async ({ signedInPage }) => {
    const { page } = signedInPage;
    await navigateToHistory(page);
    await expect(page.getByText(NO_ENTRIES)).toBeVisible();
  });

  test('S3-F1: entradas aparecen agrupadas por día', async ({ signedInPage }) => {
    const { page } = signedInPage;

    // Create an entry first
    await createEntry(page, 'E2E Product');

    // Navigate to history
    await navigateToHistory(page);

    // A day panel should be visible (today's date)
    const dayToggle = page.locator('[data-testid^="entry-day-panel-toggle-"]').first();
    await expect(dayToggle).toBeVisible();

    // Expand the day panel
    await dayToggle.click();
    await expect(dayToggle).toHaveAttribute('aria-expanded', 'true');

    // The entry should be visible inside
    await expect(page.getByText('E2E Product')).toBeVisible();
  });
});
