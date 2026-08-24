import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * [S2-B1] Crear venta (nueva orden) — E2E Playwright
 * docs/testing/e2e-stage-2/S2-B1.md
 *
 * Tests the core POS flow: add products to cart, create a cash sale,
 * verify the sale appears in today's orders, and test offline behavior.
 *
 * Uses `owner-admin-with-products` persona (zero extra logins — derived
 * from cached owner-admin session with seeded category + product).
 *
 * IMPORTANT: The seeded product has `discountFromInvantory: true` by default.
 * Since the OwnerAdmin has the Inventory module, the sale flow checks actual
 * inventory stock — but no inventory entries were seeded. Before selling, we
 * seed an inventory entry for the product via page.evaluate so the
 * availability check passes.
 */

// i18n literal strings from es.ts — hardcoded, never imported (design.md §5)
const SALE_HEADER = 'Productos para vender';
const REGISTER_TEXT = 'Registrar'; // SHOPPING_CART.REGISTER
const TODAY_ORDERS_HEADER = 'Ventas del día'; // TODAY_ORDERS.HEADER
const ORDER_CREATED_TEXT = 'La venta fue creada satisfactoriamente.'; // SHOPPING_CART.ORDER_CREATED
const EMPTY_CART_TEXT =
  'La venta no tiene ningún producto. Usted debe adicionar algún producto a la venta para pagar.'; // SHOPPING_CART.DON_NOT_PAY_EMPTY_CART
const ALL_CATEGORIES = 'Todos'; // SALES.ALL_CATEGORIES
const NO_ORDER_FOUND = 'No se ha realizado ninguna venta en el día de hoy.'; // TODAY_STATS.NO_ORDER_FOUND

/**
 * Seeds an inventory entry for the first sellable product in localStorage,
 * so the availability check passes during the sale. The entry gives the
 * product 100 units of available stock.
 */
