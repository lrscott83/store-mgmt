import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * [S2-B2] Editar y eliminar órdenes — E2E Playwright
 * docs/testing/e2e-stage-2/S2-B2.md
 *
 * Tests the order edit/delete UI on the "Ventas del día" page.
 *
 * Uses `owner-admin-with-products` persona (has seeded products).
 *
 * IMPORTANT: Each test restores the pre-snapshot, so orders created
 * in test N are NOT visible in test N+1.
 */

// i18n literal strings from es.ts
const SALE_HEADER = 'Productos para vender'; // SALES.HEADER
const ALL_CATEGORIES = 'Todos'; // SALES.ALL_CATEGORIES
const TODAY_ORDERS_HEADER = 'Ventas del día'; // TODAY_ORDERS.HEADER
const ORDER_CREATED = 'La venta fue creada satisfactoriamente.'; // SHOPPING_CART.ORDER_CREATED
const DELETE_CONFIRM = '¿Está seguro que desea eliminar esta venta?'; // GENERAL.DELETE_CONFIRM_MESSAGE_A with TODAY_ORDERS.TEXT

/**
 * Seeds inventory so the availability check passes.
 */
async function seedInventoryEntry(page: Page, storeId: string): Promise<void> {
  await page.evaluate(
    ({ storeId: sid }) => {
      const productKey = `lizoft.store-products-${sid}`;
      const rawProducts = localStorage.getItem(productKey);
      if (!rawProducts) return;
      let productsEntries: [string, Record<string, unknown>][];
      try { productsEntries = JSON.parse(rawProducts); } catch { return; }
      const sellableProduct = productsEntries.find(([, p]) => p['isActive'] && p['availableToSale']);
      if (!sellableProduct) return;
      const [productId] = sellableProduct;
      const invKey = `lizoft.store-inventory-entries-${sid}`;
      const rawInv = localStorage.getItem(invKey);
      let invMapEntries: [string, Record<string, unknown>[]][] = [];
      if (rawInv) { try { invMapEntries = JSON.parse(rawInv); } catch { invMapEntries = []; } }
      const existingBucket = invMapEntries.find(([pid]) => pid === productId);
      if (existingBucket?.[1].some((e) => e['isActive'])) return;
      const newEntry = {
        id: crypto.randomUUID(), productId, categoryId: '', quantity: 100, available: 100,
        costPrice: 5, date: new Date().toISOString(), order: 0, isActive: true,
        createdDate: new Date().toISOString(), createdByName: 'e2e-seed',
        updatedDate: undefined, updatedByName: undefined,
      };
      if (existingBucket) existingBucket[1].push(newEntry);
      else invMapEntries.push([productId, [newEntry]]);
      localStorage.setItem(invKey, JSON.stringify(invMapEntries));
    },
    { storeId },
  );
}

/**
 * Create a sale and return to the sale page (for test setup).
 */
async function createSale(page: Page, storeId: string): Promise<void> {
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
  const paymentInput = page.getByRole('spinbutton', { name: 'Pago' });
  await paymentInput.fill('10');
  await page.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByText(ORDER_CREATED)).toBeVisible();
}

test.describe.serial('S2-B2 — Editar y eliminar órdenes', () => {
  test.describe.configure({ timeout: 180_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('editar una orden cambia el tipo de pago', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    // Create a sale first
    await createSale(page, selectedStoreId);

    // Navigate to today's orders
    await page.goto('/sales/today-orders');
    await expect(page.getByText(TODAY_ORDERS_HEADER)).toBeVisible();

    // Expand the first order
    const orderToggle = page.locator('[data-testid^="order-panel-toggle-"]').first();
    await expect(orderToggle).toBeVisible();
    await orderToggle.click();

    // Click Editar
    await page.getByTestId('edit-order-button').click();

    // EditOrderModal should open — change payment type to Tarjeta
    await expect(page.getByText('Venta por Cobrar')).toBeVisible();
    await page.getByRole('dialog').locator('label', { hasText: 'Tarjeta' }).click();

    // Save
    await page.getByRole('button', { name: 'Actualizar' }).click();

    // Modal should close
    await expect(page.getByText('Venta por Cobrar')).toHaveCount(0);
  });

  test('eliminar una orden la remueve de la lista', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    // Create a sale first
    await createSale(page, selectedStoreId);

    // Navigate to today's orders
    await page.goto('/sales/today-orders');
    await expect(page.getByText(TODAY_ORDERS_HEADER)).toBeVisible();

    // Expand the first order
    const orderToggle = page.locator('[data-testid^="order-panel-toggle-"]').first();
    await expect(orderToggle).toBeVisible();
    await orderToggle.click();

    // Click Eliminar
    await page.getByTestId('deactivate-order-button').click();

    // Confirm dialog should appear
    await expect(page.getByText(DELETE_CONFIRM)).toBeVisible();
    await page.getByRole('button', { name: 'Si' }).click();

    // The order should be removed — empty state should appear
    await expect(page.getByText('No se ha realizado ninguna venta en el día de hoy.')).toBeVisible();
  });
});
