import { test, expect } from './support/test';

/**
 * [S2-D2] Egreso de inventario (Salida: merma / ajuste / otro) — E2E Playwright
 * docs/testing/e2e-stage-2/S2-D2.md
 *
 * Salida records stock outflows that are NOT sales. The order type selector offers only
 * Merma, Ajuste and Otro (owner decision, 2026-10-27); Normal and Mayorista were removed
 * because the normal sale lives in /sales/new and the wholesale sale in /sales/wholesale.
 *
 * Uses `owner-admin-with-products` persona.
 */

const EGRESS_HEADER = 'Salida'; // INVENTORY_EGRESS.HEADER

test.describe.serial('S2-D2 — Egreso de inventario', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('la página de egresos carga con selector de tipo Merma', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await page.goto('/inventory/egress');
    await expect(page.getByText(EGRESS_HEADER)).toBeVisible();

    // The order type selector should be visible with "Tipo" label
    const typeSelector = page.getByRole('combobox', { name: 'Tipo' });
    await expect(typeSelector).toBeVisible();

    // Default should be Merma (OrderType.Merma = 3)
    await expect(typeSelector).toHaveValue('3');

    // Only the stock-outflow kinds are offered
    for (const label of ['Merma', 'Ajuste', 'Otro']) {
      await expect(typeSelector.locator('option', { hasText: label })).toHaveCount(1);
    }
    await expect(typeSelector.locator('option', { hasText: 'Normal' })).toHaveCount(0);
    await expect(typeSelector.locator('option', { hasText: 'Mayorista' })).toHaveCount(0);
  });

  test('cambiar tipo de orden actualiza el selector', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await page.goto('/inventory/egress');
    await expect(page.getByText(EGRESS_HEADER)).toBeVisible();

    const typeSelector = page.getByRole('combobox', { name: 'Tipo' });
    await expect(typeSelector).toBeVisible();

    // Change to Ajuste (OrderType.Ajuste = 4)
    await typeSelector.selectOption('4');
    await expect(typeSelector).toHaveValue('4');

    // Change to Otro (OrderType.Otro = 100)
    await typeSelector.selectOption('100');
    await expect(typeSelector).toHaveValue('100');

    // Change back to Merma
    await typeSelector.selectOption('3');
    await expect(typeSelector).toHaveValue('3');
  });
});
