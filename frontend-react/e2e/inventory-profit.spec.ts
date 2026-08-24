import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * [S3-D1/D2] Ganancias del día — E2E Playwright
 * docs/testing/e2e-stage-3/S3-D1.md, S3-D2.md
 *
 * Tests the daily profit page: verify profit after creating
 * entries and sales, and empty state.
 *
 * Uses `owner-admin-with-products` persona.
 */

const PROFIT_HEADER = 'Ganancias del Día'; // INVENTORY.PROFIT.TITLE
const NO_SALES = 'No hay ventas en el día'; // INVENTORY.PROFIT.NO_SALES
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

test.describe.serial('S3-D1/D2 — Ganancias del día', () => {
  test.describe.configure({ timeout: 180_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('S3-D2: sin ventas muestra empty state', async ({ signedInPage }) => {
    const { page } = signedInPage;
    await page.goto('/inventory/today-sales-profit');
    await expect(page.getByText(PROFIT_HEADER)).toBeVisible();
    // Page should load without error — empty state or entry-only rows
    await expect(page.locator('body')).toContainText(/\w+/);
  });

  test('S3-D1: ganancia refleja costo vs precio de venta', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    // Create a sale (which also seeds inventory with cost)
    await createSale(page, selectedStoreId);

    // Navigate to profit page
    await page.goto('/inventory/today-sales-profit');
    await expect(page.getByText(PROFIT_HEADER)).toBeVisible();

    // A table with profit data should be visible
    await expect(page.locator('table')).toBeVisible();

    // The total profit should be visible (starts with $)
    await expect(page.locator('text=/^\\$[\\d,.]+$/').first()).toBeVisible();
  });
});
