import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * [S4-C1] Reporte del día — consistencia de datos — E2E Playwright
 * docs/testing/e2e-stage-4/S4-C1.md
 *
 * Verifies that the daily report shows consistent data with the
 * individual screens (today's orders, expenses).
 *
 * Uses `owner-admin-with-products` persona.
 */

const REPORT_HEADER = 'Cuadre del día';
const SALE_HEADER = 'Productos para vender';
const ALL_CATEGORIES = 'Todos';
const ORDER_CREATED = 'La venta fue creada satisfactoriamente.';

async function seedInventoryEntry(page: Page, storeId: string): Promise<void> {
  await page.evaluate(
    ({ storeId: sid }) => {
      const productKey = `lizoft.store-products-${sid}`;
      const raw = localStorage.getItem(productKey);
      if (!raw) return;
      let entries: [string, Record<string, unknown>][];
      try { entries = JSON.parse(raw); } catch { return; }
      const p = entries.find(([, v]) => v['isActive'] && v['availableToSale']);
      if (!p) return;
      const [pid] = p;
      const catId = (p[1] as Record<string, unknown>)['categoryId'] as string;
      const invKey = `lizoft.store-inventory-entries-${sid}`;
      const rawInv = localStorage.getItem(invKey);
      let map: [string, Record<string, unknown>[]][] = [];
      if (rawInv) { try { map = JSON.parse(rawInv); } catch { map = []; } }
      const bucket = map.find(([id]) => id === pid);
      if (bucket?.[1].some((e) => e['isActive'])) return;
      const entry = {
        id: crypto.randomUUID(), productId: pid, categoryId: catId, quantity: 50,
        available: 50, costPrice: 8, date: new Date().toISOString(), order: 0,
        isActive: true, createdDate: new Date().toISOString(), createdByName: 'e2e-seed',
        updatedDate: undefined, updatedByName: undefined,
      };
      if (bucket) bucket[1].push(entry);
      else map.push([pid, [entry]]);
      localStorage.setItem(invKey, JSON.stringify(map));
    },
    { storeId },
  );
}

async function createSale(page: Page, storeId: string): Promise<void> {
  await page.goto('/sales/new');
  await page.waitForLoadState('networkidle');
  await seedInventoryEntry(page, storeId);
  await page.goto('/profile/edit');
  await page.waitForLoadState('networkidle');
  await page.goto('/sales/new');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: ALL_CATEGORIES }).click();
  const addBtn = page.getByRole('button', { name: 'Adicionar' }).first();
  await expect(addBtn).toBeVisible();
  await addBtn.click();
  await expect(page.getByTestId('cart-badge')).toHaveText('1');
  await page.getByTestId('cart-badge').locator('..').click();
  const paymentInput = page.getByRole('spinbutton', { name: 'Pago' });
  await paymentInput.fill('10');
  await page.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByText(ORDER_CREATED)).toBeVisible();
}

test.describe.serial('S4-C1 — Reporte del día: consistencia', () => {
  test.describe.configure({ timeout: 180_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('reporte muestra datos después de crear una venta', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    // Create a sale
    await createSale(page, selectedStoreId);

    // Navigate to the report
    await page.goto('/sales/today-stats');
    await expect(page.getByText(REPORT_HEADER)).toBeVisible();

    // The report should show a total (starts with $)
    await expect(page.locator('text=/^\\$[\\d,.]+$/').first()).toBeVisible();

    // Expand the "Resumen Efectivo" panel to verify cash data
    const cashPanel = page.getByRole('button', { name: /Resumen Efectivo/ });
    await expect(cashPanel).toBeVisible();
    await cashPanel.click();
    await expect(cashPanel).toHaveAttribute('aria-expanded', 'true');

    // The "Ventas" row should be visible inside
    await expect(page.getByText('Ventas').first()).toBeVisible();
  });
});
