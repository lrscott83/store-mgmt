import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * [S2-C1] Crear crédito desde venta — E2E Playwright
 * docs/testing/e2e-stage-2/S2-C1.md
 *
 * Tests the credit sale flow: create a sale marked as credit,
 * verify it appears in today's credits, and test validation.
 *
 * Uses `owner-admin-with-products` persona (has seeded products).
 *
 * IMPORTANT: Each test restores the pre-snapshot, so credits created
 * in test N are NOT visible in test N+1.
 */

// i18n literal strings from es.ts
const SALE_HEADER = 'Productos para vender'; // SALES.HEADER
const ALL_CATEGORIES = 'Todos'; // SALES.ALL_CATEGORIES
const TODAY_CREDITS_HEADER = 'Créditos del día'; // SALE_CREDIT.TODAY_CREDITS
const ORDER_CREATED = 'La venta fue creada satisfactoriamente.'; // SHOPPING_CART.ORDER_CREATED
const CREDIT_WITHOUT_CLIENT =
  'Usted no puede realizar la venta por cobrar sin especificar el cliente.'; // SHOPPING_CART.DON_NOT_SALE_CREDIT_WITHOUT_CLIENT
const NO_CREDIT_FOUND = 'No existe ningún crédito en el día'; // SALE_CREDIT.NO_SALE_CREDIT_FOUND_IN_DAY

/**
 * Seeds an inventory entry so the availability check passes during the sale.
 * Reuses the exact pattern from create-sale.spec.ts.
 */
async function seedInventoryEntry(page: Page, storeId: string): Promise<void> {
  await page.evaluate(
    ({ storeId: sid }) => {
      const productKey = `lizoft.store-products-${sid}`;
      const rawProducts = localStorage.getItem(productKey);
      if (!rawProducts) return;

      let productsEntries: [string, Record<string, unknown>][];
      try {
        productsEntries = JSON.parse(rawProducts);
      } catch {
        return;
      }

      const sellableProduct = productsEntries.find(
        ([, p]) => p['isActive'] && p['availableToSale'],
      );
      if (!sellableProduct) return;
      const [productId] = sellableProduct;

      const invKey = `lizoft.store-inventory-entries-${sid}`;
      const rawInv = localStorage.getItem(invKey);
      let invMapEntries: [string, Record<string, unknown>[]][] = [];
      if (rawInv) {
        try {
          invMapEntries = JSON.parse(rawInv);
        } catch {
          invMapEntries = [];
        }
      }

      const existingBucket = invMapEntries.find(([pid]) => pid === productId);
      if (existingBucket) {
        const hasActive = existingBucket[1].some((e) => e['isActive']);
        if (hasActive) return;
      }

      const entryId = crypto.randomUUID();
      const newEntry = {
        id: entryId,
        productId,
        categoryId: '',
        quantity: 100,
        available: 100,
        costPrice: 5,
        date: new Date().toISOString(),
        order: 0,
        isActive: true,
        createdDate: new Date().toISOString(),
        createdByName: 'e2e-seed',
        updatedDate: undefined,
        updatedByName: undefined,
      };

      if (existingBucket) {
        existingBucket[1].push(newEntry);
      } else {
        invMapEntries.push([productId, [newEntry]]);
      }

      localStorage.setItem(invKey, JSON.stringify(invMapEntries));
    },
    { storeId },
  );
}

/**
 * Navigate to sale page, seed inventory, add first product, open cart.
 */
async function addProductAndOpenCart(page: Page, storeId: string): Promise<void> {
  await page.goto('/sales/new');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(SALE_HEADER)).toBeVisible();

  await seedInventoryEntry(page, storeId);

  // Navigate away then back to force re-read of inventory from localStorage
  await page.goto('/profile/edit');
  await page.waitForLoadState('networkidle');
  await page.goto('/sales/new');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(SALE_HEADER)).toBeVisible();

  // Select "Todos" category
  await page.getByRole('button', { name: ALL_CATEGORIES }).click();

  // Add the first product
  const addButton = page.getByRole('button', { name: 'Adicionar' }).first();
  await expect(addButton).toBeVisible();
  await addButton.click();

  // Verify badge shows 1
  await expect(page.getByTestId('cart-badge')).toHaveText('1');

  // Open cart dropdown
  await page.getByTestId('cart-badge').locator('..').click();
}

/**
 * Enable credit, fill client name, and submit.
 */
async function submitCreditSale(page: Page, clientName: string): Promise<void> {
  // Enable credit toggle
  const creditSwitch = page.getByRole('switch', { name: 'Crédito' });
  await expect(creditSwitch).toBeVisible();
  await creditSwitch.click();

  // Fill client name
  const clientInput = page.getByRole('textbox', { name: 'Cliente' });
  await expect(clientInput).toBeVisible();
  await clientInput.fill(clientName);

  // Click "Registrar"
  await page.getByRole('button', { name: 'Registrar' }).click();

  // Wait for success toast
  await expect(page.getByText(ORDER_CREATED)).toBeVisible();
}

test.describe.serial('S2-C1 — Crear crédito desde venta', () => {
  test.describe.configure({ timeout: 180_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('crear venta de crédito genera un crédito visible en Créditos del día', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    await addProductAndOpenCart(page, selectedStoreId);
    await submitCreditSale(page, 'Cliente Test');

    // Navigate to today's credits
    await page.goto('/sales/today-credits');
    await expect(page.getByText(TODAY_CREDITS_HEADER)).toBeVisible();

    // The credit should appear with the client name (not the empty state)
    await expect(page.getByText(NO_CREDIT_FOUND)).toHaveCount(0);
    await expect(page.getByText('Cliente Test')).toBeVisible();
  });

  test('crear venta de crédito sin nombre de cliente muestra error', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    await addProductAndOpenCart(page, selectedStoreId);

    // Enable credit toggle but leave client name empty
    const creditSwitch = page.getByRole('switch', { name: 'Crédito' });
    await expect(creditSwitch).toBeVisible();
    await creditSwitch.click();

    // Click Registrar without filling client name
    await page.getByRole('button', { name: 'Registrar' }).click();

    // Error dialog should appear
    await expect(page.getByText(CREDIT_WITHOUT_CLIENT)).toBeVisible();
  });

  test('la operación funciona correctamente en modo offline', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    await addProductAndOpenCart(page, selectedStoreId);

    // Go offline AFTER products are loaded and cart has items
    await page.context().setOffline(true);

    await submitCreditSale(page, 'Offline Client');

    // Restore online to navigate (SPA router needs initial load)
    await page.context().setOffline(false);

    // Navigate to today's credits
    await page.goto('/sales/today-credits');
    await expect(page.getByText(TODAY_CREDITS_HEADER)).toBeVisible();

    // The credit should appear (data persisted in localStorage)
    await expect(page.getByText('Offline Client')).toBeVisible();
  });
});