async function seedInventoryEntry(page: Page, storeId: string): Promise<void> {
  await page.evaluate(
    ({ storeId: sid }) => {
      // Find the products key — plaintext format from the owner-admin-with-products persona
      const productKey = `lizoft.store-products-${sid}`;
      const rawProducts = localStorage.getItem(productKey);
      if (!rawProducts) return;

      // Parse the products (plaintext — seeded without DEK)
      let productsEntries: [string, Record<string, unknown>][];
      try {
        productsEntries = JSON.parse(rawProducts);
      } catch {
        return;
      }

      // Find the first sellable product
      const sellableProduct = productsEntries.find(
        ([, p]) => p['isActive'] && p['availableToSale'],
      );
      if (!sellableProduct) return;
      const [productId] = sellableProduct;

      // Read or initialize the inventory entries key
      // InventoryOfflineService uses Map-entries format: [[productId, InventoryEntry[]], ...]
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

      // Check if an entry already exists for this product
      const existingBucket = invMapEntries.find(([pid]) => pid === productId);
      if (existingBucket) {
        const hasActive = existingBucket[1].some((e) => e['isActive']);
        if (hasActive) return;
      }

      // Create a new inventory entry with 100 available units
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

/** Helper: navigate to sale page, seed inventory, add first product, open cart. */
async function addProductAndOpenCart(page: Page, storeId: string): Promise<void> {
  // First visit the sale page to ensure the SPA modules are loaded
  await page.goto('/sales/new');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(SALE_HEADER)).toBeVisible();

  // Seed inventory entry for the product
  await seedInventoryEntry(page, storeId);

  // Navigate away then back to force a full re-read of inventory from localStorage
  await page.goto('/profile/edit');
  await page.waitForLoadState('networkidle');
  await page.goto('/sales/new');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(SALE_HEADER)).toBeVisible();

  // Select "Todos" category
  await page.getByRole('button', { name: ALL_CATEGORIES }).click();

  // Add the first product to cart
  const addButton = page.getByRole('button', { name: 'Adicionar' }).first();
  await expect(addButton).toBeVisible();
  await addButton.click();

  // Verify cart badge updated
  const badge = page.getByTestId('cart-badge');
  await expect(badge).toHaveText('1');

  // Open cart dropdown
  await badge.locator('..').click();
}

test.describe.serial('S2-B1 — Crear venta', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('crear una venta de contado con 1 producto y verificar en Ventas del día', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    await addProductAndOpenCart(page, selectedStoreId);

    // Register button should be enabled
    const registerButton = page.getByRole('button', { name: REGISTER_TEXT });
    await expect(registerButton).toBeVisible();
    await expect(registerButton).toBeEnabled();

    // Fill payment amount (≥ product price of $10)
    const paymentInput = page.getByRole('spinbutton', { name: 'Pago' });
    await paymentInput.fill('10');

    // Submit the sale
    await registerButton.click();

    // Success toast should appear
    await expect(page.getByText(ORDER_CREATED_TEXT)).toBeVisible();

    // Cart should be cleared after successful sale
    const badge = page.getByTestId('cart-badge');
    await expect(badge).toHaveText('0');

    // Verify the sale appears in "Ventas del día" (same test context)
    await page.goto('/sales/today-orders');
    await expect(page.getByText(TODAY_ORDERS_HEADER)).toBeVisible();

    // The order list should NOT show the empty state
    await expect(page.getByText(NO_ORDER_FOUND)).toHaveCount(0);

    // The order should have the "Venta" label
    await expect(page.getByText('Venta')).toBeVisible();
  });

  test('crear venta sin productos muestra error', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await page.goto('/sales/new');
    await expect(page.getByText(SALE_HEADER)).toBeVisible();

    // Open the cart without adding any products
    const badge = page.getByTestId('cart-badge');
    await expect(badge).toBeVisible();
    await badge.locator('..').click();

    // Cart should show the empty-cart message
    await expect(page.getByText(EMPTY_CART_TEXT)).toBeVisible();

    // Register button should be disabled (itemCount === 0)
    const registerButton = page.getByRole('button', { name: REGISTER_TEXT });
    await expect(registerButton).toBeDisabled();
  });

  test('la operación funciona en modo offline', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    await addProductAndOpenCart(page, selectedStoreId);

    // Go offline AFTER products are loaded and cart has items
    await page.context().setOffline(true);

    // Cart should work offline — product is in localStorage
    const badge = page.getByTestId('cart-badge');
    await expect(badge).toHaveText('1');

    // Fill payment and submit
    const paymentInput = page.getByRole('spinbutton', { name: 'Pago' });
    await paymentInput.fill('10');

    const registerButton = page.getByRole('button', { name: REGISTER_TEXT });
    await expect(registerButton).toBeEnabled();
    await registerButton.click();

    // Success toast should appear (order is saved to localStorage, not server)
    await expect(page.getByText(ORDER_CREATED_TEXT)).toBeVisible();

    // Restore online state
    await page.context().setOffline(false);
  });

  test('los datos persisten tras recargar', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    // Create a sale first
    await addProductAndOpenCart(page, selectedStoreId);
    const registerButton = page.getByRole('button', { name: REGISTER_TEXT });
    await expect(registerButton).toBeEnabled();
    const paymentInput = page.getByRole('spinbutton', { name: 'Pago' });
    await paymentInput.fill('10');
    await registerButton.click();
    await expect(page.getByText(ORDER_CREATED_TEXT)).toBeVisible();

    // Navigate to today's orders
    await page.goto('/sales/today-orders');
    await expect(page.getByText(TODAY_ORDERS_HEADER)).toBeVisible();
    await expect(page.getByText(NO_ORDER_FOUND)).toHaveCount(0);

    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // The order should still be there after reload (localStorage persistence)
    await expect(page.getByText(TODAY_ORDERS_HEADER)).toBeVisible();
    await expect(page.getByText(NO_ORDER_FOUND)).toHaveCount(0);
  });
});
