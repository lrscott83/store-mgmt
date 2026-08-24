import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * [S2-D2] Egreso de inventario (Venta Mayorista) — E2E Playwright
 * docs/testing/e2e-stage-2/S2-D2.md
 *
 * Tests the wholesale/egress sale screen: page loads with Mayorista
 * order type default, and the order type selector works.
 *
 * Uses `owner-admin-with-products` persona.
 */

const EGRESS_HEADER = 'Salida'; // INVENTORY_EGRESS.HEADER

test.describe.serial('S2-D2 — Egreso de inventario', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('la página de egresos carga con selector de tipo Mayorista', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await page.goto('/inventory/egress');
    await expect(page.getByText(EGRESS_HEADER)).toBeVisible();

    // The order type selector should be visible with "Tipo" label
    const typeSelector = page.getByRole('combobox', { name: 'Tipo' });
    await expect(typeSelector).toBeVisible();

    // Default should be Mayorista
    await expect(typeSelector).toHaveValue('2');
  });

  test('cambiar tipo de orden actualiza el selector', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await page.goto('/inventory/egress');
    await expect(page.getByText(EGRESS_HEADER)).toBeVisible();

    const typeSelector = page.getByRole('combobox', { name: 'Tipo' });
    await expect(typeSelector).toBeVisible();

    // Change to Normal
    await typeSelector.selectOption('1');
    await expect(typeSelector).toHaveValue('1');

    // Change back to Mayorista
    await typeSelector.selectOption('2');
    await expect(typeSelector).toHaveValue('2');
  });
});
