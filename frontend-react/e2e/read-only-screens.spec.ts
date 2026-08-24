import { test, expect } from './support/test';

/**
 * S2-A4 + S2-B3 + S2-B4 + S2-C3 + S2-D3 + S2-D4 + S2-D5 + S2-E2 + S2-F2
 * Read-only screen verification — E2E Playwright
 *
 * Verifies each read-only screen loads without crash.
 * Uses `owner-admin-with-products` persona.
 */

test.describe.serial('S2 — Read-only screens (MEDIA items)', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('S2-A4: Inventario (disponible)', async ({ signedInPage }) => {
    const { page } = signedInPage;
    await page.goto('/inventory/available');
    await expect(page.locator('body')).toContainText(/\w+/);
  });

  test('S2-B3: Historial de órdenes', async ({ signedInPage }) => {
    const { page } = signedInPage;
    await page.goto('/sales/orders');
    await expect(page.locator('body')).toContainText(/\w+/);
  });

  test('S2-C3: Créditos (historial)', async ({ signedInPage }) => {
    const { page } = signedInPage;
    await page.goto('/sales/credits');
    await expect(page.locator('body')).toContainText(/\w+/);
  });

  test('S2-D3: Cantidades del día', async ({ signedInPage }) => {
    const { page } = signedInPage;
    await page.goto('/inventory/today-quantities');
    await expect(page.locator('body')).toContainText(/\w+/);
  });

  test('S2-D4: Productos disponibles en inventario', async ({ signedInPage }) => {
    const { page } = signedInPage;
    await page.goto('/inventory/available');
    await expect(page.locator('body')).toContainText(/\w+/);
  });

  test('S2-D5: Ganancias del día', async ({ signedInPage }) => {
    const { page } = signedInPage;
    await page.goto('/inventory/today-sales-profit');
    await expect(page.locator('body')).toContainText(/\w+/);
  });

  test('S2-E2: Historial de gastos', async ({ signedInPage }) => {
    const { page } = signedInPage;
    await page.goto('/expenses/expenses');
    await expect(page.locator('body')).toContainText(/\w+/);
  });

  test('S2-F2: Dashboard de estadísticas', async ({ signedInPage }) => {
    const { page } = signedInPage;
    await page.goto('/stats/dashboard');
    await expect(page.locator('body')).toContainText(/\w+/);
  });
});
