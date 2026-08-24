import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * [S2-C2] Registrar pago de crédito — E2E Playwright
 * docs/testing/e2e-stage-2/S2-C2.md
 *
 * Tests the credit payment flow: pay a credit from today's credits.
 *
 * Uses `owner-admin-with-products` persona.
 */

const SALE_HEADER = 'Productos para vender';
const ALL_CATEGORIES = 'Todos';
const TODAY_CREDITS_HEADER = 'Créditos del día';
const ORDER_CREATED = 'La venta fue creada satisfactoramente.';
const PAYMENT_CONFIRM = 'Usted está segura(o) que desea pagar este crédito por venta?';

async function seedInventoryEntry(page: Page, storeId: string): Promise<void> {
  await page.evaluate(
    ({ storeId: sid }) => {
      const productKey = `lizoft.store-products-${sid}`;
      const rawProducts = localStorage.getItem(productKey);
      if (!rawProducts) return;
      let entries: [string, Record<string, unknown>][];
      try { entries = JSON.parse(rawProducts); } catch { return; }
      const p = entries.find(([, v]) => v['isActive'] && v['availableToSale']);
      if (!p) return;
      const [pid] = p;
      const invKey = `lizoft.store-inventory-entries-${sid}`;
      const raw = localStorage.getItem(invKey);
      let map: [string, Record<string, unknown>[]][] = [];
      if (raw) { try { map = JSON.parse(raw); } catch { map = []; } }
      const bucket = map.find(([id]) => id === pid);
      if (bucket?.[1].some((e) => e['isActive'])) return;
      const entry = {
        id: crypto.randomUUID(), productId: pid, categoryId: '', quantity: 100,
        available: 100, costPrice: 5, date: new Date().toISOString(), order: 0,
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

async function addProductAndOpenCart(page: Page, storeId: string): Promise<void> {
  await page.goto('/sales/new');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(SALE_HEADER)).toBeVisible();
  await seedInventoryEntry(page, storeId);
  await page.goto('/profile/edit');
  await page.waitForLoadState('networkidle');
  await page.goto('/sales/new');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(SALE_HEADER)).toBeVisible();
  await page.getByRole('button', { name: ALL_CATEGORIES }).click();
  const addBtn = page.getByRole('button', { name: 'Adicionar' }).first();
  await expect(addBtn).toBeVisible();
  await addBtn.click();
  await expect(page.getByTestId('cart-badge')).toHaveText('1');
  await page.getByTestId('cart-badge').locator('..').click();
}

async function createCreditSale(page: Page, clientName: string): Promise<void> {
  const creditSwitch = page.getByRole('switch', { name: 'Crédito' });
  await expect(creditSwitch).toBeVisible();
  await creditSwitch.click();
  const clientInput = page.getByRole('textbox', { name: 'Cliente' });
  await expect(clientInput).toBeVisible();
  await clientInput.fill(clientName);
  await page.getByRole('button', { name: 'Registrar' }).click();
  // Wait for the cart to close (badge resets to 0)
  await expect(page.getByTestId('cart-badge')).toHaveText('0');
}

test.describe.serial('S2-C2 — Registrar pago de crédito', () => {
  test.describe.configure({ timeout: 180_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('pagar un crédito desde Créditos del día', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    // Create a credit sale
    await addProductAndOpenCart(page, selectedStoreId);
    await createCreditSale(page, 'Pago Client');

    // Navigate to today's credits
    await page.goto('/sales/today-credits');
    await expect(page.getByText(TODAY_CREDITS_HEADER)).toBeVisible();

    // Click Pagar via the gear menu on the credit row
    const gearToggle = page.locator('[data-testid^="sale-credit-actions-toggle-"]').first();
    await expect(gearToggle).toBeVisible();
    await gearToggle.click();
    await page.getByRole('menuitem', { name: 'Pagar' }).click();

    // Payment modal should open
    await expect(page.getByText('Forma de Pago')).toBeVisible();

    // Submit payment
    await page.getByTestId('sale-credit-payment-submit').click();

    // Confirm dialog
    await expect(page.getByText(PAYMENT_CONFIRM)).toBeVisible();
    await page.getByRole('button', { name: 'Si' }).click();

    // Credit should be paid — the client name should still be visible
    await expect(page.getByText('Pago Client')).toBeVisible();
  });
});
