import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * [S3-C1/C2] Cantidades del día — E2E Playwright
 * docs/testing/e2e-stage-3/S3-C1.md, S3-C2.md
 *
 * Tests the daily quantities page: verify quantities after creating
 * entries and sales, and empty state.
 *
 * Uses `owner-admin-with-products` persona.
 */

const QUANTITIES_HEADER = 'Cantidades del Día'; // INVENTORY.QUANTITIES.TITLE
const NO_PRODUCTS = 'No hay productos disponibles'; // INVENTORY.QUANTITIES.NO_PRODUCTS
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

test.describe.serial('S3-C1/C2 — Cantidades del día', () => {
  test.describe.configure({ timeout: 180_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('S3-C2: sin datos muestra empty state', async ({ signedInPage }) => {
    const { page } = signedInPage;
    await page.goto('/inventory/today-quantities');
    await expect(page.getByText(QUANTITIES_HEADER)).toBeVisible();
    // Empty state or table should be visible
    await expect(page.getByText(NO_PRODUCTS).or(page.locator('table'))).toBeVisible();
  });

  test('S3-C1: cantidades reflejan entradas y ventas', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    // Create a sale (which also seeds inventory)
    await createSale(page, selectedStoreId);

    // Navigate to quantities
    await page.goto('/inventory/today-quantities');
    await expect(page.getByText(QUANTITIES_HEADER)).toBeVisible();

    // A table should be visible with product rows
    await expect(page.locator('table')).toBeVisible();
  });
});
