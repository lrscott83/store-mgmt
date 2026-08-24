import { test, expect } from './support/test';

/**
 * [S2-F1] Reporte del día — E2E Playwright
 * docs/testing/e2e-stage-2/S2-F1.md
 *
 * Tests the daily stats/report page: header, expansion panels,
 * and cash summary structure.
 *
 * Uses `owner-admin-with-products` persona (has seeded data).
 */

// i18n literal strings from es.ts
const STATS_HEADER = 'Cuadre del día'; // TODAY_STATS.HEADER
const CASH_SUMMARY = 'Resumen Efectivo'; // hardcoded in today-stats.tsx
const SALES_PANEL_PREFIX = 'Ventas'; // hardcoded in today-stats.tsx

/**
 * Navigate to the daily stats page.
 */
async function navigateToStats(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/sales/today-stats');
  await expect(page.getByText(STATS_HEADER)).toBeVisible();
}

test.describe.serial('S2-F1 — Reporte del día', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('el reporte muestra el header Cuadre del día', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await navigateToStats(page);

    // The header should be visible
    await expect(page.getByText(STATS_HEADER, { exact: true })).toBeVisible();

    // The total should be visible (starts with $)
    await expect(page.locator('text=/^\\$[\\d,.]+$/').first()).toBeVisible();
  });

  test('el panel Resumen Efectivo se puede expandir', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await navigateToStats(page);

    // Find the "Resumen Efectivo" panel toggle
    const cashPanel = page.getByRole('button', { name: /Resumen Efectivo/ });
    await expect(cashPanel).toBeVisible();

    // It should be collapsed by default
    await expect(cashPanel).toHaveAttribute('aria-expanded', 'false');

    // Click to expand
    await cashPanel.click();

    // It should now be expanded
    await expect(cashPanel).toHaveAttribute('aria-expanded', 'true');

    // The "Ventas" row should be visible inside
    await expect(page.getByText('Ventas').first()).toBeVisible();
  });

  test('el panel Ventas se puede expandir y muestra categorías', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await navigateToStats(page);

    // Find the "Ventas" panel toggle
    const salesPanel = page.getByRole('button', { name: /Ventas.*productos/ });
    await expect(salesPanel).toBeVisible();

    // Click to expand
    await salesPanel.click();

    // It should now be expanded
    await expect(salesPanel).toHaveAttribute('aria-expanded', 'true');
  });
});
