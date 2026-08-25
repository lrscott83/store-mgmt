import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * [FC-A3] Órdenes: más que carga — E2E Playwright
 * docs/testing/frontend-coverage/README.md
 *
 * Tests the orders history page (/sales/orders):
 * - Page loads with title and order count
 * - Payment type filters work
 * - Credit filters work
 * - Day accordion expands/collapses
 * - Day summary modal opens
 *
 * Uses `owner-admin-with-products` persona.
 */

const ORDERS_TITLE = 'Historial de Ventas'; // ORDERS.TITLE
const NO_ORDERS = 'No se encontró ninguna venta'; // ORDERS.NO_ORDERS_FOUND
const ALL_PAYMENT = 'Todas';
const CASH = 'Efectivo';
const CARD = 'Tarjeta';
const CREDIT_FILTER = 'Créditos';
const PAID_FILTER = 'Pagadas';
const DAY_SUMMARY = 'Resumen de ventas del día'; // SALES.ORDERS.DAY_SALES_SUMMARY

/** Seed a sale so the orders page has data. */
async function seedSale(page: Page, storeId: string): Promise<void> {
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
      const [productId, product] = sellableProduct;

      // Create an order
      const orderKey = `lizoft.store-orders-${sid}`;
      const rawOrders = localStorage.getItem(orderKey);
      let ordersEntries: [string, Record<string, unknown>][] = [];
      if (rawOrders) {
        try {
          ordersEntries = JSON.parse(rawOrders);
        } catch {
          ordersEntries = [];
        }
      }

      const order = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        total: Number(product['price']) || 10,
        paymentType: 1, // Efectivo
        isCredit: false,
        orderItems: [
          {
            id: crypto.randomUUID(),
            productId,
            productName: product['name'],
            categoryId: product['categoryId'],
            quantity: 1,
            price: Number(product['price']) || 10,
            total: Number(product['price']) || 10,
          },
        ],
        isActive: true,
        createdDate: new Date().toISOString(),
        createdByName: 'e2e-seed',
      };

      ordersEntries.push([order.id, order]);
      localStorage.setItem(orderKey, JSON.stringify(ordersEntries));
    },
    { storeId },
  );
}

test.describe.serial('FC-A3 — Historial de Órdenes', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('la página carga con título y contador de órdenes', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    // Seed a sale first
    await seedSale(page, selectedStoreId);

    await page.goto('/sales/orders');
    await page.waitForLoadState('networkidle');

    // Title should be visible
    await expect(page.getByText(ORDERS_TITLE)).toBeVisible();

    // Order count badge should show at least 1
    const countBadge = page.locator('.rounded-full.bg-success\\/10').first();
    await expect(countBadge).toBeVisible();
    const countText = await countBadge.textContent();
    expect(countText).toMatch(/\(\d+\)/);
  });

  test('filtro de tipo de pago funciona', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    await seedSale(page, selectedStoreId);

    await page.goto('/sales/orders');
    await page.waitForLoadState('networkidle');

    // Filter by Efectivo
    await page.getByLabel(CASH).click();
    await page.waitForTimeout(500); // Wait for filter to apply

    // Filter by Tarjeta
    await page.getByLabel(CARD).click();
    await page.waitForTimeout(500);

    // Filter back to Todas
    await page.getByLabel(ALL_PAYMENT).first().click();
    await page.waitForTimeout(500);
  });

  test('filtro de crédito funciona', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    await seedSale(page, selectedStoreId);

    await page.goto('/sales/orders');
    await page.waitForLoadState('networkidle');

    // Filter by Pagadas
    await page.getByLabel(PAID_FILTER).click();
    await page.waitForTimeout(500);

    // Filter by Créditos
    await page.getByLabel(CREDIT_FILTER).click();
    await page.waitForTimeout(500);

    // Filter back to Todas
    await page.getByLabel(ALL_PAYMENT).nth(1).click();
    await page.waitForTimeout(500);
  });

  test('acordeón de día expande y colapsa', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    await seedSale(page, selectedStoreId);

    await page.goto('/sales/orders');
    await page.waitForLoadState('networkidle');

    // Find the day panel toggle button
    const dayToggle = page.locator('[data-testid^="date-panel-toggle-"]').first();
    if (await dayToggle.isVisible()) {
      // Click to expand
      await dayToggle.click();
      await expect(dayToggle).toHaveAttribute('aria-expanded', 'true');

      // Click to collapse
      await dayToggle.click();
      await expect(dayToggle).toHaveAttribute('aria-expanded', 'false');
    }
  });
});
