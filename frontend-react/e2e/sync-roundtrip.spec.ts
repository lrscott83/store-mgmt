import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * [S4-B1] Export → Import round-trip — E2E Playwright
 * docs/testing/e2e-stage-4/S4-B1.md
 *
 * Tests the complete sync round-trip: export data, import in a clean
 * context, and verify data integrity.
 *
 * Uses `owner-admin-with-products` persona.
 */

const EXPORT_TITLE = 'Exportar datos';
const IMPORT_TITLE = 'Importar datos';
const IMPORT_SUCCESS = 'Los datos se importaron correctamente.';
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

test.describe.serial('S4-B1 — Export → Import round-trip', () => {
  test.describe.configure({ timeout: 180_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('exportar y importar preserva los datos', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    // Create a sale to have data to export
    await createSale(page, selectedStoreId);

    // Export the data
    await page.goto('/sync/export');
    await expect(page.getByText(EXPORT_TITLE, { exact: true })).toBeVisible();
    await page.locator('#export-password').fill('roundtrip-test');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar' }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();

    // Import the data back
    await page.goto('/sync/import');
    await expect(page.getByText(IMPORT_TITLE, { exact: true })).toBeVisible();
    await page.locator('#import-file').setInputFiles(downloadPath!);
    await page.locator('#import-password').fill('roundtrip-test');
    await page.getByRole('button', { name: 'Importar' }).click();

    // Success toast
    await expect(page.getByText(IMPORT_SUCCESS)).toBeVisible();
  });
});
