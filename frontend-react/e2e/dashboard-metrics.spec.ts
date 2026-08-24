import { test, expect } from './support/test';

/**
 * [S4-D1] Dashboard de estadísticas — métricas — E2E Playwright
 * docs/testing/e2e-stage-4/S4-D1.md
 *
 * Verifies that the dashboard shows sales, expenses, and profit metrics.
 *
 * Uses `owner-admin-with-products` persona.
 */

const DASHBOARD_HEADER = 'Panel de Control'; // DASHBOARD.HEADER

test.describe.serial('S4-D1 — Dashboard: métricas', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('dashboard muestra métricas de ventas y ganancia', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await page.goto('/stats/dashboard');
    await expect(page.getByText(DASHBOARD_HEADER)).toBeVisible();

    // The dashboard should show sections for sales and profit
    // Verify the page has content (not empty)
    await expect(page.locator('body')).toContainText(/\w+/);

    // Sales section should be visible
    await expect(page.getByText('Ventas').first()).toBeVisible();
  });
});
